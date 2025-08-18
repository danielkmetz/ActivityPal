// routes/live.js (refactored + extended logging + replay scoped by session window)
const router = require('express').Router();
const {
  IvsClient,
  CreateChannelCommand,
  CreateStreamKeyCommand,
  DeleteStreamKeyCommand,
  ListStreamKeysCommand,
  GetStreamCommand,
  GetChannelCommand,
  GetRecordingConfigurationCommand,
  StopStreamCommand,
} = require('@aws-sdk/client-ivs');
const { ListObjectsV2Command, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const LiveStream = require('../models/LiveStream');
const verifyToken = require('../middleware/verifyToken');
const { liveStreamS3Client: s3 } = require('../liveStreamS3Config');

const ivs = new IvsClient({ region: process.env.AWS_LIVE_STREAM_REGION });

/* ---------------------- logging helpers ---------------------- */
const nowIso = () => new Date().toISOString();
const short = (v, n = 10) => (typeof v === 'string' ? v.slice(-n) : v);
const genRid = (prefix = 'ls') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const redact = (obj) => {
  try {
    if (!obj || typeof obj !== 'object') return obj;
    const safe = JSON.parse(JSON.stringify(obj));
    const hide = (o) => {
      if (!o || typeof o !== 'object') return;
      for (const k of Object.keys(o)) {
        const lk = k.toLowerCase();
        if (['authorization', 'cookie', 'cookies'].includes(lk)) o[k] = '[REDACTED]';
        if (lk.includes('secret') || lk.includes('token') || lk.includes('password')) {
          if (typeof o[k] === 'string') o[k] = `***${short(o[k], 4)}`;
          else o[k] = '[REDACTED]';
        }
        if (typeof o[k] === 'object') hide(o[k]);
      }
    };
    hide(safe);
    return safe;
  } catch {
    return { note: 'redaction_failed' };
  }
};

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}

const mkLoggers = (rid) => {
  const base = `[live:${rid}]`;
  return {
    log: (msg, extra) => console.log(base, msg, extra !== undefined ? redact(extra) : ''),
    warn: (msg, extra) => console.warn(base, msg, extra !== undefined ? redact(extra) : ''),
    err: (msg, extra) => console.error(base, msg, extra !== undefined ? redact(extra) : ''),
  };
};

const timeAsync = async (label, fn, { log }) => {
  const t0 = Date.now();
  try {
    const out = await fn();
    log(`${label} ok`, { ms: Date.now() - t0 });
    return out;
  } catch (e) {
    log(`${label} err`, { ms: Date.now() - t0, err: e?.message });
    throw e;
  }
};

const sendIvs = async (name, cmd, { log }) => timeAsync(`ivs:${name}`, () => ivs.send(cmd), { log });
const sendS3 = async (name, cmd, { log }) => timeAsync(`s3:${name}`, () => s3.send(cmd), { log });

/* ---------------------- utils ---------------------- */
function parseChannelArn(arn) {
  // arn:aws:ivs:<region>:<accountId>:channel/<channelId>
  const parts = (arn || '').split(':');
  const accountId = parts[4];
  const resource = parts[5] || '';
  const channelId = resource.split('/')[1];
  return { accountId, channelId };
}

// Ensure base channel + a usable stream key/secret for host/place
async function ensureBaseWithKey({ hostUserId, placeId, recordingArn, log, warn }) {
  const wherePlace = { hostUserId, placeId, channelArn: { $exists: true } };
  const whereAny = { hostUserId, channelArn: { $exists: true } };

  let base =
    (await LiveStream.findOne(wherePlace).sort({ createdAt: -1 })) ||
    (await LiveStream.findOne(whereAny).sort({ createdAt: -1 }));

  if (!base) {
    log('no base channel found -> creating');
    const ch = await sendIvs('CreateChannel', new CreateChannelCommand({
      name: `ap-${hostUserId}-${placeId || 'no-place'}-${Date.now()}`,
      latencyMode: 'LOW',
      type: 'STANDARD',
      recordingConfigurationArn: recordingArn || undefined,
    }), { log });

    base = await LiveStream.create({
      hostUserId,
      placeId,
      channelArn: ch.channel.arn,
      ingestEndpoint: ch.channel.ingestEndpoint,
      playbackUrl: ch.channel.playbackUrl,
      streamKeyArn: ch.streamKey.arn,
      streamKeyLast4: ch.streamKey.value?.slice(-4),
      streamKeySecret: ch.streamKey.value, // encrypt at rest in prod
      status: 'idle',
      isActive: false,
      recording: { enabled: !!recordingArn },
    });

    log('created base channel', {
      channelArnTail: short(base.channelArn),
      ingestEndpoint: base.ingestEndpoint,
      last4: base.streamKeyLast4,
      recordingEnabled: !!base.recording?.enabled,
    });

    return base;
  }

  log('reusing base channel', {
    channelArnTail: short(base.channelArn),
    hasSecret: !!base.streamKeySecret,
    last4: base.streamKeyLast4 || null,
  });

  // rotate if either the arn or secret is missing
  if (!base.streamKeySecret || !base.streamKeyArn) {
    warn('missing key/secret -> rotating');
    const listed = await sendIvs('ListStreamKeys', new ListStreamKeysCommand({ channelArn: base.channelArn }), { log });
    const existingArn = listed?.streamKeys?.[0]?.arn || null;
    if (existingArn) {
      await sendIvs('DeleteStreamKey', new DeleteStreamKeyCommand({ arn: existingArn }), { log });
    }
    const created = await sendIvs('CreateStreamKey', new CreateStreamKeyCommand({ channelArn: base.channelArn }), { log });
    base.streamKeyArn = created.streamKey.arn;
    base.streamKeyLast4 = created.streamKey.value?.slice(-4);
    base.streamKeySecret = created.streamKey.value;
    await base.save();
    log('rotated stream key', { last4: base.streamKeyLast4 });
  }

  return base;
}

// Mark any dangling sessions ended
async function endDanglingSessions({ hostUserId, placeId = null, maxAgeMinutes = null, log }) {
  const q = { hostUserId, isActive: true };
  if (placeId !== null) q.placeId = placeId;
  if (maxAgeMinutes) q.startedAt = { $lt: new Date(Date.now() - maxAgeMinutes * 60 * 1000) };
  const res = await LiveStream.updateMany(q, {
    $set: { isActive: false, status: 'ended', endedAt: new Date() },
  });
  const count = res?.modifiedCount || 0;
  log('endDanglingSessions', { matched: res?.matchedCount, modified: count, query: q });
  return count;
}

async function isChannelOnline(channelArn) {
  try {
    const out = await ivs.send(new GetStreamCommand({ channelArn }));
    return !!out?.stream;
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    const offlineLike =
      msg.includes('not currently online') ||
      e?.name === 'ResourceNotFoundException' ||
      e?.$metadata?.httpStatusCode === 404;
    if (offlineLike) return false; // offline (expected), not an error
    throw e; // real error
  }
}

function parseIvsKeyTime(key) {
  if (!key) return null;
  const parts = key.split('/');
  // We expect ... / YYYY / M / D / HH / mm / rand / media / hls / master.m3u8
  if (parts.length < 13) return null;
  const L = parts.length;
  //                              -1            -2   -3    -4      -5     -6   -7   -8   -9
  const minute = +parts[L - 5];
  const hour = +parts[L - 6];
  const day = +parts[L - 7];
  const month = +parts[L - 8];
  const year = +parts[L - 9];
  if ([year, month, day, hour, minute].some(n => Number.isNaN(n))) {
    // Fallback: regex scan anywhere in the key (defensive)
    const m = key.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\/(\d{1,2})\/(\d{1,2})\//);
    if (!m) return null;
    const [, Y, Mo, D, H, Mi] = m.map(Number);
    if ([Y, Mo, D, H, Mi].some(n => Number.isNaN(n))) return null;
    return new Date(Date.UTC(Y, Mo - 1, D, H, Mi, 0, 0));
  }
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
}


/* ---------------------- endpoints ---------------------- */

/**
 * Optional bootstrap
 */
router.post('/streams/bootstrap', verifyToken, async (req, res) => {
  const rid = genRid('bootstrap');
  const { log, warn, err } = mkLoggers(rid);
  try {
    log('REQUEST', { at: nowIso(), user: req.user?.id, body: req.body });

    const { placeId = null, recording = false } = req.body || {};
    const hostUserId = req.user?.id;
    if (!hostUserId) return res.status(401).json({ message: 'Unauthorized' });

    const base = await ensureBaseWithKey({
      hostUserId,
      placeId,
      recordingArn: recording ? process.env.IVS_RECORDING_ARN : undefined,
      log, warn,
    });

    const payload = {
      id: base.id,
      channelArn: base.channelArn,
      ingestEndpoint: base.ingestEndpoint,
      playbackUrl: base.playbackUrl,
      recordingEnabled: !!base.recording?.enabled,
    };
    log('RESPONSE', { status: 200, payload: { ...payload, channelArn: `...${short(payload.channelArn)}` } });
    res.json(payload);
  } catch (e) {
    err('ERROR bootstrap', { msg: e?.message, stack: e?.stack });
    res.status(500).json({ message: 'Failed to create/get channel' });
  }
});

/**
 * Start live
 */
router.post('/live/start', verifyToken, async (req, res) => {
  const rid = genRid('start');
  const { log, warn, err } = mkLoggers(rid);
  try {
    log('REQUEST', { at: nowIso(), user: req.user?.id, body: req.body, query: req.query });

    const hostUserId = req.user?.id;
    if (!hostUserId) return res.status(401).json({ message: 'Unauthorized' });

    const requestedTitle = (req.body?.title || '').trim();
    const placeId = req.body?.placeId ?? null;

    const firstName = req.user?.firstName || req.user?.name || '';
    const title = requestedTitle || (firstName ? `Live with ${firstName}` : 'Live');

    const autoEnded = await endDanglingSessions({ hostUserId /*, placeId*/, log });

    const base = await ensureBaseWithKey({
      hostUserId,
      placeId,
      recordingArn: process.env.IVS_RECORDING_ARN || undefined,
      log, warn,
    });

    // if already live, optionally stop
    try {
      const liveNow = await isChannelOnline(base.channelArn);
      log('ivs live check', { liveNow, channelArnTail: short(base.channelArn) });
      if (liveNow) {
        await sendIvs('StopStream', new StopStreamCommand({ channelArn: base.channelArn }), { log });
        warn('force-stopped live IVS stream before new session');
      }
    } catch (e) {
      // Only logs on true errors (not the “offline” case)
      warn('ivs live check error', { err: e?.message });
    }

    const session = await LiveStream.create({
      channelArn: base.channelArn,
      ingestEndpoint: base.ingestEndpoint,
      playbackUrl: base.playbackUrl,
      streamKeyArn: base.streamKeyArn,
      streamKeyLast4: base.streamKeyLast4,
      hostUserId,
      placeId,
      title,
      status: 'live',
      isActive: true,
      startedAt: new Date(),
      recording: base.recording,
    });

    const rtmpsUrl = `rtmps://${base.ingestEndpoint}:443/app`;
    const resp = {
      ok: true,
      id: session.id,
      liveId: session.id,
      rtmpUrl: rtmpsUrl,
      streamKey: base.streamKeySecret, // don't log this
      playbackUrl: base.playbackUrl,
    };
    log('RESPONSE', {
      status: 200,
      payload: {
        ok: true,
        id: resp.id,
        liveId: resp.liveId,
        rtmpUrl: resp.rtmpUrl,
        playbackUrl: resp.playbackUrl,
        streamKeyLast4: short(base.streamKeySecret || '', 4),
        autoEnded,
      },
    });
    res.json(resp);
  } catch (e) {
    err('ERROR live/start', { msg: e?.message, stack: e?.stack });
    res.status(500).json({ message: 'Failed to start live' });
  }
});

/**
 * Stop live
 */
router.post('/live/stop', verifyToken, async (req, res) => {
  const rid = genRid('stop');
  const { log, warn, err } = mkLoggers(rid);
  try {
    log('REQUEST', { at: nowIso(), user: req.user?.id, body: req.body, query: req.query });

    const id = req.body?.id || req.body?.liveId;
    const forceStop = true;

    const hostUserId = req.user?.id;
    if (!hostUserId) return res.status(401).json({ message: 'Unauthorized' });
    if (!id) return res.status(400).json({ message: 'Missing id' });

    const ls = await LiveStream.findOne({ _id: id, hostUserId });
    if (!ls) {
      log('stop: doc not found', { id, hostUserId });
      return res.status(404).json({ message: 'Stream not found' });
    }

    log('stop: doc loaded', {
      id: String(ls._id),
      isActive: !!ls.isActive,
      status: ls.status,
      channelArnTail: short(ls.channelArn),
    });

    if (forceStop && ls.channelArn) {
      try {
        const status = await sendIvs('GetStream', new GetStreamCommand({ channelArn: ls.channelArn }), { log });
        if (status?.stream) {
          await sendIvs('StopStream', new StopStreamCommand({ channelArn: ls.channelArn }), { log });
          warn('StopStream called', { channelArnTail: short(ls.channelArn) });
        }
      } catch (e) {
        warn('StopStream failed', { err: e?.message });
      }
    }

    ls.isActive = false;
    ls.status = 'ended';
    ls.endedAt = new Date();
    await ls.save();
    log('stop: doc updated', { id: String(ls._id), isActive: !!ls.isActive, status: ls.status });

    res.json({ ok: true, id: ls.id, liveId: ls.id });
  } catch (e) {
    err('ERROR live/stop', { msg: e?.message, stack: e?.stack });
    res.status(500).json({ message: 'Failed to stop live' });
  }
});

/**
 * Live NOW
 */
router.get('/live/now', async (req, res) => {
  const rid = genRid('now');
  const { log, err } = mkLoggers(rid);
  try {
    log('REQUEST', { at: nowIso(), query: req.query });

    const { placeId, limit = 50, cursor } = req.query;
    const q = { isActive: true };
    if (placeId) q.placeId = placeId;

    const find = LiveStream.find(q).sort({ createdAt: -1 }).limit(Math.min(+limit, 100));
    if (cursor) find.where({ _id: { $lt: cursor } });

    const rows = await find.lean();
    log('RESPONSE', { status: 200, count: rows.length, nextCursor: rows.length ? rows[rows.length - 1]._id : null });
    res.json({
      items: rows,
      nextCursor: rows.length ? rows[rows.length - 1]._id : null,
    });
  } catch (e) {
    err('ERROR live/now', { msg: e?.message, stack: e?.stack });
    res.status(500).json({ message: 'Failed to list live streams' });
  }
});

/**
 * Status (owner-scoped)
 */
router.get('/live/status/:id', verifyToken, async (req, res) => {
  const rid = genRid('status');
  const { log, err } = mkLoggers(rid);
  try {
    log('REQUEST', { at: nowIso(), user: req.user?.id, params: req.params });

    const doc = await LiveStream.findOne({ _id: req.params.id, hostUserId: req.user?.id });
    if (!doc) {
      log('status: doc not found', { id: req.params.id });
      return res.status(404).json({ message: 'Not found' });
    }

    const status = await sendIvs('GetStream', new GetStreamCommand({ channelArn: doc.channelArn }), { log }).catch(() => null);
    const live = Boolean(status?.stream);
    log('RESPONSE', { status: 200, live, channelArnTail: short(doc.channelArn) });
    res.json({ live, status });
  } catch (e) {
    err('ERROR status', { msg: e?.message, stack: e?.stack });
    res.status(500).json({ message: 'Failed to fetch status' });
  }
});

/**
 * Public viewer
 */
router.get('/live/public/:id', async (req, res) => {
  const rid = genRid('public');
  const { log, err } = mkLoggers(rid);
  try {
    log('REQUEST', { at: nowIso(), params: req.params });

    const doc = await LiveStream.findById(req.params.id).lean();
    if (!doc) {
      log('public: not found', { id: req.params.id });
      return res.status(404).json({ message: 'Not found' });
    }

    const payload = {
      id: doc._id,
      title: doc.title || 'Live',
      playbackUrl: doc.playbackUrl,
      isActive: !!doc.isActive,
      placeId: doc.placeId || null,
    };
    log('RESPONSE', { status: 200, id: payload.id, isActive: payload.isActive });
    res.json(payload);
  } catch (e) {
    err('ERROR public', { msg: e?.message, stack: e?.stack });
    res.status(500).json({ message: 'Failed to fetch stream' });
  }
});

/**
 * Rotate stream key
 */
router.post('/live/rotate-key', verifyToken, async (req, res) => {
  const rid = genRid('rotate');
  const { log, warn, err } = mkLoggers(rid);
  try {
    log('REQUEST', { at: nowIso(), user: req.user?.id, body: req.body });

    const hostUserId = req.user?.id;
    const placeId = req.body?.placeId ?? null;
    if (!hostUserId) return res.status(401).json({ message: 'Unauthorized' });

    const base = await LiveStream.findOne({ hostUserId, placeId, channelArn: { $exists: true } });
    if (!base) {
      log('rotate: channel not found', { hostUserId, placeId });
      return res.status(404).json({ message: 'Channel not found' });
    }

    if (base.streamKeyArn) {
      await sendIvs('DeleteStreamKey', new DeleteStreamKeyCommand({ arn: base.streamKeyArn }), { log });
    }
    const created = await sendIvs('CreateStreamKey', new CreateStreamKeyCommand({ channelArn: base.channelArn }), { log });
    base.streamKeyArn = created.streamKey.arn;
    base.streamKeyLast4 = created.streamKey.value?.slice(-4);
    base.streamKeySecret = created.streamKey.value;
    await base.save();

    log('RESPONSE', { status: 200, last4: base.streamKeyLast4 });
    res.json({ ok: true, streamKeyLast4: base.streamKeyLast4 });
  } catch (e) {
    err('ERROR rotate-key', { msg: e?.message, stack: e?.stack });
    res.status(500).json({ message: 'Failed to rotate key' });
  }
});

/**
 * Replay discovery — now strictly scoped to the session window, and never attaches while live.
 */
router.get('/live/replay/:id', async (req, res) => {
  // prevent intermediary caching
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const rid = genRid('replay');
  const { log, warn, err } = mkLoggers(rid);

  try {
    const bucket = process.env.IVS_RECORD_BUCKET;
    const region = process.env.AWS_LIVE_STREAM_REGION;
    const useCF = !!process.env.CLOUDFRONT_DOMAIN;

    log('REQUEST', { at: nowIso(), params: req.params, env: { bucket: !!bucket, region, useCF } });

    const doc = await LiveStream.findById(req.params.id).lean();
    if (!doc) {
      log('replay: not found', { id: req.params.id });
      return res.status(404).json({ message: 'Not found' });
    }

    log('doc summary', {
      id: String(doc._id || ''),
      isActive: !!doc.isActive,
      status: doc.status,
      hasReplay: !!doc.replay,
      hasChannelArn: !!doc.channelArn,
      hostUserId: doc.hostUserId || null,
      startedAt: doc.startedAt || null,
      endedAt: doc.endedAt || null,
      ingestEndpoint: doc.ingestEndpoint || null,
    });

    // If already cached, return it
    if (doc?.replay?.ready && doc?.replay?.playbackUrl) {
      const payload = {
        ready: true,
        type: doc.replay.type || 'hls',
        playbackUrl: doc.replay.playbackUrl,
        durationSec: doc?.metrics?.durationSec || null,
        title: doc?.title || 'Live replay',
      };
      log('RESPONSE (cached)', { status: 200, playbackUrl: payload.playbackUrl });
      return res.json(payload);
    }

    if (!bucket) {
      warn('IVS_RECORD_BUCKET missing');
      return res.json({ ready: false });
    }
    if (!doc.channelArn) {
      warn('missing channelArn on doc');
      return res.json({ ready: false });
    }

    const { accountId, channelId } = parseChannelArn(doc.channelArn);
    if (!accountId || !channelId) {
      warn('invalid channelArn parse', { channelArn: doc.channelArn });
      return res.json({ ready: false });
    }
    log('parsed channel', { accountIdTail: (accountId || '').slice(-6), channelIdTail: (channelId || '').slice(-6) });

    const startedAt = doc.startedAt ? new Date(doc.startedAt) : null;
    let endedAt = doc.endedAt ? new Date(doc.endedAt) : null;

    if (!startedAt || Number.isNaN(+startedAt)) {
      warn('no valid startedAt; cannot window S3');
      return res.json({ ready: false });
    }

    // Check IVS live status; if live, never attach a replay
    let liveNow = false;
    try {
      liveNow = await isChannelOnline(doc.channelArn);
      log('live check before replay', { liveNow, isActive: !!doc.isActive, status: doc.status });
    } catch (e) {
      warn('live check errored; not attaching replay', { err: e?.message });
      return res.json({ ready: false });
    }
    if (liveNow) {
      // Best effort: stop live and proceed
      try { await sendIvs('StopStream', new StopStreamCommand({ channelArn: doc.channelArn }), { log }); }
      catch (e) { warn('best-effort StopStream during replay failed', { err: e?.message }); }
    }

    // Auto-finalize if IVS is offline but DB still "live"
    if (!endedAt && (doc.isActive || doc.status === 'live')) {
      const secondsSinceStart = (Date.now() - startedAt.getTime()) / 1000;
      if (secondsSinceStart >= 10) {
        const finalize = { $set: { isActive: false, status: 'ended', endedAt: new Date() } };
        const u = await LiveStream.updateOne({ _id: doc._id, isActive: true }, finalize);
        log('auto-finalized session', { matched: u.matchedCount, modified: u.modifiedCount, secondsSinceStart });
        endedAt = new Date();
      } else {
        log('offline but too soon to finalize', { secondsSinceStart });
        return res.json({ ready: false, live: false });
      }
    }

    // If we still don't have an endedAt, wait for /live/stop to set it
    if (!endedAt) return res.json({ ready: false, live: false });

    // Optional: verify recording config for visibility
    try {
      const ch = await sendIvs('GetChannel', new GetChannelCommand({ arn: doc.channelArn }), { log });
      log('recording config check', {
        hasRecordingArn: !!ch?.channel?.recordingConfigurationArn,
        recordingArnTail: short(ch?.channel?.recordingConfigurationArn),
      });
    } catch (e) {
      warn('recording config fetch failed', { err: e?.message });
    }

    // ---- S3 scan within session window ----
    const earliestAcceptable = new Date(startedAt.getTime() - 2 * 60 * 1000);
    const latestAcceptable = new Date(endedAt.getTime() + 10 * 60 * 1000); // +5m buffer

    let ContinuationToken;
    const candidates = [];
    let latestAny = null;

    do {
      const out = await sendS3('ListObjectsV2', new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `ivs/v1/${accountId}/${channelId}/`,
        MaxKeys: 1000,
        ContinuationToken,
      }), { log });

      const contents = out.Contents || [];
      for (const obj of contents) {
        if (!obj.Key.endsWith('/media/hls/master.m3u8')) continue;

        // Track newest master for diagnostics
        if (!latestAny || new Date(obj.LastModified) > new Date(latestAny.LastModified)) latestAny = obj;

        const lm = new Date(obj.LastModified);
        // Primary filter by LastModified (ground truth for when the master appeared)
        if (lm < earliestAcceptable || lm > latestAcceptable) continue;

        const keyTime = parseIvsKeyTime(obj.Key);

        candidates.push({ key: obj.Key, lm, keyTime });
      }

      ContinuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (ContinuationToken);

    // Prefer the earliest master by LastModified, with keyTime as a tiebreaker
    candidates.sort((a, b) => {
      const d = a.lm - b.lm;
      if (d !== 0) return d;
      // fall back to keyTime if both present
      if (a.keyTime && b.keyTime) return a.keyTime - b.keyTime;
      if (a.keyTime) return -1;
      if (b.keyTime) return 1;
      return 0;
    });
    const chosen = candidates[0] || null;

    if (!chosen && latestAny) {
      const latestKeyTime = parseIvsKeyTime(latestAny.Key);
      log('latest master (any window)', {
        latestTail: latestAny.Key.slice(-40),
        latestLM: latestAny.LastModified,
        latestKeyTime,
        earliestAcceptable,
        latestAcceptable,
      });
    }

    log('replay candidates (filtered)', {
      count: candidates.length,
      chosenTail: chosen ? chosen.key.slice(-40) : null,
      chosenKeyTime: chosen ? chosen.keyTime : null,
      chosenLM: chosen ? chosen.lm : null,
      earliestAcceptable,
      latestAcceptable,
    });

    if (!chosen) return res.json({ ready: false });

    // HEAD sanity (non-fatal)
    try {
      await sendS3('HeadObject', new HeadObjectCommand({ Bucket: bucket, Key: chosen.key }), { log });
    } catch (e) {
      warn('HEAD master failed', { keyTail: chosen.key.slice(-40), err: e?.name || e?.message });
    }

    try {
      // 1) Fetch master.m3u8 via SDK (IAM auth)
      const masterObj = await sendS3(
        'GetObject',
        new GetObjectCommand({ Bucket: bucket, Key: chosen.key }),
        { log }
      );
      const masterText = await streamToString(masterObj.Body);

      // 2) Find first variant "playlist.m3u8" line
      const variantRel = masterText.split('\n')
        .map(l => l.trim())
        .find(l => l && !l.startsWith('#') && l.endsWith('playlist.m3u8'));

      if (!variantRel) {
        warn('diag: master has no variant line', { keyTail: chosen.key.slice(-60) });
      } else {
        const prefix = chosen.key.replace(/\/master\.m3u8$/, '/');
        const variantKey = prefix + variantRel;
        const variantUrl = `https://${bucket}.s3.${region}.amazonaws.com/${variantKey}`;

        // 3) Anonymous HEAD to the public URL (what the phone will hit)
        const headVariant = await fetch(variantUrl, { method: 'HEAD' });
        log('diag: variant HEAD', {
          urlTail: variantUrl.slice(-100),
          status: headVariant.status,
          ct: headVariant.headers.get('content-type') || null
        });

        if (headVariant.ok) {
          // 4) If variant is good, peek the first segment in that playlist
          const variantObj = await sendS3(
            'GetObject',
            new GetObjectCommand({ Bucket: bucket, Key: variantKey }),
            { log }
          );
          const variantText = await streamToString(variantObj.Body);
          const segRel = variantText.split('\n')
            .map(l => l.trim())
            .find(l => l && !l.startsWith('#') && (l.endsWith('.ts') || l.endsWith('.m4s')));

          if (segRel) {
            // resolve relative to the variant folder
            const segKey = variantKey.replace(/\/[^/]+$/, '/') + segRel;
            const segUrl = `https://${bucket}.s3.${region}.amazonaws.com/${segKey}`;
            const headSeg = await fetch(segUrl, { method: 'HEAD' });
            log('diag: segment HEAD', {
              urlTail: segUrl.slice(-100),
              status: headSeg.status,
              ct: headSeg.headers.get('content-type') || null
            });
          } else {
            warn('diag: no segment lines in variant', { variantTail: variantKey.slice(-60) });
          }
        }
      }
    } catch (e) {
      warn('diag probe failed', { err: e?.message });
    }

    const playbackUrl = useCF
      ? `https://${process.env.CLOUDFRONT_DOMAIN}/${chosen.key}`
      : `https://${bucket}.s3.${region}.amazonaws.com/${chosen.key}`;

    // Persist replay; session is ended
    const update = {
      $set: {
        replay: {
          ready: true,
          type: 'hls',
          s3KeyPrefix: chosen.key.replace(/\/media\/hls\/master\.m3u8$/, ''),
          masterKey: chosen.key,
          playbackUrl,
        },
        status: 'ended',
        isActive: false,
        endedAt: doc.endedAt || endedAt || new Date(),
      },
    };
    const resUpdate = await LiveStream.updateOne({ _id: doc._id }, update);
    log('saved replay to doc', { matched: resUpdate.matchedCount, modified: resUpdate.modifiedCount });

    const payload = {
      ready: true,
      type: 'hls',
      playbackUrl,
      durationSec: doc?.metrics?.durationSec || null,
      title: doc?.title || 'Live replay',
    };

    try {
      // Fetch the master body
      const masterObj = await sendS3(
        'GetObject',
        new GetObjectCommand({ Bucket: bucket, Key: chosen.key }),
        { log }
      );

      const masterText = await streamToString(masterObj.Body);
      const variantLine = masterText.split('\n').find(l => l.endsWith('playlist.m3u8'));
      if (variantLine) {
        const variantKey = chosen.key.replace('master.m3u8', variantLine.trim());
        try {
          const headVariant = await sendS3(
            'HeadObject',
            new HeadObjectCommand({ Bucket: bucket, Key: variantKey }),
            { log }
          );
          log('variant HEAD ok', {
            variantTail: variantKey.slice(-60),
            status: 200,
            ct: headVariant.ContentType,
          });
        } catch (e) {
          warn('variant HEAD failed', { variantTail: variantKey.slice(-60), err: e?.name || e?.message });
        }
      }
    } catch (e) {
      warn('master fetch parse failed', { err: e?.message });
    }

    log('RESPONSE', { status: 200, playbackUrl });
    return res.json(payload);

  } catch (e) {
    err('ERROR /live/replay', { msg: e?.message, stack: e?.stack });
    return res.status(500).json({ message: 'Failed to fetch replay' });
  }
});

/**
 * Diagnose (quick)
 */
router.get('/live/replay/:id/diagnose', async (req, res) => {
  const rid = genRid('diag');
  const { log, err } = mkLoggers(rid);
  try {
    log('REQUEST', { at: nowIso(), params: req.params });

    const bucket = process.env.IVS_RECORD_BUCKET;
    const region = process.env.AWS_LIVE_STREAM_REGION;

    const doc = await LiveStream.findById(req.params.id).lean();
    if (!doc) {
      log('diag: not found', { id: req.params.id });
      return res.status(404).json({ message: 'Not found' });
    }

    const diag = {
      env: { bucket: !!bucket, region, cloudfront: process.env.CLOUDFRONT_DOMAIN || null },
      doc: {
        id: String(doc._id || ''),
        title: doc.title,
        isActive: !!doc.isActive,
        status: doc.status,
        channelArnTail: short(doc.channelArn),
        ingestEndpoint: doc.ingestEndpoint || null,
        replay: !!doc.replay,
        startedAt: doc.startedAt || null,
        endedAt: doc.endedAt || null,
      },
      channel: null,
      recordingConfig: null,
      latestMaster: null,
    };

    if (doc.channelArn && bucket) {
      try {
        const ch = await sendIvs('GetChannel', new GetChannelCommand({ arn: doc.channelArn }), { log });
        diag.channel = {
          arnTail: short(ch?.channel?.arn),
          name: ch?.channel?.name,
          type: ch?.channel?.type,
          latencyMode: ch?.channel?.latencyMode,
          recordingConfigurationArnTail: short(ch?.channel?.recordingConfigurationArn),
        };
        if (ch?.channel?.recordingConfigurationArn) {
          const rc = await sendIvs('GetRecordingConfiguration', new GetRecordingConfigurationCommand({ arn: ch.channel.recordingConfigurationArn }), { log });
          diag.recordingConfig = {
            arnTail: short(rc?.recordingConfiguration?.arn),
            state: rc?.recordingConfiguration?.state,
            bucketName: rc?.recordingConfiguration?.destinationConfiguration?.s3?.bucketName,
          };
        }
      } catch (e) {
        diag.channel = { error: e?.message };
      }

      try {
        const out = await sendS3('ListObjectsV2', new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: `ivs/v1/${parseChannelArn(doc.channelArn).accountId}/${parseChannelArn(doc.channelArn).channelId}/`,
          MaxKeys: 200
        }), { log });
        const candidates = (out.Contents || []).filter(o => o.Key.endsWith('/media/hls/master.m3u8'));
        candidates.sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
        diag.latestMaster = candidates[0]?.Key || null;
      } catch { }
    }

    log('RESPONSE', { status: 200, diagSummary: { channel: !!diag.channel, latestMasterTail: short(diag.latestMaster, 40) } });
    return res.json(diag);
  } catch (e) {
    err('ERROR diagnose', { msg: e?.message, stack: e?.stack });
    return res.status(500).json({ message: 'diagnose failed', error: e?.message });
  }
});

module.exports = router;

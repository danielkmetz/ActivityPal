const router = require('express').Router();
const {
  IvsClient,
  CreateChannelCommand,
  ListChannelsCommand,
  CreateStreamKeyCommand,
  ListStreamKeysCommand,
  DeleteStreamKeyCommand,
  GetStreamCommand,
  GetChannelCommand,
  GetRecordingConfigurationCommand,
  StopStreamCommand,
} = require('@aws-sdk/client-ivs');
const { ListObjectsV2Command, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const User = require('../models/User');
const LiveStream = require('../models/LiveStream');
const verifyToken = require('../middleware/verifyToken');
const { liveStreamS3Client: s3 } = require('../liveStreamS3Config');
const { resolveUserProfilePics } = require('../utils/userPosts');

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

/* ---------------------- ivs helpers (sessions only) ---------------------- */
const channelNameFor = (hostUserId, placeId) =>
  `ap-${String(hostUserId)}-${placeId ? String(placeId) : 'default'}`.slice(0, 128);

async function resolveChannel({ hostUserId, placeId, recordingArn, log, warn }) {
  // Try find channel by deterministic name; else create it (no DB writes).
  const name = channelNameFor(hostUserId, placeId);

  let arn, ingestEndpoint, playbackUrl, recordingEnabled = false;

  const listed = await sendIvs(
    'ListChannels',
    new ListChannelsCommand({ filterByName: name, maxResults: 1 }),
    { log }
  );

  if (listed?.channels?.length) {
    arn = listed.channels[0].arn;
    const ch = await sendIvs('GetChannel', new GetChannelCommand({ arn }), { log }).catch(() => null);
    ingestEndpoint = ch?.channel?.ingestEndpoint || '';
    playbackUrl = ch?.channel?.playbackUrl || '';
    recordingEnabled = !!ch?.channel?.recordingConfigurationArn;
    log('resolveChannel reuse', { name, channelArnTail: short(arn), ingestEndpoint, recordingEnabled });
  } else {
    const created = await sendIvs(
      'CreateChannel',
      new CreateChannelCommand({
        name,
        latencyMode: 'LOW',
        type: 'STANDARD',
        recordingConfigurationArn: recordingArn || undefined,
      }),
      { log }
    );

    arn = created?.channel?.arn;
    ingestEndpoint = created?.channel?.ingestEndpoint;
    playbackUrl = created?.channel?.playbackUrl;
    recordingEnabled = !!created?.channel?.recordingConfigurationArn;

    log('resolveChannel create', {
      name,
      channelArnTail: short(arn),
      ingestEndpoint,
      recordingEnabled
    });
  }

  if (!arn || !ingestEndpoint || !playbackUrl) {
    throw new Error('Failed to resolve IVS channel');
  }

  return { channelArn: arn, ingestEndpoint, playbackUrl, recordingEnabled };
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
    if (offlineLike) return false;
    throw e;
  }
}

async function freshStreamKey({ channelArn, log, warn, safeRotate = true }) {
  // Create and return a fresh key (with secret) for this start.
  // Optionally delete old keys when offline to avoid leakage.
  let liveNow = false;
  try { liveNow = await isChannelOnline(channelArn); } catch (e) { warn('live check failed before rotate', { err: e?.message }); }

  try {
    const listed = await sendIvs('ListStreamKeys', new ListStreamKeysCommand({ channelArn }), { log });
    const keys = listed?.streamKeys || [];

    // If offline and we want to avoid accumulating keys, delete existing ones
    if (safeRotate && !liveNow && keys.length) {
      for (const k of keys) {
        try { await sendIvs('DeleteStreamKey', new DeleteStreamKeyCommand({ arn: k.arn }), { log }); }
        catch (e) { warn('DeleteStreamKey failed', { arnTail: short(k.arn), err: e?.message }); }
      }
    }
  } catch (e) {
    warn('ListStreamKeys failed (continuing)', { err: e?.message });
  }

  const created = await sendIvs('CreateStreamKey', new CreateStreamKeyCommand({ channelArn }), { log });
  const keyArn = created?.streamKey?.arn;
  const keyVal = created?.streamKey?.value; // <-- ONLY TIME we see the secret

  if (!keyArn || !keyVal) throw new Error('Failed to create stream key');

  return { streamKeyArn: keyArn, streamKeySecret: keyVal, streamKeyLast4: keyVal.slice(-4) };
}

function parseChannelArn(arn) {
  // arn:aws:ivs:<region>:<accountId>:channel/<channelId>
  const parts = (arn || '').split(':');
  const accountId = parts[4];
  const resource = parts[5] || '';
  const channelId = resource.split('/')[1];
  return { accountId, channelId };
}

function parseIvsKeyTime(key) {
  if (!key) return null;
  const parts = key.split('/');
  if (parts.length < 13) return null;
  const L = parts.length;
  const minute = +parts[L - 5];
  const hour = +parts[L - 6];
  const day = +parts[L - 7];
  const month = +parts[L - 8];
  const year = +parts[L - 9];
  if ([year, month, day, hour, minute].some(n => Number.isNaN(n))) {
    const m = key.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\/(\d{1,2})\/(\d{1,2})\//);
    if (!m) return null;
    const [, Y, Mo, D, H, Mi] = m.map(Number);
    if ([Y, Mo, D, H, Mi].some(n => Number.isNaN(n))) return null;
    return new Date(Date.UTC(Y, Mo - 1, D, H, Mi, 0, 0));
  }
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
}

/* ---------------------- util: mark dangling sessions ended ---------------------- */
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

/* ---------------------- endpoints ---------------------- */

/**
 * Optional bootstrap — resolves/creates IVS channel; returns endpoints only; no DB writes.
 */
router.post('/streams/bootstrap', verifyToken, async (req, res) => {
  const rid = genRid('bootstrap');
  const { log, warn, err } = mkLoggers(rid);
  try {
    log('REQUEST', { at: nowIso(), user: req.user?.id, body: req.body });

    const { placeId = null, recording = false } = req.body || {};
    const hostUserId = req.user?.id;
    if (!hostUserId) return res.status(401).json({ message: 'Unauthorized' });

    const { channelArn, ingestEndpoint, playbackUrl, recordingEnabled } = await resolveChannel({
      hostUserId,
      placeId,
      recordingArn: recording ? process.env.IVS_RECORDING_ARN : undefined,
      log, warn,
    });

    const payload = {
      channelArn,
      ingestEndpoint,
      playbackUrl,
      recordingEnabled,
    };
    log('RESPONSE', { status: 200, payload: { ...payload, channelArn: `...${short(channelArn)}` } });
    res.json(payload);
  } catch (e) {
    err('ERROR bootstrap', { msg: e?.message, stack: e?.stack });
    res.status(500).json({ message: 'Failed to resolve channel' });
  }
});

/**
 * Start live — creates a session row (isActive=true). Does not persist key secret.
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

    // Clean up stale sessions (optional)
    const autoEnded = await endDanglingSessions({ hostUserId /*, placeId*/, log });

    // Resolve channel (no DB writes)
    const { channelArn, ingestEndpoint, playbackUrl, recordingEnabled } = await resolveChannel({
      hostUserId,
      placeId,
      recordingArn: process.env.IVS_RECORDING_ARN || undefined,
      log, warn,
    });

    // If channel is already live, stop it before starting a new session (belt & suspenders)
    try {
      const liveNow = await isChannelOnline(channelArn);
      log('ivs live check', { liveNow, channelArnTail: short(channelArn) });
      if (liveNow) {
        await sendIvs('StopStream', new StopStreamCommand({ channelArn }), { log });
        warn('force-stopped live IVS stream before new session');
      }
    } catch (e) {
      warn('ivs live check error', { err: e?.message });
    }

    // Idempotency: if an active session exists, return it (no new key).
    const active = await LiveStream.findOne({ hostUserId, placeId, isActive: true }).lean();
    if (active) {
      log('reusing existing active session', { id: String(active._id) });
      return res.json({
        ok: true,
        id: String(active._id),
        liveId: String(active._id),
        rtmpUrl: `rtmps://${ingestEndpoint}:443/app/`,
        // streamKey intentionally omitted (client already has it from the first start)
        streamKey: undefined,
        playbackUrl,
      });
    }

    // Fresh key for this session (do NOT save secret)
    const { streamKeyArn, streamKeySecret, streamKeyLast4 } = await freshStreamKey({
      channelArn,
      log, warn, safeRotate: true,
    });

    // Create the session doc (sessions only; aligns with LiveStreamSchema)
    let sessionDoc;
    try {
      sessionDoc = await LiveStream.findOneAndUpdate(
        { hostUserId, placeId, isActive: true },
        {
          $setOnInsert: {
            hostUserId,
            placeId,
            title,
            status: 'live',
            isActive: true,
            startedAt: new Date(),

            // snapshot channel data for this session (no separate base doc)
            channelArn,
            ingestEndpoint,
            playbackUrl,

            // key metadata only (NO secret)
            streamKeyArn,
            streamKeyLast4,

            // recording snapshot
            recording: { enabled: !!recordingEnabled },
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
    } catch (e) {
      if (e?.code !== 11000) throw e;
      sessionDoc = await LiveStream.findOne({ hostUserId, placeId, isActive: true }).lean();
      if (!sessionDoc) throw e;
      log('race detected — returned existing active', { id: String(sessionDoc._id) });
    }

    const rtmpsUrl = `rtmps://${ingestEndpoint}:443/app/`;
    const resp = {
      ok: true,
      id: String(sessionDoc._id),
      liveId: String(sessionDoc._id),
      rtmpUrl: rtmpsUrl,
      streamKey: streamKeySecret, // returned to client only; NOT persisted
      playbackUrl,
    };

    log('RESPONSE', {
      status: 200,
      payload: {
        ok: true,
        id: resp.id,
        liveId: resp.liveId,
        rtmpUrl: resp.rtmpUrl,
        playbackUrl: resp.playbackUrl,
        streamKeyLast4,
        autoEnded,
      },
    });

    return res.json(resp);
  } catch (e) {
    err('ERROR live/start', { msg: e?.message, stack: e?.stack });
    return res.status(500).json({ message: 'Failed to start live' });
  }
});

/**
 * Stop live — finalizes the session (isActive=false, status=ended)
 */
router.post('/live/stop', verifyToken, async (req, res) => {
  const rid = genRid('stop');
  const { log, warn, err } = mkLoggers(rid);
  try {
    log('REQUEST', { at: nowIso(), user: req.user?.id, body: req.body, query: req.query });

    const id = req.body?.id || req.body?.liveId;
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

    // Best-effort stop IVS stream
    if (ls.channelArn) {
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
 * Live NOW — list active sessions
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
 * Public viewer — public metadata for a session
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
      durationSec: doc.durationSec || null,
      recording: { enabled: !!doc?.recording?.enabled, vodUrl: doc?.recording?.vodUrl || null },
    };
    log('RESPONSE', { status: 200, id: payload.id, isActive: payload.isActive });
    res.json(payload);
  } catch (e) {
    err('ERROR public', { msg: e?.message, stack: e?.stack });
    res.status(500).json({ message: 'Failed to fetch stream' });
  }
});

/**
 * Rotate stream key — stateless against IVS; does not persist anything
 */
router.post('/live/rotate-key', verifyToken, async (req, res) => {
  const rid = genRid('rotate');
  const { log, warn, err } = mkLoggers(rid);
  try {
    log('REQUEST', { at: nowIso(), user: req.user?.id, body: req.body });

    const hostUserId = req.user?.id;
    const placeId = req.body?.placeId ?? null;
    if (!hostUserId) return res.status(401).json({ message: 'Unauthorized' });

    const { channelArn } = await resolveChannel({
      hostUserId, placeId, recordingArn: process.env.IVS_RECORDING_ARN || undefined, log, warn
    });

    // Be careful not to delete active keys while live.
    const liveNow = await isChannelOnline(channelArn).catch(() => false);
    if (!liveNow) {
      try {
        const listed = await sendIvs('ListStreamKeys', new ListStreamKeysCommand({ channelArn }), { log });
        for (const k of (listed?.streamKeys || [])) {
          try { await sendIvs('DeleteStreamKey', new DeleteStreamKeyCommand({ arn: k.arn }), { log }); }
          catch (e) { warn('DeleteStreamKey failed', { arnTail: short(k.arn), err: e?.message }); }
        }
      } catch (e) {
        warn('List/Delete keys failed', { err: e?.message });
      }
    }

    const created = await sendIvs('CreateStreamKey', new CreateStreamKeyCommand({ channelArn }), { log });
    const last4 = created?.streamKey?.value?.slice(-4) || null;

    log('RESPONSE', { status: 200, last4 });
    res.json({ ok: true, streamKeyLast4: last4 });
  } catch (e) {
    err('ERROR rotate-key', { msg: e?.message, stack: e?.stack });
    res.status(500).json({ message: 'Failed to rotate key' });
  }
});

/**
 * Replay discovery — windowed scan in S3; writes into recording.* on the session doc
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
      hasRecording: !!doc.recording,
      hasChannelArn: !!doc.channelArn,
      hostUserId: doc.hostUserId || null,
      startedAt: doc.startedAt || null,
      endedAt: doc.endedAt || null,
      ingestEndpoint: doc.ingestEndpoint || null,
    });

    // If already cached, return it
    if (doc?.recording?.vodUrl) {
      const payload = {
        ready: true,
        type: 'hls',
        playbackUrl: doc.recording.vodUrl,
        durationSec: doc?.durationSec || null,
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

    const startedAt = doc.startedAt ? new Date(doc.startedAt) : null;
    let endedAt = doc.endedAt ? new Date(doc.endedAt) : null;

    if (!startedAt || Number.isNaN(+startedAt)) {
      warn('no valid startedAt; cannot window S3');
      return res.json({ ready: false });
    }

    // Never attach replay while live; but we can best-effort StopStream then proceed
    let liveNow = false;
    try {
      liveNow = await isChannelOnline(doc.channelArn);
      log('live check before replay', { liveNow, isActive: !!doc.isActive, status: doc.status });
    } catch (e) {
      warn('live check errored; not attaching replay', { err: e?.message });
      return res.json({ ready: false });
    }
    if (liveNow) {
      try {
        await sendIvs('StopStream', new StopStreamCommand({ channelArn: doc.channelArn }), { log });
      } catch (e) {
        warn('best-effort StopStream during replay failed', { err: e?.message });
      }
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
    const earliestAcceptable = new Date(startedAt.getTime() - 30 * 1000);
    const latestAcceptable = new Date(endedAt.getTime() + 5 * 60 * 1000);

    let ContinuationToken;
    const masters = [];

    do {
      const out = await sendS3(
        'ListObjectsV2',
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: `ivs/v1/${accountId}/${channelId}/`,
          MaxKeys: 1000,
          ContinuationToken,
        }),
        { log }
      );

      for (const obj of (out.Contents || [])) {
        if (!obj.Key.endsWith('/media/hls/master.m3u8')) continue;
        const lm = new Date(obj.LastModified);
        if (lm < earliestAcceptable || lm > latestAcceptable) continue;
        const keyTime = parseIvsKeyTime(obj.Key);
        masters.push({ key: obj.Key, lm, keyTime });
      }

      ContinuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (ContinuationToken);

    // Pick best master for this session
    const startedAtMs = +startedAt;
    const endedAtMs = +endedAt;
    function score(m) {
      const penalizeEarly = (m.keyTime && (+m.keyTime < startedAtMs)) ? 1e15 : 0;
      const distToEnd = Math.abs(+m.lm - endedAtMs);
      return penalizeEarly + distToEnd;
    }
    masters.sort((a, b) => {
      const s = score(a) - score(b);
      if (s !== 0) return s;
      return (+b.lm - +a.lm) || ((a.keyTime && b.keyTime) ? (+b.keyTime - +a.keyTime) : 0);
    });

    const chosen = masters[0] || null;

    log('replay candidates (filtered)', {
      count: masters.length,
      chosenTail: chosen ? chosen.key.slice(-40) : null,
      chosenKeyTime: chosen ? chosen.keyTime : null,
      chosenLM: chosen ? chosen.lm : null,
      earliestAcceptable,
      latestAcceptable,
    });

    if (!chosen) return res.json({ ready: false });

    // VARIANT GATE
    try {
      const masterObj = await sendS3('GetObject', new GetObjectCommand({ Bucket: bucket, Key: chosen.key }), { log });
      const masterText = await streamToString(masterObj.Body);
      const variantRel = masterText
        .split('\n')
        .map(l => l.trim())
        .find(l => l && !l.startsWith('#') && l.endsWith('playlist.m3u8'));

      if (!variantRel) {
        log('diag: master has no variant line', { keyTail: chosen.key.slice(-60) });
        return res.json({ ready: false, status: 'warming_up' });
      }

      const variantKey = chosen.key.replace(/\/master\.m3u8$/, `/${variantRel}`);
      const variantUrl = `https://${bucket}.s3.${region}.amazonaws.com/${variantKey}`;
      const hv = await fetch(variantUrl, { method: 'HEAD' });
      log('diag: variant HEAD', { urlTail: variantUrl.slice(-100), status: hv.status, ok: hv.ok });

      if (!hv.ok) return res.json({ ready: false, status: 'warming_up' });
    } catch (e) {
      log('variant gate error', { err: e?.message });
      return res.json({ ready: false, status: 'warming_up' });
    }

    const playbackUrl = useCF
      ? `https://${process.env.CLOUDFRONT_DOMAIN}/${chosen.key}`
      : `https://${bucket}.s3.${region}.amazonaws.com/${chosen.key}`;

    // Persist into recording.* and finalize session
    const update = {
      $set: {
        recording: {
          enabled: !!doc?.recording?.enabled,
          vodUrl: playbackUrl,
          s3Key: chosen.key,
          // expiresAt: (optional) set if you lifecycle your VODs
        },
        status: 'ended',
        isActive: false,
        endedAt: doc.endedAt || endedAt || new Date(),
      },
    };
    const resUpdate = await LiveStream.updateOne({ _id: doc._id }, update);
    log('saved recording to doc', { matched: resUpdate.matchedCount, modified: resUpdate.modifiedCount });

    // (Optional) diag: HEAD a variant object
    try {
      const masterObj2 = await sendS3('GetObject', new GetObjectCommand({ Bucket: bucket, Key: chosen.key }), { log });
      const masterText2 = await streamToString(masterObj2.Body);
      const variantLine = masterText2.split('\n').find(l => l.endsWith('playlist.m3u8'));
      if (variantLine) {
        const variantKey = chosen.key.replace('master.m3u8', variantLine.trim());
        try {
          const headVariant = await sendS3('HeadObject', new HeadObjectCommand({ Bucket: bucket, Key: variantKey }), { log });
          log('variant HEAD ok', { variantTail: variantKey.slice(-60), status: 200, ct: headVariant.ContentType });
        } catch (e) {
          warn('variant HEAD failed', { variantTail: variantKey.slice(-60), err: e?.name || e?.message });
        }
      }
    } catch (e) {
      warn('master fetch parse failed', { err: e?.message });
    }

    const payload = {
      _id: doc._id,
      ready: true,
      type: 'hls',
      playbackUrl,
      durationSec: doc?.durationSec || null,
      title: doc?.title || 'Live replay',
    };

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
        recording: {
          enabled: !!doc?.recording?.enabled,
          vodUrl: doc?.recording?.vodUrl || null,
          s3Key: doc?.recording?.s3Key || null,
        },
        startedAt: doc.startedAt || null,
        endedAt: doc.endedAt || null,
        durationSec: doc.durationSec || null,
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

/**
 * Mark posted/visibility (session row)
 */
router.post('/live/:id/post', verifyToken, async (req, res) => {
  const rid = genRid('post');
  const { log, warn, err } = mkLoggers(rid);

  try {
    log('REQUEST', {
      at: nowIso(),
      user: req.user?.id,
      params: req.params,
      body: req.body
    });

    const hostUserId = req.user?.id;
    if (!hostUserId) {
      log('AUTH FAIL', { reason: 'Missing hostUserId' });
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const {
      isPosted: bodyIsPosted,
      visibility: bodyVisibility,
      postId: rawPostId,
      caption: rawCaption,                 // <-- NEW: caption from body
    } = req.body || {};

    const isPosted = (typeof bodyIsPosted === 'boolean') ? bodyIsPosted : true;
    log('PARSED isPosted', { bodyIsPosted, resolved: isPosted });

    const allowedVis = new Set(['public', 'followers', 'private', 'unlisted']);
    const visibility = bodyVisibility && allowedVis.has(bodyVisibility) ? bodyVisibility : undefined;
    log('PARSED visibility', { bodyVisibility, resolved: visibility });

    // Sanitize postId
    let linkedPostId = undefined;
    if (rawPostId !== undefined) {
      if (rawPostId === null || rawPostId === '') {
        linkedPostId = null;
      } else if (String(rawPostId).match(/^[a-f\d]{24}$/i)) {
        linkedPostId = rawPostId;
      } else {
        warn('Invalid postId', { rawPostId });
        return res.status(400).json({ message: 'Invalid postId' });
      }
    }
    log('PARSED postId', { rawPostId, resolved: linkedPostId });

    // Sanitize caption (trim; allow explicit clearing with null/"")
    // If you want to enforce a max length, add: .slice(0, 2000)
    let caption = undefined;
    if (rawCaption !== undefined) {
      if (rawCaption === null || (typeof rawCaption === 'string' && rawCaption.trim() === '')) {
        caption = null; // explicit clear
      } else if (typeof rawCaption === 'string') {
        caption = rawCaption.trim(); // save trimmed
      } else {
        warn('Invalid caption type', { typeof: typeof rawCaption });
        return res.status(400).json({ message: 'Invalid caption' });
      }
    }
    log('PARSED caption', { provided: rawCaption !== undefined, isNull: caption === null, len: typeof caption === 'string' ? caption.length : null });

    const doc = await LiveStream.findOne({ _id: id, hostUserId });
    if (!doc) {
      log('DOC NOT FOUND', { id, hostUserId });
      return res.status(404).json({ message: 'Stream not found' });
    }
    log('DOC FOUND', { docId: doc._id, current: { isPosted: doc.isPosted, visibility: doc.visibility, hasCaption: !!doc.caption } });

    const update = { $set: {} };
    update.$set.isPosted = !!isPosted;
    update.$set.savedToProfile = !!isPosted;
    if (visibility) update.$set.visibility = visibility;
    if (linkedPostId !== undefined) update.$set.sharedPostId = linkedPostId;
    if (caption !== undefined) update.$set.caption = caption; // <-- NEW: persist caption (can be string or null)

    log('UPDATE OBJECT', update);

    const before = {
      isPosted: !!doc.isPosted,
      savedToProfile: !!doc.savedToProfile,
      visibility: doc.visibility,
      linkedPostId: doc.sharedPostId || null,
      caption: doc.caption ?? null,
    };

    const updateResult = await LiveStream.updateOne({ _id: doc._id }, update);
    log('UPDATE RESULT', updateResult);

    const after = await LiveStream.findById(doc._id).lean();
    log('DOC AFTER UPDATE', { id: after._id, isPosted: after.isPosted, visibility: after.visibility, hasCaption: !!after.caption });

    let fullName = null;
    let profilePic = null;      // raw key/blob ref if you keep it
    let profilePicUrl = null;   // must come from resolver only

    try {
      if (typeof resolveUserProfilePic === 'function') {
        const p = await resolveUserProfilePic(hostUserId);
        if (p) {
          profilePic = p.profilePic ?? profilePic;
          profilePicUrl = p.profilePicUrl ?? null;
        }
        log('PROFILE RESOLVER (singular) OK', { hasUrl: !!profilePicUrl });
      } else {
        const profileMap = await resolveUserProfilePics([hostUserId]);
        const p = profileMap[hostUserId] || profileMap[String(hostUserId)];
        if (p) {
          profilePic = p.profilePic ?? profilePic;
          profilePicUrl = p.profilePicUrl ?? null;
        }
        log('PROFILE RESOLVER (plural) OK', { hasUrl: !!profilePicUrl });
      }
    } catch (e) {
      warn('PROFILE RESOLVER FAILED', { msg: e?.message });
    }

    // Fallback to User doc ONLY for name (and optionally raw key), NOT for URL
    try {
      const userDoc = await User.findById(hostUserId)
        .select('fullName firstName lastName profilePic')
        .lean();

      if (userDoc) {
        fullName =
          userDoc.fullName ||
          [userDoc.firstName, userDoc.lastName].filter(Boolean).join(' ') ||
          fullName;

        if (profilePic == null) profilePic = userDoc.profilePic ?? null;
      }
      log('USER DOC FALLBACK (name only)', { fullName, hasRawKey: !!profilePic, hasUrl: !!profilePicUrl });
    } catch (e) {
      warn('USER DOC LOOKUP FAILED', { msg: e?.message });
    }

    const date = after.endedAt || after.startedAt || after.createdAt || Date.now();
    const message = after.title || after.description || null;

    const liveStreamResponse = {
      _id: after._id,
      placeId: after.placeId || null,
      userId: String(hostUserId),
      fullName,
      message,
      caption: after.caption ?? null,       // <-- NEW: include caption in payload
      profilePic,
      profilePicUrl,
      taggedUsers: [],
      date,
      photos: [],
      type: 'liveStream',
      visibility: after.visibility || null,
      isPosted: !!after.isPosted || !!after.savedToProfile,
      postId: after.sharedPostId || null,
      playbackUrl: after.playbackUrl || null,
    };

    log('RESPONSE', {
      status: 200,
      before,
      after: {
        isPosted: !!after.isPosted,
        savedToProfile: !!after.savedToProfile,
        visibility: after.visibility,
        linkedPostId: after.sharedPostId || null,
        caption: after.caption ?? null,
      },
      payload: liveStreamResponse,
    });

    return res.json({ success: true, data: liveStreamResponse });
  } catch (e) {
    err('ERROR post', { msg: e?.message, stack: e?.stack });
    return res.status(500).json({ success: false, message: 'Failed to mark as posted' });
  }
});

// Unpost a live stream from the home feed
router.post('/live/:id/unpost', verifyToken, async (req, res) => {
  try {
    const hostUserId = req.user?.id;
    if (!hostUserId) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const removeLinkedPost =
      typeof req.body?.removeLinkedPost === 'boolean' ? req.body.removeLinkedPost : true;

    const doc = await LiveStream.findOne({ _id: id, hostUserId });
    if (!doc) return res.status(404).json({ message: 'Stream not found' });

    const update = {
      $set: { isPosted: false, savedToProfile: false },
    };
    if (removeLinkedPost) update.$unset = { sharedPostId: '' };

    await LiveStream.updateOne({ _id: doc._id }, update);
    const after = await LiveStream.findById(doc._id).lean();

    // Get user info for response
    let fullName = null;
    let profilePic = null;
    let profilePicUrl = null;

    try {
      if (typeof resolveUserProfilePic === 'function') {
        const p = await resolveUserProfilePic(hostUserId);
        if (p) {
          profilePic = p.profilePic ?? profilePic;
          profilePicUrl = p.profilePicUrl ?? null;
        }
      } else {
        const profileMap = await resolveUserProfilePics([hostUserId]);
        const p = profileMap[hostUserId] || profileMap[String(hostUserId)];
        if (p) {
          profilePic = p.profilePic ?? profilePic;
          profilePicUrl = p.profilePicUrl ?? null;
        }
      }
    } catch { }

    try {
      const userDoc = await User.findById(hostUserId)
        .select('fullName firstName lastName profilePic')
        .lean();
      if (userDoc) {
        fullName =
          userDoc.fullName ||
          [userDoc.firstName, userDoc.lastName].filter(Boolean).join(' ') ||
          fullName;
        if (profilePic == null) profilePic = userDoc.profilePic ?? null;
      }
    } catch { }

    const date = after.endedAt || after.startedAt || after.createdAt || Date.now();
    const message = after.title || after.description || null;

    const liveStreamResponse = {
      _id: after._id,
      placeId: after.placeId || null,
      userId: String(hostUserId),
      fullName,
      message,
      profilePic,
      profilePicUrl,
      taggedUsers: [],
      date,
      photos: [],
      type: 'liveStream',
      visibility: after.visibility || null,
      isPosted: false,
      postId: removeLinkedPost ? null : after.sharedPostId || null,
    };

    return res.json({ success: true, data: liveStreamResponse });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to unpost live stream' });
  }
});

// Edit caption on a posted live stream
router.patch('/live/:id/caption', verifyToken, async (req, res) => {
  try {
    const hostUserId = req.user?.id;
    if (!hostUserId) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    const { caption: rawCaption } = req.body || {};

    // Require the field to be present; allow null/"" to clear
    if (rawCaption === undefined) {
      return res.status(400).json({ message: 'caption is required in body' });
    }

    // Normalize caption
    let caption = null;
    if (rawCaption === null || (typeof rawCaption === 'string' && rawCaption.trim() === '')) {
      caption = null;
    } else if (typeof rawCaption === 'string') {
      caption = rawCaption.trim();
      // (Optional) enforce max length:
      // const MAX = 2000; caption = caption.slice(0, MAX);
    } else {
      return res.status(400).json({ message: 'Invalid caption' });
    }

    // Must be owner
    const doc = await LiveStream.findOne({ _id: id, hostUserId, isPosted: true });
    if (!doc) return res.status(404).json({ message: 'Stream not found' });

    // Update caption
    await LiveStream.updateOne({ _id: doc._id }, { $set: { caption } });
    const after = await LiveStream.findById(doc._id).lean();

    // Build response payload (consistent with your /post route)
    let fullName = null;
    let profilePic = null;
    let profilePicUrl = null;

    try {
      const profileMap = await resolveUserProfilePics([hostUserId]);
      const p = profileMap[hostUserId] || profileMap[String(hostUserId)] || {};
      profilePic = p.profilePic ?? profilePic;
      profilePicUrl = p.profilePicUrl ?? null;
    } catch { }

    try {
      const userDoc = await User.findById(hostUserId)
        .select('fullName firstName lastName profilePic')
        .lean();
      if (userDoc) {
        fullName =
          userDoc.fullName ||
          [userDoc.firstName, userDoc.lastName].filter(Boolean).join(' ') ||
          fullName;
        if (profilePic == null) profilePic = userDoc.profilePic ?? null;
      }
    } catch { }

    const date = after.endedAt || after.startedAt || after.createdAt || Date.now();
    const message = after.title || after.description || null;

    const payload = {
      _id: after._id,
      placeId: after.placeId || null,
      userId: String(hostUserId),
      fullName,
      message,
      caption: after.caption ?? null,   // updated value
      profilePic,
      profilePicUrl,
      taggedUsers: [],
      date,
      photos: [],
      type: 'liveStream',
      visibility: after.visibility || null,
      isPosted: !!after.isPosted || !!after.savedToProfile,
      postId: after.sharedPostId || null,
    };

    return res.json({ success: true, data: payload });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to update caption' });
  }
});

// Like/unlike a live stream post
router.post('/live/:id/like', verifyToken, async (req, res) => {
  const rid = genRid('like');
  const { log, warn, err } = mkLoggers(rid);

  try {
    log('REQUEST', { at: nowIso(), user: req.user?.id, params: req.params });

    const hostUserId = req.user?.id;
    if (!hostUserId) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;

    const doc = await LiveStream.findById(id);
    if (!doc) {
      log('like: not found', { id });
      return res.status(404).json({ message: 'Stream not found' });
    }

    // Check if user already liked
    const existing = doc.likes.find(like => String(like.userId) === String(hostUserId));

    if (existing) {
      // Unlike (remove like)
      doc.likes = doc.likes.filter(like => String(like.userId) !== String(hostUserId));
      await doc.save();
      log('unliked', { id, userId: hostUserId });
      return res.json({ success: true, liked: false, likesCount: doc.likes.length, likes: doc.likes });
    } else {
      // Like (add entry)
      const newLike = {
        userId: hostUserId,
        fullName:
          req.user?.fullName ||
          [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ') ||
          null,
        date: new Date(),
      };
      doc.likes.push(newLike);
      await doc.save();
      log('liked', { id, userId: hostUserId });
      return res.json({ success: true, liked: true, likesCount: doc.likes.length, likes: doc.likes });
    }
  } catch (e) {
    err('ERROR like', { msg: e?.message, stack: e?.stack });
    return res.status(500).json({ success: false, message: 'Failed to like/unlike stream' });
  }
});


module.exports = router;

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
const { getPresignedUrl } = require('../utils/cachePresignedUrl');

const ivs = new IvsClient({ region: process.env.AWS_LIVE_STREAM_REGION });

/* ---------------------- logging helpers ---------------------- */
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

async function getHostWire(hostUserId) {
  // DRY: centralized host shaping (name + presigned pic)
  const u = await User.findById(hostUserId)
    .select('firstName lastName profilePic')
    .lean();
  if (!u) return null;

  const photoKey = u.profilePic?.photoKey || u.profilePic?.key || null;

  let profilePicUrl = null;
  if (photoKey) {
    try { profilePicUrl = await getPresignedUrl(photoKey); } catch (_) {}
  }

  const firstName = u.firstName || '';
  const lastName  = u.lastName  || '';
  return {
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(' ').trim(),
    profilePicUrl,
  };
}

function shapeLiveWire(session, hostUserId, hostWire) {
  // One canonical wire shape used for both socket emits and REST response
  return {
    _id: String(session._id),
    hostUserId: String(hostUserId),
    title: session.title,
    placeId: session.placeId ?? null,
    playbackUrl: session.playbackUrl,
    createdAt: session.startedAt,          // keep UI sort consistent
    thumbnailUrl: session.thumbnailUrl || null,
    isActive: true,
    status: 'live',
    ...(hostWire ? { host: hostWire } : {}),
  };
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
  return count;
}

/* ---------------------- endpoints ---------------------- */

/**
 * Optional bootstrap — resolves/creates IVS channel; returns endpoints only; no DB writes.
 */
router.post('/streams/bootstrap', verifyToken, async (req, res) => {
  const rid = genRid('bootstrap');
  const { warn, err } = mkLoggers(rid);
  try {
    const { placeId = null, recording = false } = req.body || {};
    const hostUserId = req.user?.id;
    if (!hostUserId) return res.status(401).json({ message: 'Unauthorized' });

    const { channelArn, ingestEndpoint, playbackUrl, recordingEnabled } = await resolveChannel({
      hostUserId,
      placeId,
      recordingArn: recording ? process.env.IVS_RECORDING_ARN : undefined,
      warn,
    });

    const payload = {
      channelArn,
      ingestEndpoint,
      playbackUrl,
      recordingEnabled,
    };
    res.json(payload);
  } catch (e) {
    err('ERROR bootstrap', { msg: e?.message, stack: e?.stack });
    res.status(500).json({ message: 'Failed to resolve channel' });
  }
});

/**
 * Start live — creates a session row (isActive=true). Does not persist key secret.
 */
// routes/live.js (excerpt)
router.post('/live/start', verifyToken, async (req, res) => {
  const rid = genRid('start');
  const { warn } = mkLoggers(rid);

  try {
    const hostUserId = req.user?.id;
    if (!hostUserId) return res.status(401).json({ message: 'Unauthorized' });

    const rawTitle = (req.body?.title || '').trim();
    const placeId  = req.body?.placeId ?? null;
    const fallbackFirst = req.user?.firstName || req.user?.name || ''; // don’t shadow var later
    const title = rawTitle || (fallbackFirst ? `Live with ${fallbackFirst}` : 'Live');

    // 1) Auto-end any dangling sessions (emit ended in parallel)
    const autoEnded = await endDanglingSessions({ hostUserId }).catch(() => []);
    const liveBus = req.app.get('liveBus');
    if (liveBus && Array.isArray(autoEnded) && autoEnded.length) {
      await Promise.allSettled(autoEnded.map(id => liveBus.emitLiveEnded(id)));
    }

    // 2) Resolve channel + ensure not currently live
    const { channelArn, ingestEndpoint, playbackUrl, recordingEnabled } = await resolveChannel({
      hostUserId, placeId, recordingArn: process.env.IVS_RECORDING_ARN || undefined, warn,
    });

    try {
      if (await isChannelOnline(channelArn)) {
        await sendIvs('StopStream', new StopStreamCommand({ channelArn }));
        warn('Force-stopped IVS stream before new session');
      }
    } catch (e) {
      warn('IVS live check error', { err: e?.message });
    }

    // 3) Reuse active session if one exists for this host/place
    const existing = await LiveStream.findOne({ hostUserId, placeId, isActive: true }).lean();
    const rtmpsUrl = `rtmps://${ingestEndpoint}:443/app/`;

    if (existing) {
      if (liveBus) {
        const hostWire = await getHostWire(hostUserId).catch(() => null);
        await liveBus.emitLiveStarted({
          _id: String(existing._id),
          hostUserId: String(hostUserId),
          title: existing.title || title,
          placeId,
          playbackUrl,
          createdAt: existing.startedAt,
          isActive: true,
          status: 'live',
          ...(hostWire ? { host: hostWire } : {}),
        });
      }

      return res.json({
        ok: true,
        id: String(existing._id),
        liveId: String(existing._id),
        rtmpUrl: rtmpsUrl,
        streamKey: undefined, // client should have it from the first start
        playbackUrl,
        live: shapeLiveWire(existing, hostUserId, await getHostWire(hostUserId).catch(() => null)),
      });
    }

    // 4) Fresh key + create session
    const { streamKeyArn, streamKeySecret, streamKeyLast4 } = await freshStreamKey({
      channelArn, warn, safeRotate: true,
    });

    const session = await LiveStream.create({
      hostUserId,
      placeId,
      title,
      status: 'live',
      isActive: true,
      startedAt: new Date(),
      channelArn,
      ingestEndpoint,
      playbackUrl,
      streamKeyArn,
      streamKeyLast4,
      recording: { enabled: !!recordingEnabled },
    });

    // 5) Build host wire once (DRY + cached presign)
    const hostWire = await getHostWire(hostUserId).catch(() => null);

    // 6) Single canonical wire shape used for emit + response
    const wire = shapeLiveWire(session, hostUserId, hostWire);

    // 7) Emit without secrets
    if (liveBus) {
      await liveBus.emitLiveStarted(wire);
    }

    // 8) Respond (keep secrets on REST only)
    const resp = {
      ok: true,
      id: wire._id,
      liveId: wire._id,
      rtmpUrl: rtmpsUrl,
      streamKey: streamKeySecret, // REST only
      playbackUrl,
      live: wire,                 // convenience for immediate client upsert
    };

    return res.json(resp);
  } catch (e) {
    return res.status(500).json({ message: 'Failed to start live' });
  }
});

/**
 * Stop live — finalizes the session (isActive=false, status=ended)
 */
router.post('/live/stop', verifyToken, async (req, res) => {
  const rid = genRid('stop');
  const { warn, err } = mkLoggers(rid);
  try {
    const id = req.body?.id || req.body?.liveId;
    const hostUserId = req.user?.id;
    if (!hostUserId) return res.status(401).json({ message: 'Unauthorized' });
    if (!id) return res.status(400).json({ message: 'Missing id' });

    const ls = await LiveStream.findOne({ _id: id, hostUserId });
    if (!ls) {
      return res.status(404).json({ message: 'Stream not found' });
    }

    // Best-effort IVS stop
    if (ls.channelArn) {
      try {
        const status = await sendIvs('GetStream', new GetStreamCommand({ channelArn: ls.channelArn }));
        if (status?.stream) {
          await sendIvs('StopStream', new StopStreamCommand({ channelArn: ls.channelArn }));
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

    // in /live/stop route (after ls.save())
    try {
      const rid = genRid('stop');
      const bus = req.app.get('liveBus');
      if (bus) bus.emitLiveEnded(ls._id, { rid, userId: req.user?.id, source: 'route' });
      else console.warn('[live/stop] liveBus missing on app', { rid, liveId: String(ls._id) });
    } catch (e) {
      console.warn('[live/stop] emit failed', { err: e?.message });
    }

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
  const { err } = mkLoggers(rid);

  try {
    const { placeId, limit = 50, cursor } = req.query;
    const q = { isActive: true };
    if (placeId) q.placeId = placeId;

    const max = Math.min(Number(limit) || 50, 100);

    // 1) Find and populate ONLY name fields for host
    const find = LiveStream.find(q)
      .sort({ createdAt: -1 })
      .limit(max)
      .populate({
        path: 'hostUserId',
        select: 'firstName lastName', // keep this narrow; pics come from helper
      });

    if (cursor) find.where({ _id: { $lt: cursor } });

    const rows = await find.lean();

    // 2) Gather unique host ids (string form)
    const hostIds = Array.from(
      new Set(
        rows
          .map(r => (typeof r.hostUserId === 'object' ? r.hostUserId?._id : r.hostUserId))
          .filter(Boolean)
          .map(id => id.toString())
      )
    );

    // 3) Fetch presigned profilePicUrl for all hosts at once
    const picsById = hostIds.length ? await resolveUserProfilePics(hostIds) : {};

    // 4) Shape response: names from populate, pic URL from helper
    const items = rows.map((row) => {
      const hostDoc = (row.hostUserId && typeof row.hostUserId === 'object') ? row.hostUserId : null;
      const hostIdStr = (hostDoc?._id || row.hostUserId || '').toString();
      const picInfo = picsById[hostIdStr] || null;

      const firstName = hostDoc?.firstName || '';
      const lastName = hostDoc?.lastName || '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

      return {
        ...row,
        hostUserId: hostIdStr, // keep as id
        host: {
          firstName,
          lastName,
          fullName,
          profilePicUrl: picInfo?.profilePicUrl || null, // presigned url from helper
        },
      };
    });

    const nextCursor = items.length ? items[items.length - 1]._id : null;

    res.json({ items, nextCursor });
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
  const { err } = mkLoggers(rid);
  try {
    const doc = await LiveStream.findOne({ _id: req.params.id, hostUserId: req.user?.id });
    if (!doc) {
      return res.status(404).json({ message: 'Not found' });
    }

    const status = await sendIvs('GetStream', new GetStreamCommand({ channelArn: doc.channelArn })).catch(() => null);
    const live = Boolean(status?.stream);
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
  const { warn, err } = mkLoggers(rid);
  try {
    const hostUserId = req.user?.id;
    const placeId = req.body?.placeId ?? null;
    if (!hostUserId) return res.status(401).json({ message: 'Unauthorized' });

    const { channelArn } = await resolveChannel({
      hostUserId, placeId, recordingArn: process.env.IVS_RECORDING_ARN || undefined, warn
    });

    // Be careful not to delete active keys while live.
    const liveNow = await isChannelOnline(channelArn).catch(() => false);
    if (!liveNow) {
      try {
        const listed = await sendIvs('ListStreamKeys', new ListStreamKeysCommand({ channelArn }));
        for (const k of (listed?.streamKeys || [])) {
          try { await sendIvs('DeleteStreamKey', new DeleteStreamKeyCommand({ arn: k.arn })); }
          catch (e) { warn('DeleteStreamKey failed', { arnTail: short(k.arn), err: e?.message }); }
        }
      } catch (e) {
        warn('List/Delete keys failed', { err: e?.message });
      }
    }

    const created = await sendIvs('CreateStreamKey', new CreateStreamKeyCommand({ channelArn }));
    const last4 = created?.streamKey?.value?.slice(-4) || null;

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

  try {
    const bucket = process.env.IVS_RECORD_BUCKET;
    const region = process.env.AWS_LIVE_STREAM_REGION;
    const useCF = !!process.env.CLOUDFRONT_DOMAIN;

    const doc = await LiveStream.findById(req.params.id).lean();
    if (!doc) {
      return res.status(404).json({ message: 'Not found' });
    }

    // If already cached, return it
    if (doc?.recording?.vodUrl) {
      return res.json({
        ready: true,
        type: 'hls',
        playbackUrl: doc.recording.vodUrl,
        durationSec: doc?.durationSec || null,
        title: doc?.title || 'Live replay',
      });
    }

    if (!bucket || !doc.channelArn) {
      return res.json({ ready: false });
    }

    const { accountId, channelId } = parseChannelArn(doc.channelArn);
    if (!accountId || !channelId) {
      return res.json({ ready: false });
    }

    const startedAt = doc.startedAt ? new Date(doc.startedAt) : null;
    let endedAt = doc.endedAt ? new Date(doc.endedAt) : null;
    if (!startedAt || Number.isNaN(+startedAt)) {
      return res.json({ ready: false });
    }

    let liveNow = false;
    try {
      liveNow = await isChannelOnline(doc.channelArn);
    } catch {
      return res.json({ ready: false });
    }
    if (liveNow) {
      try {
        await sendIvs('StopStream', new StopStreamCommand({ channelArn: doc.channelArn }));
      } catch {}
    }

    if (!endedAt && (doc.isActive || doc.status === 'live')) {
      const secondsSinceStart = (Date.now() - startedAt.getTime()) / 1000;
      if (secondsSinceStart >= 10) {
        await LiveStream.updateOne(
          { _id: doc._id, isActive: true },
          { $set: { isActive: false, status: 'ended', endedAt: new Date() } }
        );
        endedAt = new Date();
      } else {
        return res.json({ ready: false, live: false });
      }
    }

    if (!endedAt) return res.json({ ready: false, live: false });

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
        })
      );

      for (const obj of out.Contents || []) {
        if (!obj.Key.endsWith('/media/hls/master.m3u8')) continue;
        const lm = new Date(obj.LastModified);
        if (lm < earliestAcceptable || lm > latestAcceptable) continue;
        const keyTime = parseIvsKeyTime(obj.Key);
        masters.push({ key: obj.Key, lm, keyTime });
      }

      ContinuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (ContinuationToken);

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
    if (!chosen) return res.json({ ready: false });

    // VARIANT GATE
    try {
      const masterObj = await sendS3(
        'GetObject',
        new GetObjectCommand({ Bucket: bucket, Key: chosen.key })
      );
      const masterText = await streamToString(masterObj.Body);
      const variantRel = masterText
        .split('\n')
        .map(l => l.trim())
        .find(l => l && !l.startsWith('#') && l.endsWith('playlist.m3u8'));

      if (!variantRel) {
        return res.json({ ready: false, status: 'warming_up' });
      }

      const variantKey = chosen.key.replace(/\/master\.m3u8$/, `/${variantRel}`);
      const variantUrl = `https://${bucket}.s3.${region}.amazonaws.com/${variantKey}`;
      const hv = await fetch(variantUrl, { method: 'HEAD' });
      if (!hv.ok) return res.json({ ready: false, status: 'warming_up' });
    } catch {
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
        },
        status: 'ended',
        isActive: false,
        endedAt: doc.endedAt || endedAt || new Date(),
      },
    };
    await LiveStream.updateOne({ _id: doc._id }, update);

    return res.json({
      _id: doc._id,
      ready: true,
      type: 'hls',
      playbackUrl,
      durationSec: doc?.durationSec || null,
      title: doc?.title || 'Live replay',
    });
  } catch (e) {
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
    const bucket = process.env.IVS_RECORD_BUCKET;
    const region = process.env.AWS_LIVE_STREAM_REGION;

    const doc = await LiveStream.findById(req.params.id).lean();
    if (!doc) {
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
  const { warn, err } = mkLoggers(rid);

  try {
    const hostUserId = req.user?.id;
    if (!hostUserId) {
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
    const allowedVis = new Set(['public', 'followers', 'private', 'unlisted']);
    const visibility = bodyVisibility && allowedVis.has(bodyVisibility) ? bodyVisibility : undefined;
    
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
    
    const doc = await LiveStream.findOne({ _id: id, hostUserId });
    if (!doc) {
      return res.status(404).json({ message: 'Stream not found' });
    }
    
    const update = { $set: {} };
    update.$set.isPosted = !!isPosted;
    update.$set.savedToProfile = !!isPosted;
    if (visibility) update.$set.visibility = visibility;
    if (linkedPostId !== undefined) update.$set.sharedPostId = linkedPostId;
    if (caption !== undefined) update.$set.caption = caption; // <-- NEW: persist caption (can be string or null)

    const updateResult = await LiveStream.updateOne({ _id: doc._id }, update);
    
    const after = await LiveStream.findById(doc._id).lean();
    
    let fullName = null;
    let profilePic = null;      // raw key/blob ref if you keep it
    let profilePicUrl = null;   // must come from resolver only

    try {
      if (typeof resolveUserProfilePics === 'function') {
        const p = await resolveUserProfilePics([hostUserId]);
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
      if (typeof resolveUserProfilePics === 'function') {
        const p = await resolveUserProfilePics([hostUserId]);
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
  try {
    const hostUserId = req.user?.id;
    if (!hostUserId) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;

    const doc = await LiveStream.findById(id);
    if (!doc) {
      return res.status(404).json({ message: 'Stream not found' });
    }

    // Check if user already liked
    const existing = doc.likes.find(like => String(like.userId) === String(hostUserId));

    if (existing) {
      // Unlike (remove like)
      doc.likes = doc.likes.filter(like => String(like.userId) !== String(hostUserId));
      await doc.save();
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
      return res.json({ success: true, liked: true, likesCount: doc.likes.length, likes: doc.likes });
    }
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Failed to like/unlike stream' });
  }
});


module.exports = router;

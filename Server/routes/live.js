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
const { shapeLiveForWire } = require('../utils/liveChat/shapeLiveForWire');

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

const noop = () => { };
function timeAsync(label, fn, { log } = {}) {
  const logger = typeof log === 'function' ? log : noop;
  const t0 = Date.now();
  return Promise.resolve()
    .then(fn)
    .then((res) => {
      logger(`${label}.ok`, { ms: Math.round(Date.now() - t0) });
      return res;
    })
    .catch((e) => {
      logger(`${label}.err`, { ms: Math.round(Date.now() - t0), msg: e?.message });
      throw e;
    });
}

const sendIvs = async (name, cmd, opts = {}) =>
  timeAsync(`ivs:${name}`, () => ivs.send(cmd), { log: opts.log });

const sendS3 = async (name, cmd, opts = {}) =>
  timeAsync(`s3:${name}`, () => s3.send(cmd), { log: opts.log });

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
    try { profilePicUrl = await getPresignedUrl(photoKey); } catch (_) { }
  }

  const firstName = u.firstName || '';
  const lastName = u.lastName || '';
  return {
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(' ').trim(),
    profilePicUrl,
  };
}

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

const extractViewerStats = (doc) => {
  const s  = doc?.stats || {};
  const m  = doc?.metrics || doc?.viewerStats || {};
  const rs = doc?.recording?.stats || {};
  const toInt = (v) => Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0;

  const uniqueViewers = toInt(
    s?.uniqueViewers ??
    doc?.uniqueViewers ??
    m?.uniqueViewers ?? m?.unique ??
    rs?.uniqueViewers ?? 0
  );
  const peakViewers = toInt(
    s?.viewerPeak ?? s?.peakViewers ??   // normalize name
    doc?.peakViewers ??
    m?.peakViewers ?? m?.peak ??
    rs?.peakViewers ?? 0
  );
  return { uniqueViewers, peakViewers };
};

// --------------------------------------------------------------------------

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
  try {
    const hostUserId = req.user?.id;
    if (!hostUserId) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    const rawTitle = (req.body?.title || '').trim();
    const placeId = req.body?.placeId ?? null;
    const fallbackFirst = req.user?.firstName || req.user?.name || '';
    const title = rawTitle || (fallbackFirst ? `Live with ${fallbackFirst}` : 'Live');

    // 1) Best-effort: auto-end any dangling sessions (ignore result)
    try { await endDanglingSessions({ hostUserId }); } catch { }

    const liveBus = req.app.get('liveBus');

    // 2) Resolve channel (safe without log/warn)
    let channelArn, ingestEndpoint, playbackUrl, recordingEnabled;
    try {
      const resolved = await resolveChannel({
        hostUserId,
        placeId,
        recordingArn: process.env.IVS_RECORDING_ARN || undefined,
      });
      ({ channelArn, ingestEndpoint, playbackUrl, recordingEnabled } = resolved || {});
    } catch {
      return res.status(500).json({ ok: false, message: 'Channel resolve failed' });
    }

    // Best-effort: ensure channel not already live
    try {
      if (await isChannelOnline(channelArn)) {
        await sendIvs('StopStream', new StopStreamCommand({ channelArn }));
      }
    } catch { }

    // 3) Reuse an existing active session (same host/place)
    const existing = await LiveStream.findOne({ hostUserId, placeId, isActive: true }).lean();
    const rtmpsUrl = `rtmps://${ingestEndpoint}:443/app/`;

    if (existing) {
      try {
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
      } catch { }

      return res.json({
        ok: true,
        id: String(existing._id),
        liveId: String(existing._id),
        rtmpUrl: rtmpsUrl,
        streamKey: undefined, // no secret on reuse
        playbackUrl,
        live: await shapeLiveForWire(existing).catch(() => ({
          _id: String(existing._id),
          hostUserId: String(hostUserId),
          title: existing.title || title,
          placeId,
          playbackUrl,
          createdAt: existing.startedAt,
          isActive: true,
          status: 'live',
        })),
      });
    }

    // 4) Fresh key + create session
    let streamKeyArn, streamKeySecret, streamKeyLast4;
    try {
      const key = await freshStreamKey({ channelArn, safeRotate: true });
      streamKeyArn = key.streamKeyArn;
      streamKeySecret = key.streamKeySecret; // REST only
      streamKeyLast4 = key.streamKeyLast4;
    } catch {
      return res.status(500).json({ ok: false, message: 'Failed to create stream key' });
    }

    let session;
    try {
      session = await LiveStream.create({
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
    } catch {
      return res.status(500).json({ ok: false, message: 'Failed to create session' });
    }

    // 5) Host wire (non-fatal if fails)
    let hostWire = null;
    try { hostWire = await getHostWire(hostUserId); } catch { }

    // 6) Canonical wire (IMPORTANT: await if async)
    let wire;
    try {
      wire = await shapeLiveForWire(session, hostUserId, hostWire);
    } catch {
      wire = {
        _id: String(session._id),
        hostUserId: String(hostUserId),
        title,
        placeId,
        playbackUrl,
        createdAt: session.startedAt,
        isActive: true,
        status: 'live',
        ...(hostWire ? { host: hostWire } : {}),
      };
    }

    // 7) Emit started (no secrets)
    try { if (liveBus) await liveBus.emitLiveStarted(wire); } catch { }

    // 8) Respond
    return res.json({
      ok: true,
      id: wire._id,
      liveId: wire._id,
      rtmpUrl: `rtmps://${ingestEndpoint}:443/app/`,
      streamKey: streamKeySecret, // return to client; not persisted
      playbackUrl,
      live: wire,
    });
  } catch {
    return res.status(500).json({ ok: false, message: 'Failed to start live' });
  }
});

/**
 * Stop live — finalizes the session (isActive=false, status=ended)
 */
router.post('/live/stop', verifyToken, async (req, res) => {
  const rid = genRid('stop');
  const { log, warn, err } = mkLoggers(rid);

  try {
    const liveId = req.body?.id || req.body?.liveId;
    const hostUserId = req.user?.id;
    if (!hostUserId) return res.status(401).json({ message: 'Unauthorized' });
    if (!liveId) return res.status(400).json({ message: 'Missing id' });

    // 1) Look up the stream, ensure ownership
    const ls = await LiveStream.findOne({ _id: liveId, hostUserId });
    if (!ls) return res.status(404).json({ message: 'Stream not found' });

    // 2) Best-effort IVS stop (safe to run even if already ended)
    if (ls.channelArn) {
      try {
        const status = await sendIvs('GetStream', new GetStreamCommand({ channelArn: ls.channelArn }, { log }));
        if (status?.stream) {
          await sendIvs('StopStream', new StopStreamCommand({ channelArn: ls.channelArn }, { log }));
          warn('StopStream called', { rid, channelArnTail: short(ls.channelArn) });
        }
      } catch (e) {
        warn('StopStream failed', { rid, err: e?.message });
      }
    }

    // 3) Finalize stats + mark ended via the bus (authoritative presence snapshot)
    const bus = req.app.get('liveBus');
    let stats = null;

    if (bus && typeof bus.finalizeStats === 'function') {
      // Idempotent: finalizeStats computes duration, writes status/isActive, stats, and cleans presence keys.
      stats = await bus.finalizeStats(String(ls._id));
      // Broadcast end to clients (both global and room)
      await bus.emitLiveEnded(String(ls._id));
    } else {
      warn('liveBus missing or finalizeStats not available', { rid, liveId: String(ls._id) });

      // Fallback: if bus missing, at least mark ended and approximate duration
      const endedAt = new Date();
      const durationSec = ls.startedAt ? Math.max(0, Math.round((endedAt - ls.startedAt) / 1000)) : (ls.durationSec || 0);

      const updated = await LiveStream.findByIdAndUpdate(
        ls._id,
        {
          $set: {
            status: 'ended',
            isActive: false,
            endedAt,
            durationSec,
          },
        },
        { new: true }
      ).lean();

      stats = {
        durationSec: updated?.durationSec || durationSec,
        viewerPeak: updated?.stats?.viewerPeak || 0,
        uniqueViewers: updated?.stats?.uniqueViewers || 0,
      };
    }

    // 4) Respond with the final stats (or at least the id)
    return res.json({
      ok: true,
      liveId: String(ls._id),
      stats: stats || null,
    });
  } catch (e) {
    err('ERROR live/stop', { msg: e?.message, stack: e?.stack });
    return res.status(500).json({ message: 'Failed to stop live' });
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
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  // -------------------- logging helpers --------------------
  const rid = `replay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
  res.set('X-Req-Id', rid);
  const DEBUG_MODE = String(req.query.debug || '') === '1';
  const dbg = [];
  const log = (event, meta = {}) => {
    const line = { rid, event, ...meta };
    dbg.push(line);
    try { console.log(JSON.stringify(line)); } catch { console.log(rid, event, meta); }
  };

  // -------------------- stat helpers -----------------------
  const toInt = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  };

  // Read from your canonical path (stats.*) and compatible fallbacks.
  const extractViewerStats = (doc) => {
    const s  = doc?.stats || {};
    const m  = doc?.metrics || doc?.viewerStats || {};
    const rs = doc?.recording?.stats || {};

    const uniqueViewers = toInt(
      s?.uniqueViewers ??
      doc?.uniqueViewers ??
      m?.uniqueViewers ?? m?.unique ??
      rs?.uniqueViewers ?? 0
    );

    const peakViewers = toInt(
      s?.viewerPeak ?? s?.peakViewers ??
      doc?.peakViewers ??
      m?.peakViewers ?? m?.peak ??
      rs?.peakViewers ?? 0
    );

    return { uniqueViewers, peakViewers };
  };

  // If both stats are zero, give a small grace to catch a just-written finalize.
  async function graceFetchStatsIfZero(docId, msBudget = 1200, step = 250) {
    let last = { uniqueViewers: 0, peakViewers: 0 };
    const deadline = Date.now() + msBudget;
    while (Date.now() < deadline && !(last.uniqueViewers || last.peakViewers)) {
      await new Promise(r => setTimeout(r, step));
      const fresh = await LiveStream.findById(docId)
        .select('stats metrics viewerStats recording.stats uniqueViewers peakViewers')
        .lean();
      last = extractViewerStats(fresh || {});
      log('grace.stats_check', { s: last });
    }
    return last;
  }

  try {
    const bucket = process.env.IVS_RECORD_BUCKET;
    const region = process.env.AWS_LIVE_STREAM_REGION;
    const useCF  = !!process.env.CLOUDFRONT_DOMAIN;
    log('env', { hasBucket: !!bucket, region, useCF });

    const doc = await LiveStream.findById(req.params.id).lean();
    if (!doc) {
      log('doc.not_found', { id: req.params.id });
      return res.status(404).json({ message: 'Not found', ...(DEBUG_MODE ? { debug: dbg } : {}) });
    }

    // Initial stats snapshot from DB
    let stats0 = extractViewerStats(doc);
    log('doc.loaded', {
      id: String(doc._id),
      status: doc.status,
      isActive: !!doc.isActive,
      hasVod: !!doc?.recording?.vodUrl,
      stats0
    });

    // If a VOD is already cached, return immediately (with stats)
    if (doc?.recording?.vodUrl) {
      const body = {
        _id: doc._id,
        id: String(doc._id),
        ready: true,
        type: 'hls',
        playbackUrl: doc.recording.vodUrl,
        durationSec: doc?.durationSec || null,
        title: doc?.title || 'Live replay',
        uniqueViewers: stats0.uniqueViewers,
        peakViewers: stats0.peakViewers,
      };
      log('return.cached_vod', { playbackUrl: body.playbackUrl, stats: { u: body.uniqueViewers, p: body.peakViewers } });
      if (DEBUG_MODE) body.debug = dbg;
      return res.json(body);
    }

    if (!bucket || !doc.channelArn) {
      log('return.not_ready.no_bucket_or_arn', { hasBucket: !!bucket, hasArn: !!doc.channelArn, stats: stats0 });
      const body = { ready: false, uniqueViewers: stats0.uniqueViewers, peakViewers: stats0.peakViewers };
      if (DEBUG_MODE) body.debug = dbg;
      return res.json(body);
    }

    const { accountId, channelId } = parseChannelArn(doc.channelArn);
    if (!accountId || !channelId) {
      log('return.not_ready.bad_arn', { channelArn: doc.channelArn });
      const body = { ready: false, uniqueViewers: stats0.uniqueViewers, peakViewers: stats0.peakViewers };
      if (DEBUG_MODE) body.debug = dbg;
      return res.json(body);
    }

    const startedAt = doc.startedAt ? new Date(doc.startedAt) : null;
    let endedAt     = doc.endedAt ? new Date(doc.endedAt) : null;
    if (!startedAt || Number.isNaN(+startedAt)) {
      log('return.not_ready.bad_startedAt', { startedAt: doc.startedAt });
      const body = { ready: false, uniqueViewers: stats0.uniqueViewers, peakViewers: stats0.peakViewers };
      if (DEBUG_MODE) body.debug = dbg;
      return res.json(body);
    }

    // IVS online check (best-effort)
    let liveNow = false;
    try {
      liveNow = await isChannelOnline(doc.channelArn);
      log('ivs.online_check', { liveNow });
    } catch (e) {
      log('ivs.online_check.error', { err: String(e) });
      const body = { ready: false, uniqueViewers: stats0.uniqueViewers, peakViewers: stats0.peakViewers };
      if (DEBUG_MODE) body.debug = dbg;
      return res.json(body);
    }
    if (liveNow) {
      try {
        await sendIvs('StopStream', new StopStreamCommand({ channelArn: doc.channelArn }));
        log('ivs.stop_issued', {});
      } catch (e) {
        log('ivs.stop_error', { err: String(e) });
      }
    }

    // If route needs to auto-finalize the session, also finalize STATS via bus.
    if (!endedAt && (doc.isActive || doc.status === 'live')) {
      const secondsSinceStart = (Date.now() - startedAt.getTime()) / 1000;
      log('live.maybe_finalize', { secondsSinceStart });
      if (secondsSinceStart >= 10) {
        await LiveStream.updateOne(
          { _id: doc._id, isActive: true },
          { $set: { isActive: false, status: 'ended', endedAt: new Date() } }
        );
        endedAt = new Date();
        log('live.finalized', { endedAt });

        // >>> NEW: finalize presence-based stats as we auto-end <<<
        try {
          const bus = req.app.get('liveBus');
          if (bus && typeof bus.finalizeStats === 'function') {
            const snap = await bus.finalizeStats(String(doc._id));
            log('auto_finalize.finalizeStats', snap || {});
          } else {
            log('auto_finalize.no_bus', {});
          }
        } catch (e) {
          log('auto_finalize.finalizeStats.error', { err: String(e) });
        }

        // Refresh stats after finalize attempt
        const fresh = await LiveStream.findById(doc._id)
          .select('stats metrics viewerStats recording.stats uniqueViewers peakViewers')
          .lean();
        stats0 = extractViewerStats(fresh || {});
        log('stats.after_auto_finalize', { stats0 });
      } else {
        log('return.not_ready.too_early', {});
        const body = { ready: false, live: false, uniqueViewers: stats0.uniqueViewers, peakViewers: stats0.peakViewers };
        if (DEBUG_MODE) body.debug = dbg;
        return res.json(body);
      }
    }

    if (!endedAt) {
      log('return.not_ready.no_endedAt', {});
      const body = { ready: false, live: false, uniqueViewers: stats0.uniqueViewers, peakViewers: stats0.peakViewers };
      if (DEBUG_MODE) body.debug = dbg;
      return res.json(body);
    }

    // -------------------- S3 scan in session window --------------------
    const earliestAcceptable = new Date(startedAt.getTime() - 30 * 1000);
    const latestAcceptable   = new Date(endedAt.getTime()   + 5 * 60 * 1000);
    log('s3.scan_window', { earliestAcceptable, latestAcceptable });

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
      const found = (out.Contents || []).filter(o => o.Key.endsWith('/media/hls/master.m3u8'));
      log('s3.page', { count: out.KeyCount, foundMasters: found.length, isTruncated: !!out.IsTruncated });

      for (const obj of out.Contents || []) {
        if (!obj.Key.endsWith('/media/hls/master.m3u8')) continue;
        const lm = new Date(obj.LastModified);
        if (lm < earliestAcceptable || lm > latestAcceptable) continue;
        const keyTime = parseIvsKeyTime(obj.Key);
        masters.push({ key: obj.Key, lm, keyTime });
      }
      ContinuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (ContinuationToken);

    log('s3.masters_collected', { count: masters.length });

    const startedAtMs = +startedAt;
    const endedAtMs   = +endedAt;
    const score = (m) => {
      const penalizeEarly = (m.keyTime && (+m.keyTime < startedAtMs)) ? 1e15 : 0;
      const distToEnd     = Math.abs(+m.lm - endedAtMs);
      return penalizeEarly + distToEnd;
    };

    masters.sort((a, b) => {
      const s = score(a) - score(b);
      if (s !== 0) return s;
      return (+b.lm - +a.lm) || ((a.keyTime && b.keyTime) ? (+b.keyTime - +a.keyTime) : 0);
    });

    const chosen = masters[0] || null;
    if (!chosen) {
      log('return.not_ready.no_master_found', {});
      const body = { ready: false, uniqueViewers: stats0.uniqueViewers, peakViewers: stats0.peakViewers };
      if (DEBUG_MODE) body.debug = dbg;
      return res.json(body);
    }
    log('s3.master_chosen', { key: chosen.key, lm: chosen.lm });

    // -------------------- VARIANT GATE --------------------
    try {
      const masterObj  = await sendS3('GetObject', new GetObjectCommand({ Bucket: bucket, Key: chosen.key }));
      const masterText = await streamToString(masterObj.Body);
      const variantRel = masterText
        .split('\n').map(l => l.trim())
        .find(l => l && !l.startsWith('#') && l.endsWith('playlist.m3u8'));

      if (!variantRel) {
        log('return.warming_up.no_variant', {});
        const body = { ready: false, status: 'warming_up', uniqueViewers: stats0.uniqueViewers, peakViewers: stats0.peakViewers };
        if (DEBUG_MODE) body.debug = dbg;
        return res.json(body);
      }

      const variantKey = chosen.key.replace(/\/master\.m3u8$/, `/${variantRel}`);
      const variantUrl = `https://${bucket}.s3.${region}.amazonaws.com/${variantKey}`;
      const hv = await fetch(variantUrl, { method: 'HEAD' });
      log('variant.head', { url: variantUrl, ok: hv.ok, status: hv.status });
      if (!hv.ok) {
        const body = { ready: false, status: 'warming_up', uniqueViewers: stats0.uniqueViewers, peakViewers: stats0.peakViewers };
        if (DEBUG_MODE) body.debug = dbg;
        return res.json(body);
      }
    } catch (e) {
      log('variant.error', { err: String(e) });
      const body = { ready: false, status: 'warming_up', uniqueViewers: stats0.uniqueViewers, peakViewers: stats0.peakViewers };
      if (DEBUG_MODE) body.debug = dbg;
      return res.json(body);
    }

    const playbackUrl = useCF
      ? `https://${process.env.CLOUDFRONT_DOMAIN}/${chosen.key}`
      : `https://${bucket}.s3.${region}.amazonaws.com/${chosen.key}`;

    // -------------------- Persist recording --------------------
    const updRes = await LiveStream.updateOne(
      { _id: doc._id },
      {
        $set: {
          recording: {
            enabled: !!doc?.recording?.enabled,
            vodUrl: playbackUrl,
            s3Key: chosen.key,
            // (optional) only if your schema has recording.stats.*
            // stats: { uniqueViewers: stats0.uniqueViewers, peakViewers: stats0.peakViewers },
          },
          status: 'ended',
          isActive: false,
          endedAt: doc.endedAt || endedAt || new Date(),
        },
      }
    );
    log('db.update_recording', { matched: updRes.matchedCount, modified: updRes.modifiedCount });

    // -------------------- Final stats (re-read + grace) --------------------
    let statsFinal = extractViewerStats(
      await LiveStream.findById(doc._id)
        .select('stats metrics viewerStats recording.stats uniqueViewers peakViewers recording.vodUrl status')
        .lean() || {}
    );

    if (!(statsFinal.uniqueViewers || statsFinal.peakViewers)) {
      statsFinal = await graceFetchStatsIfZero(doc._id);
    }
    log('stats.final', { statsFinal });

    // Optional debug readback
    const afterDoc = await LiveStream.findById(doc._id).select('recording stats').lean();
    log('doc.after_update', {
      hasRecording: !!afterDoc?.recording?.vodUrl,
      statsDot: { u: afterDoc?.stats?.uniqueViewers, p: afterDoc?.stats?.viewerPeak },
      recStats: { u: afterDoc?.recording?.stats?.uniqueViewers, p: afterDoc?.recording?.stats?.peakViewers },
    });

    // -------------------- Respond ready --------------------
    const body = {
      _id: doc._id,
      id: String(doc._id),
      ready: true,
      type: 'hls',
      playbackUrl,
      durationSec: doc?.durationSec || null,
      title: doc?.title || 'Live replay',
      uniqueViewers: statsFinal.uniqueViewers,
      peakViewers:   statsFinal.peakViewers,
    };
    log('return.ready', { playbackUrl: body.playbackUrl, stats: { u: body.uniqueViewers, p: body.peakViewers } });
    if (DEBUG_MODE) body.debug = dbg;
    return res.json(body);

  } catch (e) {
    log('route.error', { err: String(e) });
    return res.status(500).json({ message: 'Failed to fetch replay', ...(DEBUG_MODE ? { debug: dbg } : {}) });
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

const router = require('express').Router();
const LiveStream = require('../models/LiveStream');

// Security: require an API key header from the EventBridge Connection
function requireWebhookAuth(req, res, next) {
  const want = process.env.IVS_WEBHOOK_SECRET;
  if (!want) return next();
  const got = req.get('X-Api-Key') || req.get('x-api-key');
  if (!got || got !== want) return res.status(401).json({ ok: false, message: 'Unauthorized' });
  next();
}

router.post('/', requireWebhookAuth, async (req, res) => {
  try {
    const evt = req.body || {};
    if (evt.source !== 'aws.ivs' || evt['detail-type'] !== 'IVS Recording State Change') {
      return res.json({ ok: true, ignored: true });
    }

    const d = evt.detail || {};
    const channelArn = d.channel_arn || d.channelArn;
    const bucket     = d.recording_s3_bucket || process.env.IVS_RECORD_BUCKET || null;
    const prefix     = d.recording_s3_key_prefix || d.recordingS3KeyPrefix || null;
    const eventName  = d.event_name || d.recording_status || ''; // "Recording Start" / "Recording End" etc.
    const at         = evt.time ? new Date(evt.time) : new Date();

    if (!channelArn || !prefix) {
      return res.status(400).json({ ok: false, message: 'missing channelArn/prefix' });
    }

    // Normalize the HLS master path for your player
    const s3Key = prefix.endsWith('/') ? `${prefix}media/hls/master.m3u8`
                                       : `${prefix}/media/hls/master.m3u8`;

    // Grab the latest active (or most recent) session for this channel
    let session = await LiveStream.findOne({ channelArn })
      .sort({ startedAt: -1 });

    if (!session) {
      // No session found (rare but possible if out-of-band). Create a minimal placeholder.
      session = await LiveStream.create({
        hostUserId: null,
        title: 'Live',
        status: eventName.includes('End') ? 'ended' : 'live',
        isActive: !eventName.includes('End'),
        startedAt: at,
        channelArn,
        recording: { enabled: true },
      });
    }

    // Compute a publicly reachable VOD URL if you serve direct S3 or via CloudFront
    let vodUrl = null;
    if (process.env.CLOUDFRONT_DOMAIN) {
      vodUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/${s3Key}`;
    } else if (bucket && process.env.AWS_LIVE_STREAM_REGION) {
      vodUrl = `https://${bucket}.s3.${process.env.AWS_LIVE_STREAM_REGION}.amazonaws.com/${s3Key}`;
    }

    const ended = /end/i.test(eventName);
    const set = {
      'recording.enabled': true,
      'recording.s3Key': s3Key,
    };
    if (vodUrl) set['recording.vodUrl'] = vodUrl;
    if (ended) {
      set.status = 'ended';
      set.isActive = false;
      set.endedAt = session.endedAt || at;
      // optional: durationSec if startedAt is set
      if (session.startedAt) {
        set.durationSec = Math.max(0, Math.round((new Date(set.endedAt) - new Date(session.startedAt)) / 1000));
      }
    }

    await LiveStream.updateOne({ _id: session._id }, { $set: set });

    // Optionally tell sockets the stream ended (if you run your socket server in this process)
    try {
      const bus = req.app.get('liveBus');
      if (ended && bus && typeof bus.emitLiveEnded === 'function') {
        await bus.emitLiveEnded(String(session._id), { source: 'ivsWebhook' });
      }
    } catch {}

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, message: 'webhook failed' });
  }
});

module.exports = router;

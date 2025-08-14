const router = require('express').Router();
const { IvsClient, CreateChannelCommand, CreateStreamKeyCommand, GetStreamCommand, ListStreamsCommand } = require("@aws-sdk/client-ivs");
const LiveStream = require('../models/LiveStream');
const verifyToken = require('../middleware/verifyToken');

const ivs = new IvsClient({ region: process.env.AWS_LIVE_STREAM_REGION });

// Create channel for a business/host
router.post('/streams', verifyToken, async (req, res) => {
  const { title, placeId, recording = false } = req.body;
  // You might want to restrict who can create
  const hostUserId = req.user?.id || null;

  const channelRes = await ivs.send(new CreateChannelCommand({
    name: `ap-${Date.now()}`,
    latencyMode: "NORMAL", // or "NORMAL"
    type: "STANDARD",
    recordingConfigurationArn: recording ? process.env.IVS_RECORDING_ARN : undefined,
  }));

  const streamKeyRes = await ivs.send(new CreateStreamKeyCommand({
    channelArn: channelRes.channel.arn
  }));

  const doc = await LiveStream.create({
    channelId: channelRes.channel.arn,
    playbackUrl: channelRes.channel.playbackUrl,
    streamKeyId: streamKeyRes.streamKey.arn,
    hostUserId,
    placeId,
    title,
  });

  // IMPORTANT: Do NOT return the full stream key here to general clients.
  // For OBS onboarding you’ll deliver it via a secure creator portal or an admin flow.
  res.json({
    id: doc.id,
    channelArn: doc.channelId,
    playbackUrl: doc.playbackUrl,
    // omit stream key secret; store securely server-side
  });
});

// Mark active/stop (driven by webhook ideally, but manual toggle for MVP)
router.post('/start', verifyToken, async (req,res) => {
  const { id } = req.body;
  const ls = await LiveStream.findByIdAndUpdate(id, { isActive: true, startedAt: new Date() }, { new: true });
  res.json(ls);
});

router.post('/stop', verifyToken, async (req,res) => {
  const { id } = req.body;
  const ls = await LiveStream.findByIdAndUpdate(id, { isActive: false, endedAt: new Date() }, { new: true });
  res.json(ls);
});

// List active streams (for the Live rail)
router.get('/now', async (_req, res) => {
  const streams = await LiveStream.find({ isActive: true }).sort({ createdAt: -1 }).limit(50);
  res.json(streams);
});

// (Optional) sanity check live status from IVS
router.get('/status/:id', async (req, res) => {
  const doc = await LiveStream.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Not found' });
  const status = await ivs.send(new GetStreamCommand({ channelArn: doc.channelId }).catch(() => null));
  res.json({ live: Boolean(status?.stream), status });
});

module.exports = router;

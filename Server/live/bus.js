const LiveStream = require('../models/LiveStream');

function makeLiveBus({ nsp, presence, shapeLiveForWire, sanitizeLiveDoc }) {
  return {
    async emitLiveStarted(liveDoc) {
      try {
        const payload = liveDoc.host ? liveDoc : await shapeLiveForWire(liveDoc);
        nsp.emit('live:started', sanitizeLiveDoc(payload));
      } catch (e) {
        console.warn('[liveBus] live:started failed', e?.message);
      }
    },

    async emitLiveEnded(liveId) {
      try {
        // global + room broadcast (like your current code)
        nsp.emit('live:ended', { liveId });
        nsp.to(liveId).emit('live:ended', { liveId });
      } catch (e) {
        console.warn('[liveBus] live:ended failed', e?.message);
      }
    },

    /** Called by /live/stop or IVS webhook to persist stats + cleanup presence. */
    async finalizeStats(liveId) {
      try {
        const ls = await LiveStream.findById(liveId);
        if (!ls) return null;

        const endedAt = new Date();
        const durationSec = ls.startedAt
          ? Math.max(0, Math.round((endedAt - ls.startedAt) / 1000))
          : ls.durationSec;

        const snap = await presence.readSnapshot(liveId); // { current, unique, peak }

        await LiveStream.findByIdAndUpdate(liveId, {
          $set: {
            status: 'ended',
            isActive: false,
            endedAt,
            durationSec,
            'stats.viewerPeak': snap.peak || 0,
            'stats.uniqueViewers': snap.unique || 0,
          },
        });

        await presence.cleanup(liveId);
        return { durationSec, viewerPeak: snap.peak || 0, uniqueViewers: snap.unique || 0 };
      } catch (e) {
        console.warn('[liveBus] finalizeStats error', e?.message);
        return null;
      }
    },
  };
}

module.exports = { makeLiveBus };

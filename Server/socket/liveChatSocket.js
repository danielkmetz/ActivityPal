const { shapeLiveForWire } = require('../utils/liveChat/shapeLiveForWire');
const { registerHandlers } = require('../live/handlers');
const { sanitizeLiveDoc } = require('../utils/liveChat/sanitizeLiveDoc');
const { makeLiveBus } = require('../live/bus');
const { Presence } = require('../live/presence');

module.exports = function setupLiveNamespace(liveNamespace, { redis = null } = {}) {
  // 1) Presence manager (Redis optional; falls back to in-memory)
  const presence = new Presence({
    ioNamespace: liveNamespace,
    redis,
    debounceMs: 150,
  });

  // 2) Wire per-socket handlers
  liveNamespace.on('connection', (socket) => {
    registerHandlers({ nsp: liveNamespace, socket, presence });
  });

  // 3) Outbound bus for routes/webhooks
  const bus = makeLiveBus({
    nsp: liveNamespace,
    presence,
    shapeLiveForWire,
    sanitizeLiveDoc,
  });

  return bus;
};
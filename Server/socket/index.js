const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const nsDirectMessaging = require('./messagingSocket');

// OPTIONAL: Redis for multi-node presence + (optionally) socket adapter
// const { createAdapter } = require('@socket.io/redis-adapter');
// const { createClient } = require('redis');

function makeAuthMiddleware() {
  return (socket, next) => {
    try {
      const hdr = socket.handshake.headers?.authorization || '';
      const headerToken = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
      const token = socket.handshake.auth?.token || headerToken;
      if (!token) return next(new Error('No auth token'));

      const user = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = {
        id: String(user.id || user._id || user.sub || ''),
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicUrl: user.profilePicUrl,
        isHost: !!user.isHost,
      };
      next();
    } catch (err) {
      next(new Error('Unauthorized'));
    }
  };
}

/**
 * Attach Socket.IO to the HTTP server.
 * Returns { io, liveBus } so REST/webhook code can broadcast events.
 */
module.exports = async function attachSocketServer(httpServer, app) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.SIO_ORIGIN?.split(',') || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    // path: process.env.SIO_PATH || '/socket.io',
  });

  const authMiddleware = makeAuthMiddleware();

  // If you’re running multiple Node instances, you can enable the Redis adapter:
  // let pubClient, subClient;
  // if (process.env.REDIS_URL) {
  //   pubClient = createClient({ url: process.env.REDIS_URL });
  //   subClient = pubClient.duplicate();
  //   await pubClient.connect();
  //   await subClient.connect();
  //   io.adapter(createAdapter(pubClient, subClient));
  // }

  // Namespaces
  const dm = io.of('/dm');
  const live = io.of('/live');

  // Auth per-namespace
  dm.use(authMiddleware);
  live.use(authMiddleware);

  // Wire DM namespace (unchanged)
  nsDirectMessaging(dm);

  // Presence/Bus-backed Live namespace
  // If you’re using ioredis in presence.js, pass a client here instead of null.
  // For example:
  // const Redis = require('ioredis');
  // const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
  // const liveBus = setupLiveNamespace(live, { redis });

  // (Optional) root namespace
  io.on('connection', () => { /* no-op */ });

  // Make them available to the rest of the app (handy in routes/webhooks)
  if (app) {
    app.set('io', io);
  }

  return { io };
};

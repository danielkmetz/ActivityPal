// socket/index.js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const nsDirectMessaging = require('./messagingSocket');
const setupLiveNamespace = require('./liveChatSocket'); // <-- make this return a bus (see note below)

function makeAuthMiddleware() {
  return (socket, next) => {
    try {
      // Support either Authorization header or handshake.auth.token
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
      return next();
    } catch (err) {
      return next(new Error('Unauthorized'));
    }
  };
}

/**
 * Attach Socket.IO to the HTTP server.
 * Returns { io, liveBus } so REST/webhook code can broadcast events.
 */
module.exports = function attachSocketServer(httpServer) {
  const io = new Server(httpServer, {
    // If you customize client path, set it here and in the client:
    // path: process.env.SIO_PATH || '/socket.io',
    cors: {
      origin: process.env.SIO_ORIGIN?.split(',') || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // If you run multiple Node instances, plug in a shared adapter (e.g., Redis):
  // const { createAdapter } = require('@socket.io/redis-adapter');
  // const { createClient } = require('redis');
  // const pubClient = createClient({ url: process.env.REDIS_URL });
  // const subClient = pubClient.duplicate();
  // await pubClient.connect(); await subClient.connect();
  // io.adapter(createAdapter(pubClient, subClient));

  const authMiddleware = makeAuthMiddleware();

  // Namespaces
  const dm = io.of('/dm');
  const live = io.of('/live');

  // Auth on namespaces
  dm.use(authMiddleware);
  live.use(authMiddleware);

  // Wire namespace modules
  nsDirectMessaging(dm);

  // IMPORTANT: modify your liveChatSocket module to *return* emitters:
  //   const liveBus = setupLiveNamespace(live);
  // where liveBus = { emitLiveStarted(liveDoc), emitLiveEnded(liveId) }
  const liveBus = setupLiveNamespace(live);
  
  // (Optional) root namespace (unused in your app)
  io.on('connection', () => { /* no-op */ });

  // Expose both so routes can import and emit:
  // e.g. const { liveBus } = require('../socket'); liveBus.emitLiveEnded(id)
  return { io, liveBus };
};

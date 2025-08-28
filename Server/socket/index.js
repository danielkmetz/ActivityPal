const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const nsDirectMessaging = require('./messagingSocket');
const nsLiveChat = require('./liveChatSocket');

/**
 * Simple per-namespace auth: expects a JWT in either:
 * - socket.handshake.auth.token  (recommended on React Native client)
 * - or Authorization: Bearer <token> header
 *
 * On success, sets socket.user = decoded payload (e.g., {_id, fullName, profilePicUrl})
 */
function makeAuthMiddleware() {
  return (socket, next) => {
    try {
      const hdr = socket.handshake.headers?.authorization || '';
      const headerToken = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
      const token = socket.handshake.auth?.token || headerToken;
      if (!token) return next(new Error('No auth token'));
      const user = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Unauthorized'));
    }
  };
}

module.exports = function attachSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Build namespaces
  const dm = io.of('/dm');
  const live = io.of('/live');

  // Per-namespace auth
  const authMiddleware = makeAuthMiddleware();
  dm.use(authMiddleware);
  live.use(authMiddleware);

  // Attach feature modules
  nsDirectMessaging(dm);
  nsLiveChat(live);

  // (optional) root namespace just for health/logs
  io.on('connection', (socket) => {
    // Most clients won't connect to root if you only use namespaces, but this is harmless
    socket.on('disconnect', () => {});
  });

  return io;
};

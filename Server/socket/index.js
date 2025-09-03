// socket/index.js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const nsDirectMessaging = require('./messagingSocket');
const nsLiveChat = require('./liveChatSocket');

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
    // path: '/socket.io', // default; uncomment ONLY if you change the client too
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  const authMiddleware = makeAuthMiddleware();

  const dm = io.of('/dm');
  const live = io.of('/live');

  dm.use(authMiddleware);
  live.use(authMiddleware);

  live.on('connection', (socket) => {
    socket.on('disconnect', () => {
      // No logging
    });
  });

  nsDirectMessaging(dm);
  nsLiveChat(live);

  io.on('connection', () => {
    // No logging
  });

  return io;
};

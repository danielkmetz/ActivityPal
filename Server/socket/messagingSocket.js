// socket/directMessaging.js

module.exports = function setupDirectMessagingSocket(io) {
  io.on('connection', (socket) => {
    console.log('✅ A user connected:', socket.id);

    // Join user to their own room using their userId
    socket.on('join', (userId) => {
      socket.join(userId);
      console.log(`📲 User ${userId} joined their personal room`);
    });

    socket.on('disconnect', () => {
      console.log('❌ A user disconnected:', socket.id);
    });
  });
};

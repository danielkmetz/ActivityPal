module.exports = function setupDmNamespace(dm) {
  dm.on('connection', (socket) => {
    console.log('✅ DM namespace connected:', socket.id);

    socket.on('join', (userId) => {
      socket.join(userId);
      console.log(`📲 DM: ${userId} joined personal room`);
    });

    socket.on('disconnect', () => {
      console.log('❌ DM namespace disconnected:', socket.id);
    });
  });
};

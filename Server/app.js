require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const { expressMiddleware } = require('@apollo/server/express4');
const createApolloServer = require('./graphql/schema'); // Import GraphQL setup
const { getUserFromToken } = require('./utils/auth');
const setupDirectMessagingSocket = require('./socket/messagingSocket');

// Import routes
const authRoutes = require('./routes/auth');
const businessDetails = require('./routes/businessEvents');
const reviews = require('./routes/reviews');
const businessUsers = require('./routes/businessUsers');
const logos = require('./routes/businessLogos');
const banners = require('./routes/banners');
const photos = require('./routes/photos');
const profilePics = require('./routes/profilePics');
const connections = require('./routes/friends');
const users = require('./routes/users');
const activities = require('./routes/activities');
const notifications = require('./routes/notifications');
const checkIns = require('./routes/checkIns');
const favorites = require('./routes/favorites');
const promotions = require('./routes/businessPromotions');
const google = require('./routes/googlePlaces');
const activityInvite = require('./routes/activityInvite');
const googlePlaces2 = require('./routes/googlePlaces2');
const businessNotifications = require('./routes/businessNotifications');
const recentSearches = require('./routes/searchHistory');
const stories = require('./routes/stories');
const directMessages = require('./routes/directMessages');
const engagement = require('./routes/engagement');
const sharedPosts = require('./routes/sharedPosts');
const insights = require('./routes/insights');

// Initialize app
const app = express();
const server = http.createServer(app); // 👈 Wrap express in HTTP server
const io = new Server(server, {
  cors: { origin: '*' }, // Adjust CORS as needed
});

// Make io available in routes via app.set
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MongoDB connection
const dbURI = '***REMOVED***';
mongoose
  .connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.error('MongoDB connection error:', err));

// ✅ Initialize and apply Apollo Server middleware with context
(async () => {
  try {
    const apolloServer = createApolloServer({
      formatError: (err) => err, // Retain default behavior without logging
      plugins: [{
        async requestDidStart() {
          return {
            async didResolveOperation() {
              // No-op
            },
            async didEncounterErrors() {
              // No-op
            },
          };
        },
      }],
    });

    await apolloServer.start();

    app.use(
      '/api/graphql',
      expressMiddleware(apolloServer, {
        context: async ({ req }) => {
          const user = await getUserFromToken(req);
          return { user };
        },
      })
    );

    console.log('✅ Apollo GraphQL server is running at /api/graphql');
  } catch (error) {
    console.error('❌ Failed to start Apollo Server:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
  }
})();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/business', businessDetails);
app.use('/api/reviews', reviews);
app.use('/api/businessUsers', businessUsers);
app.use('/api/logos', logos);
app.use('/api/banners', banners);
app.use('/api/photos', photos);
app.use('/api/connections', connections);
app.use('/api/users', users);
app.use('/api/profilePics', profilePics);
app.use('/api/activities', activities);
app.use('/api/notifications', notifications);
app.use('/api/checkIns', checkIns);
app.use('/api/favorites', favorites);
app.use('/api/promotions', promotions);
app.use('/api/google', google);
app.use('/api/activity-invite', activityInvite);
app.use('/api/places2', googlePlaces2);
app.use('/api/business-notifications', businessNotifications);
app.use('/api/recent-searches', recentSearches);
app.use('/api/stories', stories);
app.use('/api/directMessages', directMessages);
app.use('/api/engagement', engagement);
app.use('/api/sharedPosts', sharedPosts);
app.use('/api/engagementInsights', insights);

setupDirectMessagingSocket(io);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const { expressMiddleware } = require('@apollo/server/express4');
const createApolloServer = require('./graphql/schema'); // Import GraphQL setup

// Import routes
const authRoutes = require('./routes/auth');
const businessDetails = require('./routes/businessEvents');
const reviews = require('./routes/reviews');
const businessUsers = require('./routes/businessUsers');
const logos = require('./routes/businessLogos');
const banners = require('./routes/banners');
const photos = require('./routes/photos');
const profilePics = require('./routes/profilePics');
const friends = require('./routes/friends');
const users = require('./routes/users');

// Initialize app
const app = express();

// Middleware
app.use(morgan('dev'));
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MongoDB connection
const dbURI = 'mongodb+srv://dkmetz18:Kevin2023!@cluster0.5kysuyj.mongodb.net/ActivityApp';
mongoose
  .connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Initialize and apply Apollo Server middleware
(async () => {
  const apolloServer = createApolloServer();
  await apolloServer.start();
  app.use('/api/graphql', expressMiddleware(apolloServer));
})();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/business', businessDetails);
app.use('/api/reviews', reviews);
app.use('/api/businessUsers', businessUsers);
app.use('/api/logos', logos);
app.use('/api/banners', banners);
app.use('/api/photos', photos);
app.use('/api/friends', friends);
app.use('/api/users', users);
app.use('/api/profilePics', profilePics);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

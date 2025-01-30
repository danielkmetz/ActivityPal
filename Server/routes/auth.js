const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Business = require('../models/Business');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const JWT_SECRET = process.env.JWT_SECRET;

// Login Route
router.post('/login', async (req, res) => {
    const { email, password, isBusiness } = req.body;
  
    try {
      let responseData = {
        message: 'Login successful',
        token: null,
        user: null,
      };
  
      if (isBusiness) {
        // Check in the Business database
        const business = await Business.findOne({ email });
        if (!business) {
          return res.status(400).json({ message: 'Business not found' });
        }
  
        // Verify password
        const isMatch = await bcrypt.compare(password, business.password);
        if (!isMatch) {
          return res.status(400).json({ message: 'Invalid credentials' });
        }
  
        // Generate a mock token (replace with JWT in production)
        // Generate a JWT token
        const token = jwt.sign(
          { id: business._id, isBusiness: true },
          JWT_SECRET,
          { expiresIn: '1d' } // Token expires in 1 day
        );
        responseData.token = token;
  
        // Attach business details along with user details
        responseData.user = {
          id: business._id,
          email: business.email,
          isBusiness: true,
          firstName: business.firstName,
          lastName: business.lastName,
          businessDetails: {
            businessName: business.businessName,
            placeId: business.placeId,
            location: business.location,
            phone: business.phone,
            description: business.description,
            events: business.events,
            reviews: business.reviews,
            logoKey: business.logoKey,
            bannerKey: business.bannerKey,
            photos: business.photos,
          },
        };
      } else {
        // Check in the User database
        const user = await User.findOne({ email, isBusiness: false });
        if (!user) {
          return res.status(400).json({ message: 'User not found' });
        }
  
        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(400).json({ message: 'Invalid credentials' });
        }
  
        // Generate a JWT token
        const token = jwt.sign(
          { id: user._id, isBusiness: false },
          JWT_SECRET,
          { expiresIn: '1d' } // Token expires in 1 day
        );
        responseData.token = token;
  
        // Attach user details to the response
        responseData.user = {
          id: user._id,
          email: user.email,
          isBusiness: false,
          firstName: user.firstName,
          lastName: user.lastName,
          friends: user.friends,
          friendRequests: user.friendRequests,
        };
      }
  
      // Send the response
      res.status(200).json(responseData);
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error' });
    }
});
      
router.post('/register', async (req, res) => {
    const {
      email,
      password,
      firstName,
      lastName,
      isBusiness,
      placeId,
      businessName,
      location,
    } = req.body;
  
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
      // Check for existing email or businessName based on isBusiness
      if (isBusiness) {
        const existingBusiness = await Business.findOne({ email });
        if (existingBusiness) {
          throw new Error("Business with this email already exists");
        }
        const duplicateBusinessName = await Business.findOne({ businessName });
        if (duplicateBusinessName) {
          throw new Error("Business with this name already exists");
        }
      } else {
        const existingUser = await User.findOne({ email, isBusiness: false });
        if (existingUser) {
          throw new Error("User with this email already exists");
        }
      }
  
      // Hash the password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
  
      // If the user is not a business, save to User model
      if (!isBusiness) {
        const newUser = new User({
          email,
          password: hashedPassword,
          firstName,
          lastName,
          isBusiness,
        });
        await newUser.save({ session });
      }
  
      // If the user is a business, save to Business model
      if (isBusiness) {
        const newBusiness = new Business({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            placeId,
            businessName,
            location,
        });
        await newBusiness.save({ session });
      }
  
      await session.commitTransaction();
      session.endSession();
  
      res.status(201).json({ message: "Registration successful" });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error("Registration error:", error);
      res.status(500).json({ message: error.message || "Server error" });
    }
});

// Validate Token Endpoint
router.get('/validate', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]; // Extract token from Authorization header

  if (!token) {
    return res.status(401).json({ message: 'Token is required' });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch user or business details based on `isBusiness`
    const user = decoded.isBusiness
      ? await Business.findById(decoded.id)
      : await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return user data
    res.status(200).json({
      message: 'Token is valid',
      user: {
        id: user._id,
        email: user.email,
        isBusiness: decoded.isBusiness,
        firstName: user.firstName,
        lastName: user.lastName,
        friends: user.friends,
        friendRequests: user.friendRequests,
        ...(decoded.isBusiness && {
          businessDetails: {
            businessName: user.businessName,
            placeId: user.placeId,
            location: user.location,
            events: user.events,
            reviews: user.reviews,
            phone: user.phone,
            description: user.description,
          },
        }),
      },
    });
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});
  

module.exports = router;

const express = require('express');
const router = express.Router();
const Business = require('../models/Business');
const verifyToken = require('../middleware/verifyToken'); // Import authentication middleware

// Endpoint to check if placeIds exist in the Business model
router.post('/check-businesses', verifyToken, async (req, res) => {
    try {
        const { placeIds } = req.body; // Extract placeIds array from request body

        if (!placeIds || !Array.isArray(placeIds)) {
            return res.status(400).json({ message: 'Invalid or missing placeIds array' });
        }

        // Find all businesses that match any of the provided placeIds
        const businesses = await Business.find({ placeId: { $in: placeIds } });
        
        return res.status(200).json(businesses); // Return matching businesses
    } catch (error) {
        console.error('Error fetching businesses:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;

const express = require("express");
const User = require("../models/User"); // User model (contains checkIns)
const router = express.Router();

router.post("/:userId/:placeId", async (req, res) => {
    try {
      const user = await User.findById(req.params.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      if (!user.favorites) {
        user.favorites = [];
      }
  
      // Check if the place is already favorited
      if (!user.favorites.some(fav => fav.placeId === req.params.placeId)) {
        user.favorites.push({ placeId: req.params.placeId });
        await user.save();
      }
  
      return res.json({
        message: "Establishment added to favorites",
        favorites: user.favorites,
      });
  
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
});  
    
router.delete("/:userId/:placeId", async (req, res) => {
    try {
      const user = await User.findById(req.params.userId);
      if (!user) return res.status(404).json({ message: "User not found" });
  
      // Filter out the favorite by matching the `placeId` inside the object
      user.favorites = user.favorites.filter(fav => fav.placeId !== req.params.placeId);
  
      await user.save();
      res.json({ message: "Establishment removed from favorites", favorites: user.favorites });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
});
  
router.get("/users/:userId", async (req, res) => {
    try {
      const user = await User.findById(req.params.userId);
      if (!user) return res.status(404).json({ message: "User not found" });
  
      // Extract only placeId values from the favorites array
      const favorites = user.favorites.map(fav => fav.placeId);
  
      res.json({ favorites });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
});

  
module.exports = router 
  
  
  
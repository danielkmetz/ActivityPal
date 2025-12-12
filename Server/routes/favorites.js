const express = require("express");
const User = require("../models/User"); 
const router = express.Router();

router.post("/:userId/:placeId", async (req, res) => {
  try {
    const { userId, placeId } = req.params;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.favorites = Array.isArray(user.favorites) ? user.favorites : [];

    // Handle legacy string[] OR object[] safely
    const has = user.favorites.some((fav) =>
      typeof fav === "string" ? fav === placeId : fav?.placeId === placeId
    );

    if (!has) {
      user.favorites.push({ placeId, favoritedAt: new Date() }); // keep metadata in DB if you want
      await user.save();
    }

    // ✅ Always return a stable shape to the client: string[]
    const favoriteIds = user.favorites
      .map((fav) => (typeof fav === "string" ? fav : fav?.placeId))
      .filter(Boolean);

    return res.json({
      message: "Establishment added to favorites",
      favorites: favoriteIds,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
    
router.delete("/:userId/:placeId", async (req, res) => {
  try {
    const { userId, placeId } = req.params;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.favorites = Array.isArray(user.favorites) ? user.favorites : [];

    // ✅ supports legacy string[] AND object[]
    user.favorites = user.favorites.filter((fav) => {
      if (typeof fav === "string") return fav !== placeId;
      return fav?.placeId !== placeId;
    });

    await user.save();

    // ✅ always return ids
    const favoriteIds = user.favorites
      .map((fav) => (typeof fav === "string" ? fav : fav?.placeId))
      .filter(Boolean);

    return res.json({
      message: "Establishment removed from favorites",
      favorites: favoriteIds,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
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
  
  
  
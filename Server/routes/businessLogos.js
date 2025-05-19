const express = require('express');
const multer = require('multer');
const { uploadToS3} = require('../helpers/uploadToS3'); // AWS SDK-based upload helper
const { getObjectFromS3 } = require('../helpers/getObjectFromS3');
const Business = require('../models/Business'); // Import Business model
const router = express.Router();

// Configure multer to use memory storage
const storage = multer.memoryStorage(); // Store file in memory as a buffer
const upload = multer({ storage });

// Upload Logo Route
router.post("/upload/:placeId", upload.single("logo"), async (req, res) => {
    const { placeId } = req.params;

    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file provided" });
      }
  
      const business = await Business.findOne({ placeId });
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }
  
      const key = `logos/${placeId}/${Date.now()}-${req.file.originalname}`;
      const objectKey = await uploadToS3(req.file, key);
  
      business.logoKey = objectKey;
      await business.save();
  
      res.status(200).json({ message: "Logo uploaded successfully", objectKey });
    } catch (error) {
      console.error("Error uploading logo:", error);
      res.status(500).json({ message: "Error uploading logo", error: error.message });
    }
});

// Updated Route
router.get("/:placeId/logo", async (req, res) => {
    const { placeId } = req.params;
  
    try {
      const business = await Business.findOne({ placeId });
      if (!business || !business.logoKey) {
        return res.status(404).json({ message: "Logo not found" });
      }
  
      const { body: objectStream, contentType } = await getObjectFromS3(business.logoKey);
  
      // Pipe the S3 object stream directly to the client
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      objectStream.pipe(res);
    } catch (error) {
      console.error("Error retrieving logo:", error);
      res.status(500).json({ message: "Error retrieving logo", error: error.message });
    }
});


module.exports = router;

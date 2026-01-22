const express = require("express");
const router = express.Router();
const { placesHandler } = require("../services/places");

router.post("/places", placesHandler);

module.exports = router;

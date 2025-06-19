// Classify reviews by evaluating reviews
const axios = require('axios');
const { scoreCuisineCategories } = require('./Keywords/Keywords');

const googleApiKey = process.env.GOOGLE_KEY;

const classifyCuisineFromReviews = async (placeId) => {
  try {
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews&key=${googleApiKey}`;
    const { data } = await axios.get(detailsUrl);

    const reviews = data.result?.reviews || [];
    
    const filteredReviews = reviews
      .filter(r => r?.text && r.text.length > 20)
      .slice(0, 8);

    const textBlob = filteredReviews.map(r => r.text).join(" ");
    if (!textBlob) {
      return "unknown";
    }

    const scored = scoreCuisineCategories(textBlob);
    console.log("📊 Scoring breakdown:", scored);

    const [topCategory, topScore] = scored[0] || [];

    const finalClassification = topScore > 0 ? topCategory : "unknown";
    return finalClassification;
  } catch (err) {
    console.error(`🛑 Error classifying from reviews for placeId ${placeId}:`, err.message);
    return "unknown";
  }
};

module.exports = { classifyCuisineFromReviews };

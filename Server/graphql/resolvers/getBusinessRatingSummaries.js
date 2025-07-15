const Review = require('../../models/Reviews');

const getBusinessRatingSummaries = async (_, { placeIds }) => {
  try {
    if (!Array.isArray(placeIds) || placeIds.length === 0) {
      throw new Error("placeIds must be a non-empty array");
    }

    const summaries = await Promise.all(placeIds.map(async (placeId) => {
      const reviews = await Review.find({ placeId });

      if (!reviews.length) {
        return {
          placeId,
          averageRating: 0,
          averagePriceRating: 0,
          averageServiceRating: 0,
          averageAtmosphereRating: 0,
          recommendPercentage: 0,
        };
      }

      const ratingFields = {
        rating: [],
        priceRating: [],
        serviceRating: [],
        atmosphereRating: [],
        wouldRecommendCount: 0,
      };

      reviews.forEach((r) => {
        if (typeof r.rating === 'number') ratingFields.rating.push(r.rating);
        if (typeof r.priceRating === 'number') ratingFields.priceRating.push(r.priceRating);
        if (typeof r.serviceRating === 'number') ratingFields.serviceRating.push(r.serviceRating);
        if (typeof r.atmosphereRating === 'number') ratingFields.atmosphereRating.push(r.atmosphereRating);
        if (r.wouldRecommend === true) ratingFields.wouldRecommendCount += 1;
      });

      const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

      return {
        placeId,
        averageRating: parseFloat(avg(ratingFields.rating).toFixed(2)),
        averagePriceRating: parseFloat(avg(ratingFields.priceRating).toFixed(2)),
        averageServiceRating: parseFloat(avg(ratingFields.serviceRating).toFixed(2)),
        averageAtmosphereRating: parseFloat(avg(ratingFields.atmosphereRating).toFixed(2)),
        recommendPercentage: Math.round((ratingFields.wouldRecommendCount / reviews.length) * 100),
      };
    }));

    return summaries;
  } catch (err) {
    console.error("❌ Error in getBusinessRatingSummaries:", err);
    throw new Error("Failed to compute business rating summaries");
  }
};

module.exports = {
  getBusinessRatingSummaries,
};

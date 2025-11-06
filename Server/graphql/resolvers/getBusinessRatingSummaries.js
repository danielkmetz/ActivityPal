const { Post } = require('../../models/Post'); // ✅ unified Post model

const getBusinessRatingSummaries = async (_, { placeIds }) => {
  try {
    if (!Array.isArray(placeIds) || placeIds.length === 0) {
      throw new Error('placeIds must be a non-empty array');
    }

    // One aggregation over the unified Post collection (type: 'review')
    const agg = await Post.aggregate([
      { $match: { type: 'review', placeId: { $in: placeIds } } },

      {
        $group: {
          _id: '$placeId',
          totalReviews: { $sum: 1 },

          // Only count numeric values for each rating bucket
          ratingSum: {
            $sum: {
              $cond: [{ $isNumber: '$details.rating' }, '$details.rating', 0],
            },
          },
          ratingCount: {
            $sum: { $cond: [{ $isNumber: '$details.rating' }, 1, 0] },
          },

          priceSum: {
            $sum: {
              $cond: [{ $isNumber: '$details.priceRating' }, '$details.priceRating', 0],
            },
          },
          priceCount: {
            $sum: { $cond: [{ $isNumber: '$details.priceRating' }, 1, 0] },
          },

          serviceSum: {
            $sum: {
              $cond: [{ $isNumber: '$details.serviceRating' }, '$details.serviceRating', 0],
            },
          },
          serviceCount: {
            $sum: { $cond: [{ $isNumber: '$details.serviceRating' }, 1, 0] },
          },

          atmosphereSum: {
            $sum: {
              $cond: [{ $isNumber: '$details.atmosphereRating' }, '$details.atmosphereRating', 0],
            },
          },
          atmosphereCount: {
            $sum: { $cond: [{ $isNumber: '$details.atmosphereRating' }, 1, 0] },
          },

          recommendCount: {
            $sum: { $cond: [{ $eq: ['$details.wouldRecommend', true] }, 1, 0] },
          },
        },
      },

      {
        $project: {
          _id: 0,
          placeId: '$_id',

          averageRating: {
            $round: [
              {
                $cond: [
                  { $gt: ['$ratingCount', 0] },
                  { $divide: ['$ratingSum', '$ratingCount'] },
                  0,
                ],
              },
              2,
            ],
          },
          averagePriceRating: {
            $round: [
              {
                $cond: [
                  { $gt: ['$priceCount', 0] },
                  { $divide: ['$priceSum', '$priceCount'] },
                  0,
                ],
              },
              2,
            ],
          },
          averageServiceRating: {
            $round: [
              {
                $cond: [
                  { $gt: ['$serviceCount', 0] },
                  { $divide: ['$serviceSum', '$serviceCount'] },
                  0,
                ],
              },
              2,
            ],
          },
          averageAtmosphereRating: {
            $round: [
              {
                $cond: [
                  { $gt: ['$atmosphereCount', 0] },
                  { $divide: ['$atmosphereSum', '$atmosphereCount'] },
                  0,
                ],
              },
              2,
            ],
          },

          recommendPercentage: {
            $cond: [
              { $gt: ['$totalReviews', 0] },
              {
                $round: [
                  { $multiply: [{ $divide: ['$recommendCount', '$totalReviews'] }, 100] },
                  0,
                ],
              },
              0,
            ],
          },
        },
      },
    ]);

    // Ensure we return an entry for every requested placeId (even if no reviews)
    const map = new Map(agg.map((d) => [d.placeId, d]));
    const empty = {
      averageRating: 0,
      averagePriceRating: 0,
      averageServiceRating: 0,
      averageAtmosphereRating: 0,
      recommendPercentage: 0,
    };

    const summaries = placeIds.map((placeId) =>
      map.has(placeId) ? { placeId, ...map.get(placeId) } : { placeId, ...empty }
    );

    return summaries;
  } catch (err) {
    console.error('❌ Error in getBusinessRatingSummaries:', err);
    throw new Error('Failed to compute business rating summaries');
  }
};

module.exports = {
  getBusinessRatingSummaries,
};

const { Post } = require('../../models/Post');

const getBusinessRatingSummaries = async (_, { placeIds }) => {
  try {
    if (!Array.isArray(placeIds) || placeIds.length === 0) {
      throw new Error('placeIds must be a non-empty array');
    }

    // Aggregate over unified Post collection, only review posts
    const agg = await Post.aggregate([
      {
        $match: {
          type: 'review',
          placeId: { $in: placeIds },
        },
      },

      {
        $group: {
          _id: '$placeId',
          totalReviews: { $sum: 1 },

          // new canonical rating (required)
          ratingSum: { $sum: '$details.rating' },

          // optional price rating
          priceSum: {
            $sum: {
              $cond: [
                { $isNumber: '$details.priceRating' },
                '$details.priceRating',
                0,
              ],
            },
          },
          priceCount: {
            $sum: {
              $cond: [
                { $isNumber: '$details.priceRating' },
                1,
                0,
              ],
            },
          },

          // new yes/no field: wouldGoBack
          wouldGoBackCount: {
            $sum: {
              $cond: [
                { $eq: ['$details.wouldGoBack', true] },
                1,
                0,
              ],
            },
          },
        },
      },

      {
        $project: {
          _id: 0,
          placeId: '$_id',

          // average star rating
          averageRating: {
            $round: [
              {
                $cond: [
                  { $gt: ['$totalReviews', 0] },
                  { $divide: ['$ratingSum', '$totalReviews'] },
                  0,
                ],
              },
              2,
            ],
          },

          // average price rating (only where priceRating is present)
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

          // legacy metrics are now just hard-coded (no legacy support)
          averageServiceRating: { $literal: 0 },
          averageAtmosphereRating: { $literal: 0 },

          // percentage of reviews where wouldGoBack === true
          recommendPercentage: {
            $cond: [
              { $gt: ['$totalReviews', 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ['$wouldGoBackCount', '$totalReviews'] },
                      100,
                    ],
                  },
                  0,
                ],
              },
              0,
            ],
          },
        },
      },
    ]);

    // Map aggregation results back to the requested placeIds,
    // and return an "empty" summary for places with no reviews.
    const map = new Map(agg.map((d) => [d.placeId, d]));

    const empty = {
      averageRating: 0,
      averagePriceRating: 0,
      averageServiceRating: 0,
      averageAtmosphereRating: 0,
      recommendPercentage: 0,
    };

    const summaries = placeIds.map((placeId) =>
      map.get(placeId) || { placeId, ...empty }
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

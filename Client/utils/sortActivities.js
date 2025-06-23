const sortActivities = (activities, sortOption) => {
    if (!Array.isArray(activities)) return [];
    if (!sortOption || typeof sortOption !== 'string') return activities;

    const getAverage = (arr, key) => {
        const values = arr.map(r => r[key]).filter(v => typeof v === 'number');
        return values.length ? values.reduce((sum, val) => sum + val, 0) / values.length : null;
    };

    const getRecommendationRate = (arr) => {
        const valid = arr.filter(r => typeof r.wouldRecommend === 'boolean');
        const yesCount = valid.filter(r => r.wouldRecommend).length;
        return valid.length ? yesCount / valid.length : null;
    };

    const scoredActivities = activities.map((activity) => {
        const reviews = activity.business?.reviews || [];
        const name = activity.name || 'Unnamed';

        let score;
        switch (sortOption) {
            case 'rating':
                score = getAverage(reviews, 'rating');
                break;
            case 'popularity':
                score = reviews.length || null;
                break;
            case 'priceLowHigh':
            case 'priceHighLow':
                score = getAverage(reviews, 'priceRating');
                break;
            case 'serviceRating':
                score = getAverage(reviews, 'serviceRating');
                break;
            case 'wouldRecommend':
                score = getRecommendationRate(reviews);
                break;
            case 'distance':
            default:
                const rawDistance = activity.distance;
                const parsedDistance = typeof rawDistance === 'number'
                    ? rawDistance
                    : parseFloat(String(rawDistance).replace(/[^\d.]/g, ''));
                score = isNaN(parsedDistance) ? Infinity : parsedDistance;
                break;
        }

        return { ...activity, _score: score, _name: name };
    });

    const sorted = scoredActivities.sort((a, b) => {
        const aScore = a._score;
        const bScore = b._score;

        if (aScore == null && bScore == null) return 0;
        if (aScore == null) return 1;
        if (bScore == null) return -1;

        const isAsc = sortOption === 'priceLowHigh' || sortOption === 'distance';
        return isAsc ? aScore - bScore : bScore - aScore;
    });

    return sorted;
};

export default sortActivities;

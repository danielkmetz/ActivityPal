const Review = require('../models/Reviews');
const CheckIn = require('../models/CheckIns');
const ActivityInvite = require('../models/ActivityInvites');
const Promotion = require('../models/Promotions');
const Event = require('../models/Events');

const getModelByType = (type) => {
  switch (type) {
    case 'review': return Review;
    case 'reviews': return Review;
    case 'check-in': return CheckIn;
    case 'checkIn': return CheckIn;
    case 'invite': return ActivityInvite;
    case 'invites': return ActivityInvite;
    case 'activityInvite': return ActivityInvite;
    case 'promotion': return Promotion;
    case 'promotions': return Promotion;
    case 'promo': return Promotion;
    case 'promos': return Promotion;
    case 'event': return Event;
    case 'events': return Event;
    default: return null;
  }
};

module.exports = { getModelByType };

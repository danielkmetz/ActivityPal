const Review = require('../models/Reviews');
const CheckIn = require('../models/CheckIns');
const ActivityInvite = require('../models/ActivityInvites');
const Promotion = require('../models/Promotions');
const Event = require('../models/Events');

const getModelByType = (type) => {
  switch (type) {
    case 'review': return Review;
    case 'check-in': return CheckIn;
    case 'invite': return ActivityInvite;
    case 'promotion': return Promotion;
    case 'promo': return Promotion;
    case 'event': return Event;
    default: return null;
  }
};

module.exports = { getModelByType };

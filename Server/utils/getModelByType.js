const { Post } = require('../models/Post');
const Promotion = require('../models/Promotions');
const Event = require('../models/Events');

const getModelByType = (type) => {
  switch (type) {
    case 'review': return Post;
    case 'check-in': return Post;
    case 'invite': return Post;
    case 'liveStream': return Post;
    case 'sharedPost': return Post;
    case 'promotion': return Promotion;
    case 'promo': return Promotion;
    case 'event': return Event;
    default: return null;
  }
};

module.exports = { getModelByType };
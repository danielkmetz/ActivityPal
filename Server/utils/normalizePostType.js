const normalizePostType = (t) => {
  if (!t) return null;

  switch (t.toLowerCase()) {
    case 'review':
    case 'reviews':
      return 'review';

    case 'checkin':
    case 'check-in':
    case 'checkins':
    case 'check_ins':
    case 'check-ins':
      return 'check-in';

    case 'invite':
    case 'invites':
      return 'invite';

    case 'event':
    case 'events':
      return 'event';

    case 'promotion':
    case 'promotions':
    case 'promo':
    case 'promos':
      return 'promotion';

    case 'livestream':
    case 'live-stream':
    case 'livestreams':
    case 'live_streams':
      return 'liveStream';

    case 'sharedpost':
    case 'sharedposts':
    case 'sharedPost' :
    case 'sharedPosts' :
      return 'sharedPost';

    default:
      return null; // or throw an error if you prefer strictness
  }
};


module.exports = { normalizePostType }
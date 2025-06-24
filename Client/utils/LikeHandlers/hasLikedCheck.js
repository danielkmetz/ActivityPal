export const hasLikedCheck = (likes, userId) => {
    if (!Array.isArray(likes)) return false;

    return likes.some(like =>
      typeof like === 'string' ? like === userId :
      typeof like === 'object' && like.userId === userId
    );
};
  
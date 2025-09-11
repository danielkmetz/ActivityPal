function sanitizeLiveDoc(doc = {}) {
  const {
    _id, id, hostUserId, title, playbackUrl, createdAt, placeId,
    thumbnailUrl, isActive, status, host
  } = doc || {};
  return {
    _id: String(_id || id || ''),
    hostUserId,
    title,
    playbackUrl,
    createdAt,
    placeId,
    thumbnailUrl,
    isActive,
    status,
    ...(host ? { host } : {}),
  };
}

module.exports = { sanitizeLiveDoc }
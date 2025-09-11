function shapeLiveForWire(session, hostUserId, hostWire) {
  // One canonical wire shape used for both socket emits and REST response
  return {
    _id: String(session._id),
    hostUserId: String(hostUserId),
    title: session.title,
    placeId: session.placeId ?? null,
    playbackUrl: session.playbackUrl,
    createdAt: session.startedAt,          // keep UI sort consistent
    thumbnailUrl: session.thumbnailUrl || null,
    isActive: true,
    status: 'live',
    ...(hostWire ? { host: hostWire } : {}),
  };
}

module.exports = { shapeLiveForWire }

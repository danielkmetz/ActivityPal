import { toId } from "../Formatting/toId";

export function recipientsToFriendObjects({ recipients, friends }) {
  const list = Array.isArray(recipients) ? recipients : [];
  const friendList = Array.isArray(friends) ? friends : [];

  return list
    .map((r) => {
      const src = r?.user || r;
      const id = toId(src);
      if (!id) return null;

      const fromFriends = friendList.find((f) => toId(f) === id);
      if (fromFriends) return fromFriends;

      return {
        _id: id,
        id,
        userId: id,
        firstName: src?.firstName,
        lastName: src?.lastName,
        username: src?.username || src?.fullName || src?.firstName || "Unknown",
        profilePicUrl: src?.profilePicUrl || src?.presignedProfileUrl || null,
      };
    })
    .filter(Boolean);
}

export function isPublicFromInvite(invite) {
  const p = invite?.privacy;
  if (typeof p === "string") {
    if (p === "public" || p === "followers") return true;
    if (p === "private" || p === "unlisted") return false;
  }

  const existingPublic = invite?.details?.isPublic ?? invite?.isPublic;
  if (typeof existingPublic === "boolean") return existingPublic;

  return true;
}

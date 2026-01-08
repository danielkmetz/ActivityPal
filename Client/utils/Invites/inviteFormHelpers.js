import { toId } from "../Formatting/toId";

/**
 * Convert invite recipients array into friend objects that your UI can render.
 * - Uses `friends` list as source of truth when possible (so pills render correctly)
 * - Falls back to a minimal shape when friend isn’t in local friends list
 */
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

/**
 * Determine invite visibility from legacy + new fields.
 * Returns boolean "isPublic".
 */
export function isPublicFromInvite(invite) {
  // Prefer explicit privacy string if present
  const p = invite?.privacy;
  if (typeof p === "string") {
    if (p === "public" || p === "followers") return true;
    if (p === "private" || p === "unlisted") return false;
  }

  // fallback legacy toggles
  const existingPublic = invite?.details?.isPublic ?? invite?.isPublic;
  if (typeof existingPublic === "boolean") return existingPublic;

  // default
  return true;
}

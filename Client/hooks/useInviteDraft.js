import { useEffect, useMemo, useRef, useState } from "react";
import { deriveVenue } from "../utils/posts/venueBuilder";
import { toId } from "../utils/Formatting/toId";
import { recipientsToFriendObjects, isPublicFromInvite } from "../utils/Invites/inviteFormHelpers";

export default function useInviteDraft({
  isEditing = false,
  initialInvite = null,
  selectedVenue = null,
  friends = [],
  resetKey = 0, // ✅ NEW
}) {
  const [message, setMessage] = useState("");
  const [dateTime, setDateTime] = useState(() => new Date());
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [isPublic, setIsPublic] = useState(true);

  const venue = useMemo(() => deriveVenue(selectedVenue, initialInvite), [selectedVenue, initialInvite]);

  const privacyLocked = venue?.kind === "custom";
  const effectiveIsPublic = privacyLocked ? false : isPublic;

  useEffect(() => {
    if (privacyLocked && isPublic) setIsPublic(false);
  }, [privacyLocked, isPublic]);

  const hydratedKeyRef = useRef(null);

  useEffect(() => {
    if (!isEditing || !initialInvite) return;

    const inviteId = initialInvite?._id ? String(initialInvite._id) : "unknown";
    const key = `${inviteId}:${resetKey}`;
    if (hydratedKeyRef.current === key) return;
    hydratedKeyRef.current = key;

    setMessage(initialInvite.message || "");

    const rawDate =
      initialInvite.details?.dateTime ||
      initialInvite.dateTime ||
      initialInvite.sortDate ||
      initialInvite.createdAt;

    setDateTime(rawDate ? new Date(rawDate) : new Date());
    setIsPublic(isPublicFromInvite(initialInvite));

    const recipients = initialInvite.details?.recipients || [];
    setSelectedFriends(recipientsToFriendObjects({ recipients, friends }));
  }, [isEditing, initialInvite, friends, resetKey]);

  const recipientIds = useMemo(() => {
    return Array.from(new Set((selectedFriends || []).map((f) => toId(f)).filter(Boolean)));
  }, [selectedFriends]);

  const removeFriendById = (idLike) => {
    const id = toId(idLike);
    if (!id) return;
    setSelectedFriends((prev) => (Array.isArray(prev) ? prev.filter((u) => toId(u) !== id) : []));
  };

  return {
    venue,
    privacyLocked,
    effectiveIsPublic,

    message,
    setMessage,
    dateTime,
    setDateTime,
    selectedFriends,
    setSelectedFriends,
    isPublic,
    setIsPublic,

    recipientIds,
    removeFriendById,
  };
}

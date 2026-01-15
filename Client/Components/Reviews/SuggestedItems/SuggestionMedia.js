import React, { useMemo, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { useSelector } from "react-redux";
import PhotoFeed from "../Photos/PhotoFeed";
import { selectUserAndFriendsPosts } from "../../../Slices/PostsSelectors/postsSelectors";
import { selectUser } from "../../../Slices/UserSlice";
import { resolvePostContent } from "../../../utils/posts/resolvePostContent";
import DetailsWrapper from "./DetailsWrapper";
import PhotoPaginationDots from "../Photos/PhotoPaginationDots";
import { resolveMediaList } from "../../../utils/Media/resolveMedia";
import { selectBanner } from "../../../Slices/PhotosSlice";

const isSameLocalDay = (a, b) => {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
};

const getInviteSentAt = (invite) =>
  invite?.sortDate ||
  invite?.createdAt ||
  invite?.sentAt ||
  invite?.createdOn ||
  invite?.updatedAt ||
  invite?.dateTime;

const pickFallbackUrl = (s) =>
  s?.bannerUrl ||
  s?.coverUrl ||
  s?.imageUrl ||
  s?.photoUrl ||
  s?.url ||
  s?.logoUrl ||
  s?.businessLogoUrl ||
  null;

export default function SuggestionMedia({ suggestion, scrollX }) {
  const suggestionContent = resolvePostContent(suggestion);
  const allPosts = useSelector(selectUserAndFriendsPosts);
  const me = useSelector(selectUser);
  const banner = useSelector(selectBanner);
  const myUserId = me?._id || me?.id;
  const { startTime, endTime, kind } = suggestionContent || {};
  const internalScrollX = useRef(new Animated.Value(0)).current;
  const sx = scrollX || internalScrollX;

  const media = useMemo(() => {
    return resolveMediaList(suggestion, banner?.presignedUrl);
  }, [
    suggestion?._id,
    suggestion?.updatedAt,
    suggestion?.original?._id,
    suggestion?.original?.updatedAt,
    banner?.presignedUrl,
  ]);

  const fallbackUrl = useMemo(
    () => pickFallbackUrl(suggestionContent),
    [
      suggestionContent?._id,
      suggestionContent?.placeId,
      suggestionContent?.bannerUrl,
      suggestionContent?.coverUrl,
      suggestionContent?.imageUrl,
      suggestionContent?.photoUrl,
      suggestionContent?.url,
      suggestionContent?.logoUrl,
      suggestionContent?.businessLogoUrl,
    ]
  );

  const myInvites = useMemo(() => {
    const posts = Array.isArray(allPosts) ? allPosts : [];
    return posts.filter((p) => {
      const t = p?.type || p?.postType || p?.canonicalType;
      if (t !== "invite") return false;

      const ownerId =
        p?.ownerId ||
        p?.owner?.id ||
        p?.userId ||
        p?.sender?.id ||
        p?.sender?.userId;

      return String(ownerId || "") === String(myUserId || "");
    });
  }, [allPosts, myUserId]);

  const rawInvite = useMemo(() => {
    if (!Array.isArray(myInvites) || !suggestionContent?.placeId) return null;

    const startMs = startTime ? new Date(startTime).getTime() : null;
    const endMs = endTime ? new Date(endTime).getTime() : null;

    return (
      myInvites.find((invite) => {
        const samePlace = invite?.placeId === suggestionContent.placeId;
        const when = invite?.dateTime ? new Date(invite.dateTime).getTime() : null;
        if (!samePlace || when == null) return false;

        const isActive =
          (kind === "activePromo" || kind === "activeEvent") &&
          startMs != null &&
          endMs != null &&
          when >= startMs &&
          when <= endMs;

        const isUpcoming =
          (kind === "upcomingPromo" || kind === "upcomingEvent") &&
          startMs != null &&
          Math.abs(when - startMs) <= 60 * 60 * 1000;

        return isActive || isUpcoming;
      }) || null
    );
  }, [myInvites, suggestionContent?.placeId, startTime, endTime, kind]);

  const sentAt = rawInvite ? getInviteSentAt(rawInvite) : null;
  const wasSentToday = sentAt ? isSameLocalDay(sentAt, new Date()) : false;
  const existingInvite = rawInvite && wasSentToday ? { ...rawInvite, type: "invite" } : null;

  return (
    <View style={styles.container}>
      <DetailsWrapper suggestion={suggestion} existingInvite={existingInvite}>
        <PhotoFeed post={suggestion} scrollX={sx} fallbackUrl={fallbackUrl} isSuggestion={true} />
      </DetailsWrapper>
      <PhotoPaginationDots photos={media} scrollX={sx} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: "center" },
});

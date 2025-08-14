import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import dayjs from 'dayjs';
import VideoThumbnail from '../Reviews/VideoThumbnail';

export default function PostPreview({
    postPreview,
    width = 200,
    height = 200,
    showOverlay = true,
    overlayText,
    showPostText = false,
}) {
    if (!postPreview) return null;

    // --------- Type & ownership ----------
    const postType = postPreview?.postType || postPreview?.type; // 'invite' | 'review' | 'check-in' | 'event' | 'promotion' | ...
    const isInvite = postType === 'invite';
    const isEventOrPromo = postType === 'event' || postType === 'promotion' || postType === 'promo';

    // Prefer explicit ownership when present (from your enriched shape)
    const ownerModel =
        postPreview?.originalOwnerModel ||
        postPreview?.originalOwner?.__typename ||
        null;

    // Business-owned iff it's an event/promo AND owner is a Business OR the poster is a business account
    const isBusinessOwnedEventOrPromo =
        isEventOrPromo &&
        (ownerModel === 'Business' || !!postPreview?.user?.businessName);

    // --------- Names (people first) ----------
    const senderName = `${postPreview?.sender?.firstName || ''} ${postPreview?.sender?.lastName || ''}`.trim();

    console.log('post preview', postPreview);
    console.log('sender name', senderName);

    const originalOwnerUserName =
        postPreview?.originalOwner?.__typename === 'User'
            ? `${postPreview?.originalOwner?.firstName || ''} ${postPreview?.originalOwner?.lastName || ''}`.trim()
            : '';

    const userObjName =
        (postPreview?.user?.firstName || postPreview?.user?.lastName)
            ? `${postPreview?.user?.firstName || ''} ${postPreview?.user?.lastName || ''}`.trim()
            : '';

    // Person-first name for invites/reviews/other user posts
    const personName =
        senderName ||
        postPreview?.fullName ||
        originalOwnerUserName ||
        userObjName ||
        '';

    const businessLabel =
        postPreview?.user?.businessName ||
        postPreview?.business?.businessName ||
        postPreview?.businessName ||
        null;

    // Final display name rule:
    // - If business-owned event/promo => business name
    // - Else => person name (fallback to 'Someone')
    const displayName = isBusinessOwnedEventOrPromo
        ? (businessLabel || 'A business')
        : (personName || 'Someone');

    // --------- Primary / secondary labels ----------
    const primaryLabel =
        overlayText ||
        (isInvite
            ? `${personName || 'Someone'}'s invite`
            : `${displayName}'s ${postType || 'post'}`);

    // Only show place/business under the title for INVITES
    const secondaryLabel =
        isInvite && (postPreview?.businessName || postPreview?.placeName)
            ? (postPreview.businessName || postPreview.placeName)
            : null;

    // --------- Media selection ----------
    let mediaKind = 'none';
    if (isInvite) {
        mediaKind = (postPreview?.businessLogoUrl || postPreview?.sender?.profilePicUrl) ? 'image' : 'none';
    } else if (postPreview?.mediaType === 'video') {
        mediaKind = 'video';
    } else if (postPreview?.mediaType === 'image') {
        mediaKind = 'image';
    }

    const mediaUri = isInvite
        ? (postPreview?.businessLogoUrl || postPreview?.sender?.profilePicUrl || null)
        : (postPreview?.mediaUrl || null);

    // --------- Bottom text & date chip ----------
    const previewBottomText = isInvite
        ? (postPreview?.note || postPreview?.message || '')
        : (postPreview?.reviewText || '');

    const dateChip = isInvite && postPreview?.dateTime
        ? dayjs(postPreview.dateTime).format('ddd, MMM D • h:mm A')
        : null;

    return (
        <View style={[styles.wrapper, { width, height }]}>
            {showOverlay && (
                <View style={styles.overlay}>
                    <Text style={styles.overlayText} numberOfLines={1}>{primaryLabel}</Text>
                    {secondaryLabel ? (
                        <Text style={styles.overlaySubText} numberOfLines={1}>{secondaryLabel}</Text>
                    ) : null}
                    {dateChip ? (
                        <View style={styles.dateChip}>
                            <Text style={styles.dateChipText}>{dateChip}</Text>
                        </View>
                    ) : null}
                </View>
            )}

            {mediaKind === 'image' && mediaUri ? (
                <Image source={{ uri: mediaUri }} style={styles.media} resizeMode="cover" />
            ) : mediaKind === 'video' && mediaUri ? (
                <VideoThumbnail file={{ uri: mediaUri }} width={width} height={height} shouldPlay={false} />
            ) : (
                <View style={[styles.media, styles.placeholder]}>
                    <Text style={styles.placeholderEmoji}>{isInvite ? '🎟️' : '🖼️'}</Text>
                </View>
            )}

            {showPostText && !!previewBottomText && (
                <View style={styles.reviewOverlay}>
                    <Text numberOfLines={2} ellipsizeMode="tail" style={styles.reviewText}>
                        {previewBottomText}
                    </Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: { borderRadius: 16, overflow: 'hidden', position: 'relative' },
    overlay: {
        position: 'absolute',
        top: 0,
        width: '100%',
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingVertical: 6,
        paddingHorizontal: 10,
        flexDirection: 'column',
        zIndex: 2,
    },
    overlayText: { color: '#fff', fontWeight: '600', fontSize: 16, padding: 2 },
    overlaySubText: { color: '#fff', opacity: 0.9, fontSize: 13, padding: 2 },
    dateChip: { borderRadius: 12, paddingHorizontal: 2, marginTop: 5, zIndex: 3 },
    dateChipText: { color: '#fff', fontSize: 12, fontWeight: '500' },
    media: { width: '100%', height: '100%' },
    placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#222' },
    placeholderEmoji: { fontSize: 28, opacity: 0.85 },
    reviewOverlay: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        paddingVertical: 6,
        paddingHorizontal: 10,
        zIndex: 2,
    },
    reviewText: { color: '#fff', fontSize: 16, fontWeight: '400', padding: 2 },
});

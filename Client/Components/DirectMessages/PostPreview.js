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
    const canonicalType = postPreview.canonicalType || postPreview.postType || postPreview.type;
    const isInvite = canonicalType === 'invites' || postPreview.postType === 'invite';
    const isEvent = canonicalType === 'events' || postPreview.postType === 'event';
    const isPromo = canonicalType === 'promotions' || postPreview.postType === 'promotion' || postPreview.postType === 'promo';
    const isEventOrPromo = isEvent || isPromo;
    const isShared = canonicalType === 'sharedPosts';
    const isLive = canonicalType === 'liveStreams';

    // Owner model when relevant
    const ownerModel =
        postPreview?.originalOwnerModel ||
        postPreview?.originalOwner?.__typename ||
        null;

    // Business-owned iff it's an event/promo AND owner is Business OR user is business account
    const isBusinessOwnedEventOrPromo =
        isEventOrPromo && (ownerModel === 'Business' || !!postPreview?.user?.businessName);

    // Names
    const senderName = `${postPreview?.sender?.firstName || ''} ${postPreview?.sender?.lastName || ''}`.trim();
    const originalOwnerUserName =
        postPreview?.originalOwner?.__typename === 'User'
            ? `${postPreview?.originalOwner?.firstName || ''} ${postPreview?.originalOwner?.lastName || ''}`.trim()
            : '';
    const userObjName =
        (postPreview?.user?.firstName || postPreview?.user?.lastName)
            ? `${postPreview?.user?.firstName || ''} ${postPreview?.user?.lastName || ''}`.trim()
            : '';

    // Shared posts: use sharer's name first
    const sharerName = isShared ? (postPreview?.fullName || senderName || userObjName || '') : '';

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

    const displayName = isBusinessOwnedEventOrPromo
        ? (businessLabel || 'A business')
        : (personName || 'Someone');

    // Primary label rules
    let primaryLabel;
    if (overlayText) {
        primaryLabel = overlayText;
    } else if (isShared) {
        const sharedType = postPreview?.shared?.originalType || 'post';
        // originalType is canonical (e.g., 'reviews', 'events', 'promotions')
        const friendly = (
            sharedType === 'reviews' ? 'review' :
                sharedType === 'checkins' ? 'check-in' :
                    sharedType === 'invites' ? 'invite' :
                        sharedType === 'events' ? 'event' :
                            sharedType === 'promotions' ? 'promotion' :
                                sharedType
        );
        primaryLabel = `${sharerName || 'Someone'} shared a ${friendly}`;
    } else if (isLive) {
        primaryLabel = `${postPreview?.fullName || 'Someone'} is live`;
    } else if (isInvite) {
        primaryLabel = `${personName || 'Someone'}'s invite`;
    } else {
        const baseType = (
            canonicalType === 'reviews' ? 'review' :
                canonicalType === 'checkins' ? 'check-in' :
                    canonicalType === 'events' ? 'event' :
                        canonicalType === 'promotions' ? 'promotion' :
                            canonicalType === 'invites' ? 'invite' :
                                canonicalType === 'liveStreams' ? 'live' :
                                    'post'
        );
        primaryLabel = `${displayName}'s ${baseType}`;
    }

    // Secondary label
    let secondaryLabel = null;
    if (isInvite) {
        secondaryLabel = postPreview?.businessName || postPreview?.placeName || null;
    } else if (isLive) {
        secondaryLabel = postPreview?.live?.title || null;
    } else if (isShared) {
        // Pull secondary details from the original preview if available
        const op = postPreview?.shared?.originalPreview;
        if (op?.business?.businessName) {
            secondaryLabel = op.business.businessName;
        } else if (op?.placeName) {
            secondaryLabel = op.placeName;
        }
    }

    // Media selection
    let mediaKind = 'none';
    let mediaUri = null;

    if (isInvite) {
        mediaKind = (postPreview?.businessLogoUrl || postPreview?.sender?.profilePicUrl) ? 'image' : 'none';
        mediaUri = postPreview?.businessLogoUrl || postPreview?.sender?.profilePicUrl || null;
    } else if (isShared) {
        // Prefer mediaUrl (already bubbled from original by helper)
        if (postPreview?.mediaType === 'video') mediaKind = 'video';
        else if (postPreview?.mediaType === 'image') mediaKind = 'image';
        mediaUri = postPreview?.mediaUrl || null;

        // If nothing bubbled, fall back to originalPreview media
        if (!mediaUri && postPreview?.shared?.originalPreview) {
            const op = postPreview.shared.originalPreview;
            if (op.mediaType === 'video') mediaKind = 'video';
            else if (op.mediaType === 'image') mediaKind = 'image';
            mediaUri = op.mediaUrl || null;
        }
    } else if (isLive) {
        // Helper sets mediaType to 'live' when status === 'live', otherwise 'video'
        if (postPreview?.mediaType === 'live') mediaKind = 'image'; // show cover image with LIVE chip
        else if (postPreview?.mediaType === 'video') mediaKind = 'image'; // still image cover; playback handled on tap
        else mediaKind = 'none';
        mediaUri = postPreview?.mediaUrl || null;
    } else if (postPreview?.mediaType === 'video') {
        mediaKind = 'video';
        mediaUri = postPreview?.mediaUrl || null;
    } else if (postPreview?.mediaType === 'image') {
        mediaKind = 'image';
        mediaUri = postPreview?.mediaUrl || null;
    }

    // Bottom text & date chip (existing behavior)
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
                    {!!secondaryLabel && (
                        <Text style={styles.overlaySubText} numberOfLines={1}>{secondaryLabel}</Text>
                    )}
                    {!!dateChip && (
                        <View style={styles.dateChip}>
                            <Text style={styles.dateChipText}>{dateChip}</Text>
                        </View>
                    )}
                    {isLive && postPreview?.live?.status === 'live' && (
                        <View style={styles.livePill}>
                            <Text style={styles.liveText}>LIVE</Text>
                        </View>
                    )}
                </View>
            )}
            {mediaKind === 'image' && mediaUri ? (
                <Image source={{ uri: mediaUri }} style={styles.media} resizeMode="cover" />
            ) : mediaKind === 'video' && mediaUri ? (
                <VideoThumbnail file={{ uri: mediaUri }} width={width} height={height} shouldPlay={false} />
            ) : (
                <View style={[styles.media, styles.placeholder]}>
                    <Text style={styles.placeholderEmoji}>
                        {isInvite ? '🎟️' : isLive ? '🔴' : isShared ? '🔁' : '🖼️'}
                    </Text>
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
    livePill: {
        marginTop: 6,
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255, 0, 0, 0.85)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    liveText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

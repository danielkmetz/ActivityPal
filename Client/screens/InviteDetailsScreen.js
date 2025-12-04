import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    ScrollView,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import { selectPostById } from '../Slices/PostsSelectors/postsSelectors';
import { selectUser } from '../Slices/UserSlice';
import { getBucketKeyFromMs, labelForBucket } from '../utils/buckets';
import { requestInvite } from '../Slices/PostsSlice';
import { createNotification } from '../Slices/NotificationsSlice';
import profilePicPlaceholder from '../assets/pics/profile-pic-placeholder.jpg'; // adjust path if needed
import { getStartTimeMs, formatClockLabel, formatFullDateLabel, computeViewerStatus, computeAttendance, viewerStatusLabel, privacyLabel} from '../utils/InviteDetails/helpers';

const pinPic = 'https://cdn-icons-png.flaticon.com/512/684/684908.png';

export default function InviteDetailsScreen() {
    const route = useRoute();
    const dispatch = useDispatch();

    const postId = route.params?.postId || null;

    const invite = useSelector((state) =>
        postId ? selectPostById(state, postId) : null
    );
    const currentUser = useSelector(selectUser);

    const currentUserId =
        currentUser?.id || currentUser?._id || currentUser?.userId || null;

    const [requested, setRequested] = useState(false);

    const {
        postContent,
        owner,
        fullName,
        isYou,
        bucketLabel,
        businessName,
        businessLogoUrl,
        clockLabel,
        fullDateLabel,
        note,
        viewerStatus,
        viewerStatusText,
        privacyText,
        attendance,
    } = useMemo(() => {
        if (!invite) {
            return {
                postContent: null,
                owner: null,
                fullName: '',
                isYou: false,
                bucketLabel: '',
                businessName: '',
                businessLogoUrl: null,
                clockLabel: '',
                fullDateLabel: '',
                note: '',
                viewerStatus: null,
                viewerStatusText: null,
                privacyText: null,
                attendance: {
                    goingCount: 0,
                    pendingCount: 0,
                    declinedCount: 0,
                    total: 0,
                    preview: [],
                    goingPeople: [],
                    pendingPeople: [],
                    declinedPeople: [],
                },
            };
        }

        const content = invite.original || invite;
        const ownerObj = content.owner || null;
        const ownerId =
            ownerObj?.id || ownerObj?._id || ownerObj?.userId || null;

        const isYouFlag =
            ownerId && currentUserId && String(ownerId) === String(currentUserId);

        const firstName = ownerObj?.firstName || '';
        const lastName = ownerObj?.lastName || '';
        const fn = [firstName, lastName].filter(Boolean).join(' ') || 'Someone';

        const startMs = getStartTimeMs(content);
        const bucketKey = getBucketKeyFromMs(startMs);
        const bucketLabelVal = labelForBucket(bucketKey);

        const bName =
            content.businessName ||
            content.business?.businessName ||
            'Unnamed Location';

        const logoUrl =
            content.businessLogoUrl ||
            content.business?.logoUrl ||
            null;

        const clock = formatClockLabel(content);
        const fullDate = formatFullDateLabel(content);
        const noteText = (content.message || '').trim();

        const vStatus = computeViewerStatus(content, currentUserId);
        const vStatusText = viewerStatusLabel(vStatus);
        const privText = privacyLabel(content) || privacyLabel(invite);
        const attendanceInfo = computeAttendance(content);

        return {
            postContent: content,
            owner: ownerObj,
            fullName: fn,
            isYou: isYouFlag,
            bucketLabel: bucketLabelVal,
            businessName: bName,
            businessLogoUrl: logoUrl,
            clockLabel: clock,
            fullDateLabel: fullDate,
            note: noteText,
            viewerStatus: vStatus,
            viewerStatusText: vStatusText,
            privacyText: privText,
            attendance: attendanceInfo,
        };
    }, [invite, currentUserId]);

    const meId = currentUserId ? String(currentUserId) : null;

    const doAccept = async () => {
        if (!postContent || !meId) return;
        try {
            await dispatch(
                acceptInvite({
                    recipientId: meId,
                    inviteId: postContent._id || invite._id,
                })
            ).unwrap();
        } catch (e) {
            console.warn('Failed to accept invite:', e?.message || e);
        }
    };

    const doDecline = async () => {
        if (!postContent || !meId) return;
        try {
            await dispatch(
                rejectInvite({
                    recipientId: meId,
                    inviteId: postContent._id || invite._id,
                })
            ).unwrap();
        } catch (e) {
            console.warn('Failed to decline invite:', e?.message || e);
        }
    };

    const promptEditResponse = () => {
        if (viewerStatus === 'going') {
            Alert.alert(
                'Edit response',
                'Change your response?',
                [
                    { text: 'Decline', style: 'destructive', onPress: doDecline },
                    { text: 'Cancel', style: 'cancel' },
                ],
                { cancelable: true }
            );
        } else if (viewerStatus === 'declined') {
            Alert.alert(
                'Edit response',
                'Change your response?',
                [
                    { text: 'Accept', onPress: doAccept },
                    { text: 'Cancel', style: 'cancel' },
                ],
                { cancelable: true }
            );
        }
    };

    if (!invite || !postContent) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                    This invite is no longer available.
                </Text>
            </View>
        );
    }

    const avatarUri = owner?.profilePicUrl || owner?.avatarUrl || null;

    const {
        goingCount,
        pendingCount,
        declinedCount,
        total,
        preview,
        goingPeople,
        pendingPeople,
        declinedPeople,
    } = attendance;

    const attendanceSummaryParts = [];
    if (goingCount > 0) attendanceSummaryParts.push(`${goingCount} going`);
    if (pendingCount > 0) attendanceSummaryParts.push(`${pendingCount} invited`);
    if (declinedCount > 0) attendanceSummaryParts.push(`${declinedCount} declined`);
    const attendanceSummary =
        attendanceSummaryParts.length > 0
            ? attendanceSummaryParts.join(' · ')
            : total > 0
                ? `${total} invited`
                : 'No attendees yet';

    const senderId =
        owner?.id || owner?._id || owner?.userId || null;

    const details = postContent?.details || {};
    const requestsArr = Array.isArray(details.requests)
        ? details.requests
        : [];
    const hasRequestedFromServer =
        currentUserId &&
        requestsArr.some(
            (r) => String(r.userId) === String(currentUserId)
        );

    const hasRequested = requested || hasRequestedFromServer;

    const canRequestJoin =
        !isYou &&
        !viewerStatus && // not hosting, not invited, not going/declined
        !!currentUserId;

    const handleRequestJoin = async () => {
        if (!postContent || !currentUserId) return;

        try {
            await dispatch(
                requestInvite({
                    userId: currentUserId,
                    inviteId: postContent._id || invite._id,
                })
            ).unwrap();

            if (senderId) {
                await dispatch(
                    createNotification({
                        userId: senderId,
                        type: 'requestInvite',
                        message: `${currentUser.firstName} wants to join your event at ${businessName}`,
                        relatedId: currentUserId,
                        typeRef: 'User',
                        targetId: postContent._id || invite._id,
                        targetRef: 'Post',
                        postType: 'invite',
                    })
                ).unwrap();
            }

            setRequested(true);
            Alert.alert('Request sent', 'Your request has been sent!');
        } catch (err) {
            console.error('❌ Failed to request invite or send notification:', err);
            Alert.alert('Error', err?.message || 'Something went wrong.');
        }
    };

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            bounces={false}
        >
            {/* "Tonight" / "Tomorrow" / "This weekend" */}
            <View style={styles.bucketRow}>
                <Text style={styles.bucketLabel}>{bucketLabel}</Text>
            </View>
            {/* Big event title / note */}
            {note ? (
                <Text style={styles.eventTitle}>{note}</Text>
            ) : null}
            {/* Host / user hero */}
            <View style={styles.hero}>
                <View style={styles.avatarWrapper}>
                    {avatarUri ? (
                        <Image
                            source={{ uri: avatarUri }}
                            style={styles.avatar}
                        />
                    ) : (
                        <Image
                            source={profilePicPlaceholder}
                            style={styles.avatar}
                        />
                    )}
                </View>
                <Text style={styles.nameText}>{fullName}</Text>
                <View style={styles.heroSublineRow}>
                    <Text style={styles.heroSublineText}>
                        {isYou ? 'You are hosting this' : 'Hosting this plan'}
                    </Text>
                </View>
                <View style={styles.heroPillsRow}>
                    <View style={styles.pill}>
                        <Text style={styles.pillText}>{isYou ? 'YOU' : 'HOST'}</Text>
                    </View>
                    {viewerStatusText && !isYou ? (
                        <View style={[styles.pill, styles.secondaryPill]}>
                            <Text style={styles.secondaryPillText}>
                                {viewerStatusText}
                            </Text>
                        </View>
                    ) : null}
                    {privacyText ? (
                        <View style={[styles.pill, styles.secondaryPill]}>
                            <Text style={styles.secondaryPillText}>{privacyText}</Text>
                        </View>
                    ) : null}
                </View>
            </View>
            {/* Place & time block */}
            <View style={styles.placeBlock}>
                <View style={styles.placeRow}>
                    <View style={styles.placeIconWrapper}>
                        {businessLogoUrl ? (
                            <Image
                                source={{ uri: businessLogoUrl }}
                                style={styles.placeIcon}
                            />
                        ) : (
                            <Image
                                source={{ uri: pinPic }}
                                style={styles.placeIcon}
                            />
                        )}
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.placeName} numberOfLines={2}>
                            {businessName}
                        </Text>
                        {!!fullDateLabel && (
                            <Text style={styles.fullDateText}>{fullDateLabel}</Text>
                        )}
                        {!!clockLabel && !fullDateLabel && (
                            <Text style={styles.fullDateText}>{clockLabel}</Text>
                        )}
                    </View>
                </View>
            </View>
            {/* Attendance / who’s invited */}
            <View style={styles.attendanceBlock}>
                <Text style={styles.sectionTitle}>Who’s invited</Text>
                <View style={styles.attendanceRow}>
                    {preview.map((p) => (
                        <View key={p.id} style={styles.attendeeAvatarWrapper}>
                            {p.avatarUrl ? (
                                <Image
                                    source={{ uri: p.avatarUrl }}
                                    style={styles.attendeeAvatar}
                                />
                            ) : (
                                <View style={styles.attendeeFallback}>
                                    <Text style={styles.attendeeFallbackText}>
                                        {p.name ? p.name[0] : '?'}
                                    </Text>
                                </View>
                            )}
                        </View>
                    ))}
                    {total > preview.length ? (
                        <Text style={styles.moreInvitedText}>
                            +{total - preview.length} more
                        </Text>
                    ) : null}
                </View>
                <Text style={styles.attendanceSummaryText}>
                    {attendanceSummary}
                </Text>
                {/* Going list */}
                {goingPeople.length > 0 && (
                    <View style={styles.subSection}>
                        <Text style={styles.subSectionTitle}>Going</Text>
                        {goingPeople.map((p) => (
                            <View key={p.id} style={styles.personRow}>
                                <View style={styles.personAvatarWrapper}>
                                    {p.avatarUrl ? (
                                        <Image
                                            source={{ uri: p.avatarUrl }}
                                            style={styles.personAvatar}
                                        />
                                    ) : (
                                        <View style={styles.attendeeFallback}>
                                            <Text style={styles.attendeeFallbackText}>
                                                {p.name ? p.name[0] : '?'}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={styles.personName}>{p.name}</Text>
                            </View>
                        ))}
                    </View>
                )}
                {/* Declined list */}
                {declinedPeople.length > 0 && (
                    <View style={styles.subSection}>
                        <Text style={styles.subSectionTitle}>Declined</Text>
                        {declinedPeople.map((p) => (
                            <View key={p.id} style={styles.personRow}>
                                <View style={styles.personAvatarWrapper}>
                                    {p.avatarUrl ? (
                                        <Image
                                            source={{ uri: p.avatarUrl }}
                                            style={styles.personAvatar}
                                        />
                                    ) : (
                                        <View style={styles.attendeeFallback}>
                                            <Text style={styles.attendeeFallbackText}>
                                                {p.name ? p.name[0] : '?'}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={styles.personName}>{p.name}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>

            {/* RSVP controls for current user */}
            {viewerStatus && !isYou && (
                <View style={styles.rsvpBlock}>
                    {(viewerStatus === 'invited' || viewerStatus === 'pending') ? (
                        <>
                            <Text style={styles.rsvpLabel}>Your response</Text>
                            <View style={styles.rsvpButtonsRow}>
                                <TouchableOpacity
                                    style={[
                                        styles.rsvpButton,
                                        styles.rsvpButtonLeft,
                                        styles.rsvpPrimary,
                                    ]}
                                    onPress={doAccept}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.rsvpPrimaryText}>Going</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.rsvpButton, styles.rsvpSecondary]}
                                    onPress={doDecline}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.rsvpSecondaryText}>Decline</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    ) : (
                        (viewerStatus === 'going' || viewerStatus === 'declined') && (
                            <TouchableOpacity onPress={promptEditResponse}>
                                <Text style={styles.editResponseText}>
                                    Edit your response
                                </Text>
                            </TouchableOpacity>
                        )
                    )}
                </View>
            )}

            {/* Request to join CTA */}
            {canRequestJoin && (
                <TouchableOpacity
                    style={[
                        styles.requestButton,
                        hasRequested && styles.requestButtonDisabled,
                    ]}
                    onPress={handleRequestJoin}
                    disabled={hasRequested}
                    activeOpacity={0.8}
                >
                    <Text style={styles.requestButtonText}>
                        {hasRequested ? 'Request sent' : 'Request to join'}
                    </Text>
                </TouchableOpacity>
            )}
        </ScrollView>
    );
}

const AVATAR_SIZE = 112;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        marginTop: 120,
    },
    content: {
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 40,
    },
    bucketRow: {
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    bucketLabel: {
        fontSize: 16,
        color: '#777',
        fontWeight: '500',
    },
    eventTitle: {
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 16,
    },
    hero: {
        alignItems: 'center',
        marginBottom: 28,
    },
    avatarWrapper: {
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: AVATAR_SIZE / 2,
        overflow: 'hidden',
        marginBottom: 12,
        backgroundColor: '#f2f2f2',
    },
    avatar: {
        width: '100%',
        height: '100%',
    },
    nameText: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 4,
    },
    heroSublineRow: {
        marginBottom: 8,
    },
    heroSublineText: {
        fontSize: 13,
        color: '#666',
    },
    heroPillsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    pill: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: '#000',
        marginRight: 6,
    },
    pillText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: 0.5,
    },
    secondaryPill: {
        backgroundColor: '#F3F4F6',
    },
    secondaryPillText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#333',
    },
    placeBlock: {
        marginTop: 8,
        marginBottom: 24,
    },
    placeRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    placeIconWrapper: {
        width: 52,
        height: 52,
        borderRadius: 12,
        overflow: 'hidden',
        marginRight: 12,
        backgroundColor: '#f2f2f2',
    },
    placeIcon: {
        width: '100%',
        height: '100%',
    },
    placeName: {
        flex: 1,
        fontSize: 18,
        fontWeight: '700',
    },
    fullDateText: {
        fontSize: 14,
        color: '#555',
        marginTop: 4,
    },
    attendanceBlock: {
        marginTop: 8,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    attendanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    attendeeAvatarWrapper: {
        width: 32,
        height: 32,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#F3F4F6',
        marginRight: 4,
    },
    attendeeAvatar: {
        width: '100%',
        height: '100%',
    },
    attendeeFallback: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    attendeeFallbackText: {
        fontSize: 14,
        fontWeight: '700',
    },
    moreInvitedText: {
        marginLeft: 6,
        fontSize: 12,
        color: '#555',
    },
    attendanceSummaryText: {
        fontSize: 13,
        color: '#555',
        marginBottom: 10,
    },
    subSection: {
        marginTop: 8,
    },
    subSectionTitle: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 4,
    },
    personRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 3,
    },
    personAvatarWrapper: {
        width: 26,
        height: 26,
        borderRadius: 13,
        overflow: 'hidden',
        backgroundColor: '#F3F4F6',
        marginRight: 8,
    },
    personAvatar: {
        width: '100%',
        height: '100%',
    },
    personName: {
        fontSize: 13,
        color: '#222',
    },
    requestButton: {
        marginTop: 24,
        alignSelf: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: '#111',
    },
    requestButtonDisabled: {
        backgroundColor: '#999',
    },
    requestButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 14,
        color: '#777',
    },
    rsvpBlock: {
        marginTop: 24,
    },
    rsvpLabel: {
        fontSize: 13,
        color: '#555',
        marginBottom: 8,
    },
    rsvpButtonsRow: {
        flexDirection: 'row',
    },
    rsvpButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rsvpButtonLeft: {
        marginRight: 8,
    },
    rsvpPrimary: {
        backgroundColor: '#111',
    },
    rsvpPrimaryText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    rsvpSecondary: {
        backgroundColor: '#F3F4F6',
    },
    rsvpSecondaryText: {
        color: '#111',
        fontSize: 14,
        fontWeight: '600',
    },
    editResponseText: {
        fontSize: 13,
        color: '#007bff',
        textDecorationLine: 'underline',
        marginTop: 4,
    },
});

import React, { useMemo, useState, useRef } from 'react';
import { View, Text, StyleSheet, Image, Pressable, ImageBackground, Animated } from 'react-native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import VideoThumbnail from '../Reviews/VideoThumbnail';
import PostOptionsMenu from '../Reviews/PostOptionsMenu';
import PostActions from '../Reviews/PostActions/PostActions';
import PhotoFeed from '../Reviews/Photos/PhotoFeed';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser } from '../../Slices/UserSlice';

dayjs.extend(relativeTime);

export default function LiveStreamCard({
  live,
  onOpen,
  onShare,
  onProfile,
  handleEdit,
  handleDelete,
  sharedPost,
  handleLikeWithAnimation,
  photoTapped,
  setPhotoTapped,
  embeddedInShared,
}) {
  if (!live) return null;
  const dispatch = useDispatch();
  const lastTapRef = useRef({});
  const postContent =
    embeddedInShared && live && live?.original
      ? live?.original
      : live;
  const owner = postContent?.owner || {};
  const details = postContent?.details || {};
  const _id = postContent?._id;
  const userId = owner?.id || owner?._id;
  const profilePicUrl = owner?.profilePicUrl || null;
  const fullName = owner?.fullName || [owner?.firstName, owner?.lastName].filter(Boolean).join(' ') || 'Someone';
  const caption = postContent?.message || '';
  const status = details?.status || 'idle';
  const isLive = status === 'live';
  const playbackUrl = details?.playbackUrl || null;
  const vodUrl = details?.vodUrl || null;
  const durationSecs = typeof details?.durationSec === 'number' ? details?.durationSec : null;
  const previewThumbUrl = details?.coverUrl || null;
  const timestamp = details?.startedAt || live?.sortDate || live?.createdAt;
  const user = useSelector(selectUser);
  const isSender = userId && user?.id && String(userId) === String(user?.id);
  const likeAnim = useRef(new Animated.Value(0)).current;
  const currentIndexRef = useRef(0);
  const [dropdownVisible, setDropdownVisible] = useState(false);

  const timeAgo = useMemo(() => {
    if (!timestamp) return '';
    const d = dayjs(timestamp);
    return d.isValid() ? d.fromNow() : '';
  }, [timestamp]);

  const fileForThumb = useMemo(() => {
    const src = isLive ? playbackUrl : (vodUrl || playbackUrl);
    return src ? { type: 'hls', playbackUrl: src } : null;
  }, [isLive, playbackUrl, vodUrl]);

  const headline = isLive ? 'is live now' : 'posted a live replay';

  const handleOpen = () => onOpen?.(live);
  const handleProfile = () => onProfile?.(userId);

  return (
    <View style={styles.card} key={_id}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleProfile} style={styles.userRow}>
          {profilePicUrl ? (
            <Image source={{ uri: profilePicUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]} />
          )}
          <View style={styles.nameCol}>
            <Text numberOfLines={1} style={styles.name}>
              {fullName}
            </Text>
            <View style={styles.metaRow}>
              {isLive && <LiveBadge />}
              <Text style={styles.timeText}>
                {isLive ? '• ' : ''}
                {headline} · {timeAgo}
              </Text>
            </View>
          </View>
        </Pressable>
        {!embeddedInShared && (
          <PostOptionsMenu
            isSender={!!isSender}
            dropdownVisible={dropdownVisible}
            setDropdownVisible={setDropdownVisible}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            postData={live}
          />
        )}
      </View>
      {/* Caption */}
      {caption ? (
        <Text style={styles.caption} numberOfLines={3}>
          {caption}
        </Text>
      ) : null}
      {/* Media thumb */}
      <Pressable onPress={handleOpen} style={styles.mediaWrap}>
        {fileForThumb ? (
          // <View style={styles.thumbBox}>
          //   <VideoThumbnail
          //     file={fileForThumb}
          //     postItem={live}
          //     width={200}
          //     height={200}
          //     likeAnim={likeAnim}
          //     reviewItem={live}
          //     onDoubleTap={() =>
          //       handleLikeWithAnimation({
          //         postType: 'liveStream',
          //         postId: _id,
          //         review: live,
          //         user,
          //         animation: likeAnim,
          //         lastTapRef,
          //         dispatch,
          //         force: true,
          //       })
          //     }
          //   />
          // </View>
          <PhotoFeed 
            post={live}
            photoTapped={photoTapped}
            setPhotoTapped={setPhotoTapped}
            currentIndexRef={currentIndexRef}
          />
        ) : previewThumbUrl ? (
          <ImageBackground
            source={{ uri: previewThumbUrl }}
            style={styles.thumbBox}
            imageStyle={styles.thumbImage}
          >
            <PlayOverlay isLive={!!isLive} durationSecs={durationSecs} />
          </ImageBackground>
        ) : (
          <View style={[styles.thumbBox, styles.thumbFallback]}>
            <Text style={styles.fallbackText}>Live Stream</Text>
            <PlayOverlay isLive={!!isLive} durationSecs={durationSecs} />
          </View>
        )}
      </Pressable>
      {!sharedPost && (
        <View style={{ marginTop: 15 }}>
          <PostActions
            post={live}
            photo={vodUrl || playbackUrl || null}
            onShare={onShare}
            embeddedInShared={embeddedInShared}
          />
        </View>
      )}
    </View>
  );
}

/* ---------- Small helpers ---------- */

function LiveBadge() {
  return (
    <View style={styles.liveBadge}>
      <Text style={styles.liveBadgeText}>LIVE</Text>
    </View>
  );
}

function PlayOverlay({ isLive, durationSecs }) {
  const dur = formatDuration(durationSecs);
  return (
    <View style={styles.overlay}>
      <View style={styles.playBtn}>
        <Text style={styles.playIcon}>▶</Text>
      </View>
      {!isLive && dur ? (
        <View style={styles.durationPill}>
          <Text style={styles.durationText}>{dur}</Text>
        </View>
      ) : null}
    </View>
  );
}

function formatDuration(secs) {
  if (!secs && secs !== 0) return null;
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

/* ---------- Styles ---------- */

const stylesVars = {
  thumbW: 360,
  thumbH: 202, // ~16:9
  radius: 12,
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 12,
    borderRadius: 12,
    borderColor: '#eee',
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  avatarFallback: {
    backgroundColor: '#e5e7eb',
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontWeight: '600',
    fontSize: 14,
    color: '#111',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  timeText: {
    fontSize: 12,
    color: '#6b7280',
  },
  more: {
    fontSize: 22,
    color: '#9ca3af',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  caption: {
    fontSize: 14,
    color: '#111',
    marginBottom: 10,
  },
  mediaWrap: {
    alignItems: 'center',
  },
  thumbBox: {
    width: stylesVars.thumbW,
    height: stylesVars.thumbH,
    borderRadius: stylesVars.radius,
    overflow: 'hidden',
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbImage: {
    resizeMode: 'cover',
  },
  thumbFallback: {
    backgroundColor: '#0f172a',
  },
  fallbackText: {
    color: '#e5e7eb',
    fontSize: 13,
  },
  liveBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  liveBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 24,
    color: '#fff',
    marginLeft: 2, // optical centering for triangle
  },
  durationPill: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  durationText: {
    color: '#fff',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});

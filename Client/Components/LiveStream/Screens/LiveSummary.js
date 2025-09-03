import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Video } from 'expo-av';
import ShareOptionsModal from '../../Reviews/SharedPosts/ShareOptionsModal';
import SharePostModal from '../../Reviews/SharedPosts/SharePostModal';
import { useDispatch, useSelector } from 'react-redux';
import { fetchReplay, makeSelectReplayById, clearReplay } from '../../../Slices/LiveStreamSlice';

async function head(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return { ok: res.ok, status: res.status, ct: res.headers.get('content-type') || '' };
  } catch (e) {
    return { ok: false, status: -1, ct: '', err: String(e) };
  }
}

async function getText(url, maxChars = 8000) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    return { ok: res.ok, status: res.status, ct: res.headers.get('content-type') || '', text: text.slice(0, maxChars) };
  } catch (e) {
    return { ok: false, status: -1, ct: '', text: '', err: String(e) };
  }
}

// pull first media playlist or first segment from an HLS master/media playlist
function parseHlsForFirstRefs(playlistText, baseUrl) {
  const lines = (playlistText || '').split('\n').map(l => l.trim()).filter(Boolean);
  const firstStreamInfIdx = lines.findIndex(l => l.startsWith('#EXT-X-STREAM-INF'));
  let firstVariantRel = null;
  if (firstStreamInfIdx >= 0) {
    firstVariantRel = lines[firstStreamInfIdx + 1] || null;
  }

  const firstInfIdx = lines.findIndex(l => l.startsWith('#EXTINF'));
  let firstSegmentRel = null;
  if (firstInfIdx >= 0) {
    firstSegmentRel = lines[firstInfIdx + 1] || null;
  }

  function resolve(base, rel) {
    if (!rel) return null;
    try {
      return new URL(rel, base).toString();
    } catch {
      return null;
    }
  }

  return {
    firstVariantUrl: resolve(baseUrl, firstVariantRel),
    firstSegmentUrl: resolve(baseUrl, firstSegmentRel),
    isMaster: firstStreamInfIdx >= 0,
    isMedia: firstInfIdx >= 0,
  };
}

// Wait for at least one variant playlist to be reachable (200)
async function waitForVariantOk(masterUrl, timeoutMs = 20000, intervalMs = 700) {
  const mh = await head(masterUrl);
  if (!mh.ok) return { ok: false, reason: `master ${mh.status}` };

  const mg = await getText(masterUrl, 8000);
  if (!mg.ok) return { ok: false, reason: `master GET ${mg.status}` };
  const { firstVariantUrl } = parseHlsForFirstRefs(mg.text, masterUrl);
  if (!firstVariantUrl) return { ok: false, reason: 'no variant found in master' };

  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await head(firstVariantUrl);
    if (last.ok) return { ok: true, variantUrl: firstVariantUrl };
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { ok: false, reason: `variant not ready (${last?.status})`, variantUrl: firstVariantUrl };
}

export default function LiveSummary({ route, navigation }) {
  const { liveId, title } = route.params || {};
  const dispatch = useDispatch();
  const selectReplayById = useMemo(() => makeSelectReplayById(liveId), [liveId]);
  const replay = useSelector(selectReplayById);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerErr, setPlayerErr] = useState(null);
  const [shareOptionsVisible, setShareOptionsVisible] = useState(false);
  const [postToShare, setPostToShare] = useState(null);
  const [postToFeedModal, setPostToFeedModal] = useState(false);
  const videoRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!liveId) return;
    dispatch(clearReplay(liveId));
  }, [liveId, dispatch]);

  // Poll backend until THIS replay is ready
  useEffect(() => {
    if (!liveId) return;
    const tick = () => dispatch(fetchReplay(liveId));
    tick(); // immediate
    pollRef.current = setInterval(tick, 3000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [liveId, dispatch]);

  // Stop polling once ready/failed
  useEffect(() => {
    if (!pollRef.current) return;
    if (replay?.ready || replay?.status === 'failed') {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [replay?.ready, replay?.status]);

  const backendReady = !!replay?.ready;
  const playbackUrl = replay?.playbackUrl;

  // Gate the player until a variant is reachable
  useEffect(() => {
    let cancelled = false;
    setPlayerReady(false);
    setPlayerErr(null);

    (async () => {
      if (!backendReady || !playbackUrl) return;
      const res = await waitForVariantOk(playbackUrl, 20000, 700);
      if (cancelled) return;
      if (res.ok) setPlayerReady(true);
      else setPlayerErr(res.reason || 'HLS variants not ready');
    })();

    return () => { cancelled = true; };
  }, [backendReady, playbackUrl]);

  const handleLoadStart = () => {};
  const handleLoad = () => {};
  const handleError = () => {};

  const handleShareToStory = () => {
    setShareOptionsVisible(false);
    navigation.navigate('StoryPreview', { post: postToShare });
  };

  const openShareToFeedModal = () => {
    setShareOptionsVisible(false);
    setPostToFeedModal(true);
  };

  const openShareOptions = () => {
    setShareOptionsVisible(true);
    setPostToShare(replay);
  };

  const closeShareOptions = () => {
    setShareOptionsVisible(false);
    setPostToShare(null);
  };

  return (
    <>
      <View style={S.wrap}>
        <Text style={S.h1}>Live ended</Text>
        <Text style={S.sub}>{title || 'Untitled'}</Text>

        {!liveId ? (
          <View style={S.panel}>
            <Text style={S.err}>Missing liveId</Text>
          </View>
        ) : !backendReady ? (
          <View style={S.panel}>
            <ActivityIndicator />
            <Text style={S.hint}>Processing replay…</Text>
            {replay?.live ? <Text style={S.hint}>Stream still looks live—finalizing…</Text> : null}
            {replay?.status === 'failed' ? <Text style={S.err}>{replay?.error}</Text> : null}
          </View>
        ) : !playerReady ? (
          <View style={S.panel}>
            <ActivityIndicator />
            <Text style={S.hint}>Preparing replay…</Text>
            {playerErr ? <Text style={S.hint}>Waiting for HLS variants… ({playerErr})</Text> : null}
          </View>
        ) : (
          <View style={S.playerCard}>
            <Video
              ref={videoRef}
              style={S.video}
              source={{ uri: playbackUrl }} // .../media/hls/master.m3u8
              useNativeControls
              shouldPlay={false}
              resizeMode="contain"
              onLoadStart={handleLoadStart}
              onLoad={handleLoad}
              onError={handleError}
            />
            <View style={S.meta}>
              <Text style={S.metaLine}>URL: {playbackUrl}</Text>
            </View>
          </View>
        )}

        <Pressable
          style={[S.cta, !(backendReady && playerReady) && { opacity: 0.6 }]}
          disabled={!(backendReady && playerReady)}
          onPress={openShareOptions}
        >
          <Text style={S.ctaTxt}>
            {backendReady && playerReady ? 'Create Post with Replay' : 'Preparing Replay…'}
          </Text>
        </Pressable>

        <Pressable onPress={() => navigation.popToTop()}>
          <Text style={S.link}>Done</Text>
        </Pressable>
      </View>

      <ShareOptionsModal
        visible={shareOptionsVisible}
        onClose={closeShareOptions}
        onShareToFeed={openShareToFeedModal}
        onShareToStory={handleShareToStory}
      />
      <SharePostModal
        visible={postToFeedModal}
        onClose={() => setPostToFeedModal(false)}
        post={replay}
      />
    </>
  );
}

const S = StyleSheet.create({
  wrap: { flex: 1, padding: 20, gap: 12, backgroundColor: '#0b0b0b', paddingTop: 60 },
  h1: { fontSize: 22, fontWeight: '800', color: '#fff' },
  sub: { color: '#bbb' },
  panel: { padding: 16, backgroundColor: '#111', borderRadius: 12, alignItems: 'center', gap: 8 },
  hint: { color: '#9ca3af' },
  err: { color: '#ef4444' },
  playerCard: { backgroundColor: '#111', borderRadius: 12, overflow: 'hidden' },
  video: { width: '100%', height: 220, backgroundColor: '#000' },
  meta: { padding: 8, borderTopWidth: 1, borderTopColor: '#222' },
  metaLine: { color: '#9ca3af', fontSize: 12 },
  cta: { backgroundColor: '#2563EB', padding: 12, borderRadius: 12, alignItems: 'center' },
  ctaTxt: { color: '#fff', fontWeight: '700' },
  link: { color: '#9ca3af', marginTop: 8 },
});

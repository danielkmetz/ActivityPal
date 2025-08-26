import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Video } from 'expo-av';
import ShareOptionsModal from '../../Reviews/SharedPosts/ShareOptionsModal';
import SharePostModal from '../../Reviews/SharedPosts/SharePostModal';
import { useDispatch, useSelector } from 'react-redux';
import { fetchReplay, makeSelectReplayById, clearReplay } from '../../../Slices/LiveStreamSlice';

const LOG_PREFIX = '[LiveSummaryDiag]';

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

// very light parser: pull first media playlist or first segment from an HLS master/media playlist
function parseHlsForFirstRefs(playlistText, baseUrl) {
  const lines = (playlistText || '').split('\n').map(l => l.trim()).filter(Boolean);
  const firstStreamInfIdx = lines.findIndex(l => l.startsWith('#EXT-X-STREAM-INF'));
  let firstVariantRel = null;
  if (firstStreamInfIdx >= 0) {
    // the URL is typically on the next line
    firstVariantRel = lines[firstStreamInfIdx + 1] || null;
  };

  // For media playlist, look for first segment line after any #EXTINF
  const firstInfIdx = lines.findIndex(l => l.startsWith('#EXTINF'));
  let firstSegmentRel = null;
  if (firstInfIdx >= 0) {
    firstSegmentRel = lines[firstInfIdx + 1] || null;
  }

  // Helper to resolve relative to base
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
    isMedia: firstInfIdx >= 0
  };
}

// ---- NEW: wait for at least one variant playlist to be reachable (200) ----
async function waitForVariantOk(masterUrl, push, timeoutMs = 20000, intervalMs = 700) {
  // Confirm master exists
  const mh = await head(masterUrl);
  push('VARIANT-GATE master HEAD', mh);
  if (!mh.ok) return { ok: false, reason: `master ${mh.status}` };

  // Parse master to get first variant URL
  const mg = await getText(masterUrl, 8000);
  if (!mg.ok) return { ok: false, reason: `master GET ${mg.status}` };
  const { firstVariantUrl } = parseHlsForFirstRefs(mg.text, masterUrl);
  if (!firstVariantUrl) return { ok: false, reason: 'no variant found in master' };

  // Poll HEAD on the variant until ok or timeout
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await head(firstVariantUrl);
    push('VARIANT-GATE variant HEAD', { url: firstVariantUrl, ...last });
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

  // local diag state
  const [diag, setDiag] = useState({ lines: [] });
  const push = (...args) => {
    console.log(LOG_PREFIX, ...args);
    setDiag(prev => ({ lines: [...prev.lines, args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')] }));
  };

  useEffect(() => {
    if (!liveId) return;
    dispatch(clearReplay(liveId));
  }, [liveId, dispatch]);

  // Poll backend until THIS replay is ready
  useEffect(() => {
    if (!liveId) return;
    const tick = () => {
      push('poll → fetchReplay', liveId);
      dispatch(fetchReplay(liveId));
    };
    tick(); // immediate fire
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
      push('poll stop condition → ready:', !!replay?.ready, 'status:', replay?.status);
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [replay?.ready, replay?.status]);

  const backendReady = !!replay?.ready;
  const playbackUrl = replay?.playbackUrl;

  // ---- NEW: Variant readiness state (gates the player) ----
  useEffect(() => {
    let cancelled = false;
    setPlayerReady(false);
    setPlayerErr(null);

    (async () => {
      if (!backendReady || !playbackUrl) return;
      push('VARIANT-GATE start for', playbackUrl);
      const res = await waitForVariantOk(playbackUrl, push, 20000, 700);
      if (cancelled) return;
      if (res.ok) {
        push('VARIANT-GATE ready ✅', { variantUrl: res.variantUrl });
        setPlayerReady(true);
      } else {
        push('VARIANT-GATE not ready ❌', res);
        setPlayerErr(res.reason || 'HLS variants not ready');
      }
    })();

    return () => { cancelled = true; };
  }, [backendReady, playbackUrl]);

  // ---- HLS Diagnostics Probe (runs each time playbackUrl becomes available) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!playbackUrl) return;
      push('DIAG start for', playbackUrl);

      // HEAD playlist
      const h = await head(playbackUrl);
      if (cancelled) return;
      push('HEAD master.m3u8', { status: h.status, ok: h.ok, ct: h.ct, err: h.err });

      // GET a slice of the playlist text so we can parse
      const g = await getText(playbackUrl, 4000);
      if (cancelled) return;
      push('GET master.m3u8', { status: g.status, ok: g.ok, ct: g.ct, bytes: g.text.length, err: g.err });

      if (!g.ok) {
        push('MASTER NOT OK → likely ACL or URL problem');
        return;
      }
      const first30 = g.text.split('\n').slice(0, 30).join('\n');
      push('master.m3u8 first 30 lines:\n' + first30);

      const { firstVariantUrl, firstSegmentUrl, isMaster, isMedia } = parseHlsForFirstRefs(g.text, playbackUrl);
      push('parsed', { isMaster, isMedia, firstVariantUrl, firstSegmentUrl });

      // If it’s a master and we discovered a variant, probe that
      if (firstVariantUrl) {
        const vh = await head(firstVariantUrl);
        if (cancelled) return;
        push('HEAD variant.m3u8', { url: firstVariantUrl, status: vh.status, ok: vh.ok, ct: vh.ct, err: vh.err });

        const vg = await getText(firstVariantUrl, 3000);
        if (cancelled) return;
        push('GET variant.m3u8', { status: vg.status, ok: vg.ok, ct: vg.ct, bytes: vg.text.length, err: vg.err });

        if (vg.ok) {
          const vfirst30 = vg.text.split('\n').slice(0, 30).join('\n');
          push('variant.m3u8 first 30 lines:\n' + vfirst30);

          const parsedV = parseHlsForFirstRefs(vg.text, firstVariantUrl);
          if (parsedV.firstSegmentUrl) {
            const sh = await head(parsedV.firstSegmentUrl);
            if (cancelled) return;
            push('HEAD first segment', { url: parsedV.firstSegmentUrl, status: sh.status, ok: sh.ok, ct: sh.ct, err: sh.err });
          }
        }
      } else if (firstSegmentUrl) {
        // master was actually a media playlist
        const sh = await head(firstSegmentUrl);
        if (cancelled) return;
        push('HEAD first segment', { url: firstSegmentUrl, status: sh.status, ok: sh.ok, ct: sh.ct, err: sh.err });
      }

      push('DIAG done');
    })();
    return () => { cancelled = true; };
  }, [playbackUrl]);

  // ---- Video event logging ----
  const handleLoadStart = () => push('Video onLoadStart');
  const handleLoad = (data) => push('Video onLoad', { dur: data?.durationMillis, nat: data?.naturalSize });
  const handleError = (e) => {
    const err = e?.error || e;
    push('Video onError', err);
  };
  const handleStatusUpdate = (status) => {
    push('Video status', {
      isLoaded: status?.isLoaded,
      isPlaying: status?.isPlaying,
      pos: status?.positionMillis,
      dur: status?.durationMillis,
      rate: status?.rate
    });
  };

  const handleShareToStory = () => {
    setShareOptionsVisible(false);

    navigation.navigate('StoryPreview', {
      post: postToShare,
    })
  };

  const openShareToFeedModal = () => {
    setShareOptionsVisible(false);
    setPostToFeedModal(true);
  };

  const openShareOptions = () => {
    setShareOptionsVisible(true);
    setPostToShare(replay)
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
              onPlaybackStatusUpdate={handleStatusUpdate}
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
          <Text style={S.ctaTxt}>{backendReady && playerReady ? 'Create Post with Replay' : 'Preparing Replay…'}</Text>
        </Pressable>
        {/* Collapsible diagnostics panel (simple) */}
        <View style={S.diagBox}>
          <Text style={S.diagTitle}>Diagnostics</Text>
          <ScrollView style={{ maxHeight: 180 }}>
            {diag.lines.map((l, i) => (
              <Text key={i} style={S.diagLine}>{l}</Text>
            ))}
          </ScrollView>
        </View>
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
        // isEditing={null}
        // setIsEditing={null}
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
  diagBox: { backgroundColor: '#0f172a', borderRadius: 12, padding: 10, gap: 6, borderWidth: 1, borderColor: '#1f2937' },
  diagTitle: { color: '#93c5fd', fontWeight: '700' },
  diagLine: { color: '#9ca3af', fontSize: 11, lineHeight: 16 }
});

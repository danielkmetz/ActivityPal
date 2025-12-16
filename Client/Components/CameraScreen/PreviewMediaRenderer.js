import React, { useEffect, useRef } from "react";
import { View, Text, Image, StyleSheet, Dimensions } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { useSmartVideoPlayer } from "../../utils/useSmartVideoPlayer";
import { useEventListener } from "expo";
import { normalizeFileUri } from '../../utils/CameraScreen/normalizeFileUri';

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

const toSec = (x) => (typeof x === "number" && x > 1000 ? x / 1000 : (x || 0));

const deriveBannerMetrics = (fs) => {
  const fontSize = Number.isFinite(fs) ? fs : 32;
  const paddingX = Math.round(fontSize * 0.6);
  const paddingY = Math.round(fontSize * 0.1);
  const minBannerHeight = Math.round(fontSize * 1.7);
  return { fontSize, paddingX, paddingY, minBannerHeight };
};

export default function PreviewMediaRenderer(props) {
  const {
    mediaUri,
    currentSegment,
    mediaType,
    segments = [],
    currentSegmentIndex = 0,
    setCurrentSegmentIndex = () => { },
    captions = [],
    renderCaptionsForBurn = false,
    imageWithCaptionsRef,
    isPreview = true,
    onVideoProgress,
    onVideoEndedLastSegment,
    paused = false,
  } = props;

  const isMulti = mediaType === "video" && Array.isArray(segments) && segments.length > 0;
  const sourceUriRaw = isMulti ? currentSegment?.uri : mediaUri;
  const sourceUri = normalizeFileUri(sourceUriRaw);

  // keep latest callbacks & pause state without re-subscribing constantly
  const onVideoProgressRef = useRef(onVideoProgress);
  useEffect(() => {
    onVideoProgressRef.current = onVideoProgress;
  }, [onVideoProgress]);

  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // token to ignore stale events after the source changes
  const tokenRef = useRef(0);
  useEffect(() => {
    tokenRef.current += 1;
  }, [sourceUri]);

  const player = useSmartVideoPlayer(sourceUri, {
    forceIsVideo: mediaType === "video",          // don’t trust extension parsing for signed URLs
    shouldPlay: !paused,                          // use state here, not a ref
    shouldLoop: !!isPreview && !isMulti,          // loops ONLY for single-file preview
    timeUpdateEventInterval: isPreview ? 0.1 : 0, // 0 disables timeUpdate events :contentReference[oaicite:2]{index=2}
    muted: true,
  });

  const report = (t, d) => {
    if (pausedRef.current) return;
    const myToken = tokenRef.current;

    const tSec = toSec(t);
    const dSec = toSec(d || currentSegment?.duration || 0);
    if (dSec <= 0) return;

    const per = Math.max(0, Math.min(1, tSec / dSec));
    const overall = isMulti ? (currentSegmentIndex + per) / segments.length : per;

    if (myToken !== tokenRef.current) return;
    onVideoProgressRef.current?.(overall);
  };

  // Prefer Expo hook for time updates
  useEventListener(player, "timeUpdate", (e) => {
    if (pausedRef.current) return;
    report(e?.currentTime, e?.duration);
  });

  // Fallback polling
  useEffect(() => {
    if (!player) return;
    let mounted = true;
    const id = setInterval(() => {
      if (!mounted) return;
      const t = player.currentTime;
      const d = player.duration;
      if (typeof t === "number" && typeof d === "number") report(t, d);
    }, 100);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [player, isMulti, currentSegmentIndex, segments.length]);

  useEffect(() => {
    if (!player) return;

    const endSub = player.addListener("playToEnd", () => {
      const myToken = tokenRef.current;
      if (myToken === tokenRef.current) onVideoProgressRef.current?.(1);

      // Preview mode: keep looping
      if (isPreview) {
        if (isMulti) {
          setCurrentSegmentIndex((i) => (i + 1) % segments.length);
        }
        return;
      }

      // Non-preview mode: advance segments or signal end
      if (isMulti) {
        if (currentSegmentIndex < segments.length - 1) {
          setCurrentSegmentIndex((i) => i + 1);
        } else {
          onVideoEndedLastSegment?.();
        }
      } else {
        onVideoEndedLastSegment?.();
      }
    });

    return () => endSub.remove();
  }, [
    player,
    isPreview,
    isMulti,
    currentSegmentIndex,
    segments.length,
    setCurrentSegmentIndex,
    onVideoEndedLastSegment,
  ]);

  useEffect(() => {
    if (!player) return;
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);

  if (!sourceUri) return null;

  return (
    <View
      ref={mediaType === "photo" ? imageWithCaptionsRef : null}
      collapsable={false}
      style={styles.captureContainer}
    >
      {mediaType === "photo" ? (
        <Image source={{ uri: sourceUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <VideoView
          key={sourceUri}
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit="cover"
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          nativeControls={false}
          onError={(e) => console.log("📼 Video onError", e?.nativeEvent ?? e)}
          onStatusUpdate={(s) => {
            const t = s?.currentTime;
            const d = s?.duration;
            if (typeof t === "number" && typeof d === "number") report(t, d);
          }}
        />
      )}

      {/* ✅ Burn-safe caption overlay (ONLY when CameraPreview is committing) */}
      {renderCaptionsForBurn &&
        captions
          .filter((c) => (c?.text || "").trim().length > 0)
          .map((caption, idx) => {
            const { fontSize, paddingX, paddingY, minBannerHeight } = deriveBannerMetrics(
              caption?.fontSize || 32
            );

            const top = Number.isFinite(caption?.y) ? caption.y : screenHeight * 0.4 + 40 * idx;

            return (
              <View
                key={caption.id ?? idx}
                style={{
                  position: "absolute",
                  top,
                  left: 0,
                  right: 0,
                  alignItems: "center",
                  paddingHorizontal: 12,
                }}
              >
                <Text
                  style={{
                    fontSize,
                    color: caption?.color || "#fff",
                    backgroundColor: caption?.backgroundColor || "rgba(0,0,0,0.55)",
                    paddingHorizontal: paddingX,
                    paddingVertical: paddingY,
                    minHeight: minBannerHeight,
                    textAlign: "center",
                    textAlignVertical: "center",
                    width: "100%",
                  }}
                >
                  {caption.text}
                </Text>
              </View>
            );
          })}
    </View>
  );
}

const styles = StyleSheet.create({
  captureContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: screenWidth,
    height: screenHeight,
    zIndex: 0,
    backgroundColor: "black",
  },
});

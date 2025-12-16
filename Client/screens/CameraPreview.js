import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Dimensions, TouchableWithoutFeedback, Keyboard } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, CommonActions, StackActions } from "@react-navigation/native";
import * as FileSystem from "expo-file-system";
import CaptionInput from "../Components/CameraScreen/CaptionInput";
import PreviewMediaRenderer from "../Components/CameraScreen/PreviewMediaRenderer";
import { burnCaptionsToImage } from "../utils/burnCaptionsToImages";
import { compose as composeStory, addProgressListener, addLogListener } from "story-composer";
import { normalizeFileUri } from "../utils/CameraScreen/normalizeFileUri";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

export default function CameraPreview() {
  const route = useRoute();
  const navigation = useNavigation();
  // --- incoming params (from CameraScreen) ---
  const {
    file: fileParam = {},
    returnRouteKey,         // preferred (updates exact instance)
    returnRouteName,        // fallback (merge params into name after pop)
    returnMode,
    returnPopCount = 2,     // CameraPreview -> CameraScreen -> CreatePost
  } = route.params || {};
  const segments = fileParam?.segments;
  const mediaUri = fileParam?.uri;
  const mediaType = fileParam?.mediaType;
  const isPostFlow = returnMode === "post" && (!!returnRouteKey || !!returnRouteName);
  // --- UI state ---
  const [captions, setCaptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [focusedCaptionId, setFocusedCaptionId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [composeProgress, setComposeProgress] = useState(0);
  const imageWithCaptionsRef = useRef(null);
  // --- font sizing ---
  const [fontSize, setFontSize] = useState(32);
  const MIN_FONT = 12;
  const MAX_FONT = 64;
  const STEP = 2;

  const applyFontSizeToCaptions = useCallback((size) => {
    setCaptions((prev) => prev.map((c) => ({ ...c, fontSize: size })));
  }, []);

  const incFont = useCallback(() => {
    setFontSize((prev) => {
      const next = Math.min(MAX_FONT, prev + STEP);
      applyFontSizeToCaptions(next);
      return next;
    });
  }, [applyFontSizeToCaptions]);

  const decFont = useCallback(() => {
    setFontSize((prev) => {
      const next = Math.max(MIN_FONT, prev - STEP);
      applyFontSizeToCaptions(next);
      return next;
    });
  }, [applyFontSizeToCaptions]);

  const padding = useMemo(() => Math.round(fontSize * 0.6), [fontSize]);
  const minBannerHeight = useMemo(() => Math.round(fontSize * 1.7), [fontSize]);

  // --- normalize media inputs ---
  const normalizedSegments = useMemo(() => {
    return Array.isArray(segments)
      ? segments.map((s) => ({ ...s, uri: normalizeFileUri(s.uri) }))
      : [];
  }, [segments]);

  const effectiveUri = useMemo(() => {
    return normalizedSegments[0]?.uri || normalizeFileUri(mediaUri);
  }, [normalizedSegments, mediaUri]);

  const isMultiSegmentVideo = mediaType === "video" && normalizedSegments.length > 0;

  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);

  const currentSegment = useMemo(() => {
    return isMultiSegmentVideo
      ? normalizedSegments[currentSegmentIndex] || { uri: effectiveUri }
      : { uri: effectiveUri };
  }, [isMultiSegmentVideo, normalizedSegments, currentSegmentIndex, effectiveUri]);

  const createCaption = useCallback(() => {
    return {
      id: `${Date.now()}`,
      text: "",
      y: SCREEN_HEIGHT * 0.4,
      fontSize,
    };
  }, [fontSize]);

  const addNewCaption = useCallback(() => {
    const hasEmpty = captions.some((c) => (c.text || "").trim() === "");
    if (hasEmpty) return;

    const next = createCaption();
    setCaptions((prev) => [...prev, next]);
    setFocusedCaptionId(next.id);
  }, [captions, createCaption]);

  // --- composer: stitch segments + burn captions into video (only if needed) ---
  const composeIfNeeded = useCallback(async () => {
    const isVideo = mediaType === "video";
    if (!isVideo) return { composed: false, localPath: null };

    const hasSegments = normalizedSegments.length > 0;
    const hasCaptions = captions.some((c) => (c.text || "").trim().length > 0);

    const segs = hasSegments ? normalizedSegments : (effectiveUri ? [{ uri: effectiveUri }] : []);
    if (segs.length === 0) return { composed: false, localPath: null };

    if (segs.length <= 1 && !hasCaptions) return { composed: false, localPath: null };

    const sub = addProgressListener((e) => {
      if (typeof e?.progress === "number") setComposeProgress(e.progress);
    });
    const logSub = addLogListener((e) => {
      if (e?.message) console.log("🧩 [SC]", e.message);
    });

    try {
      const res = await composeStory({
        debug: false,
        screenWidth: SCREEN_WIDTH,
        fontFamily: "HelveticaNeue",
        fontWeight: "regular",
        fontSize,
        padding,
        vPadding: Math.round(fontSize * 0.1),
        minBannerHeight,
        sideMargin: 0,
        color: "#FFFFFF",
        bgColor: "rgba(0,0,0,0.55)",
        captions: captions
          .filter((c) => (c.text || "").trim())
          .map((c) => ({
            text: c.text,
            x: 0.5,
            y: c.y / SCREEN_HEIGHT,
            startMs: 0,
            endMs: 9_999_000,
            fontSize: c.fontSize || fontSize,
            color: "#FFFFFF",
            bgColor: "rgba(0,0,0,0.55)",
            padding,
            minBannerHeight,
            sideMargin: 0,
          })),
        segments: segs,
        outFileName: `post_${Date.now()}.mp4`,
      });

      const outUri = res?.uri ? normalizeFileUri(res.uri) : null;
      if (outUri) {
        const info = await FileSystem.getInfoAsync(outUri, { size: true });
        console.log("🧩 composed file info", info);
      }

      return { composed: !!outUri, localPath: outUri };
    } catch (e) {
      console.error("🧩 compose failed", e);
      throw e;
    } finally {
      sub?.remove?.();
      logSub?.remove?.();
      setComposeProgress(0);
    }
  }, [mediaType, normalizedSegments, effectiveUri, captions, fontSize, padding, minBannerHeight]);

  const clampPopCount = useCallback(() => {
    const state = navigation.getState?.();
    const len = state?.routes?.length || 0;
    // need at least 1 route to remain
    const maxPop = Math.max(0, len - 1);
    return Math.max(0, Math.min(returnPopCount || 0, maxPop));
  }, [navigation, returnPopCount]);

  // --- RETURN HANDSHAKE ---
  const returnToCreatePost = useCallback(
    (mediaArr) => {
      const payload = {
        capturedMedia: mediaArr,
        capturedAt: Date.now(), // forces CreatePost effect to re-run even if same array ref
      };

      if (!isPostFlow) {
        navigation.goBack();
        return;
      }

      const popCount = clampPopCount();

      // Preferred: update exact instance by route key WITHOUT navigating
      if (returnRouteKey) {
        navigation.dispatch({
          ...CommonActions.setParams(payload),
          source: returnRouteKey,
        });

        if (popCount > 0) navigation.dispatch(StackActions.pop(popCount));
        return;
      }

      // Fallback: pop back first, then merge params into route name
      if (returnRouteName) {
        if (popCount > 0) navigation.dispatch(StackActions.pop(popCount));

        // after pop completes, merge params into the existing route (won't push if it exists)
        requestAnimationFrame(() => {
          navigation.dispatch(
            CommonActions.navigate({
              name: returnRouteName,
              params: payload,
              merge: true,
            })
          );
        });
        return;
      }

      navigation.goBack();
    },
    [navigation, isPostFlow, returnRouteKey, returnRouteName, clampPopCount]
  );

  // --- DONE button ---
  const handleDone = useCallback(async () => {
    try {
      setIsSubmitting(true);
      setLoading(true);

      if (!mediaType || !effectiveUri) throw new Error("Missing media to preview.");

      const isPhoto = mediaType === "photo";
      const isVideo = mediaType === "video";

      let composedResult = { composed: false, localPath: null };
      if (isVideo) composedResult = await composeIfNeeded();

      let finalUri = composedResult.localPath || effectiveUri;

      if (isPhoto) {
        const hasCaptions = captions.some((c) => (c.text || "").trim().length > 0);
        if (hasCaptions && imageWithCaptionsRef.current) {
          await new Promise((r) => setTimeout(r, 200));
          finalUri = await burnCaptionsToImage(imageWithCaptionsRef.current);
        } else {
          finalUri = effectiveUri;
        }
      }

      finalUri = normalizeFileUri(finalUri);

      const info = await FileSystem.getInfoAsync(finalUri, { size: true });
      if (!info?.exists) throw new Error("Final media file does not exist.");

      const finished = {
        uri: finalUri,
        mediaType: isVideo ? "video" : "photo",
        localKey: finalUri, // stable enough for dedupe; you can also append Date.now() if you want uniqueness
        taggedUsers: [],
        description: "",
      };

      returnToCreatePost([finished]);
    } catch (err) {
      console.error("❌ CameraPreview handleDone error:", err);
      Alert.alert("Error", err?.message || "Something went wrong.");
    } finally {
      setIsSubmitting(false);
      setLoading(false);
    }
  }, [mediaType, effectiveUri, captions, composeIfNeeded, returnToCreatePost]);

  // --- keyboard listeners ---
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);

      setCaptions((prev) => {
        const focused = prev.find((c) => c.id === focusedCaptionId);
        if (focused && (focused.text || "").trim() === "") {
          setFocusedCaptionId(null);
          return prev.filter((c) => c.id !== focusedCaptionId);
        }
        return prev;
      });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [focusedCaptionId]);

  if (!mediaType || !effectiveUri) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "#fff" }}>No media to preview</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
          <Text style={{ color: "#1e90ff", fontWeight: "bold" }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TouchableWithoutFeedback
        onPress={() => {
          Keyboard.dismiss();
          if (!keyboardVisible) addNewCaption();
        }}
      >
        <View style={styles.container}>
          <PreviewMediaRenderer
            isSharedPost={false}
            post={null}
            mediaUri={effectiveUri}
            currentSegment={currentSegment}
            mediaType={mediaType}
            segments={normalizedSegments}
            currentSegmentIndex={currentSegmentIndex}
            setCurrentSegmentIndex={setCurrentSegmentIndex}
            captions={captions}
            isSubmitting={isSubmitting}
            imageWithCaptionsRef={imageWithCaptionsRef}
            isPreview={true}
          />
          <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={40} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.captionToggle} onPress={addNewCaption}>
            <Text style={styles.captionToggleText}>T</Text>
          </TouchableOpacity>
          <View style={styles.fontControls}>
            <TouchableOpacity style={styles.fontBtn} onPress={incFont} disabled={isSubmitting}>
              <Ionicons name="add-circle" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.fontLabel}>{fontSize}</Text>
            <TouchableOpacity style={styles.fontBtn} onPress={decFont} disabled={isSubmitting}>
              <Ionicons name="remove-circle" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          {captions.map((caption) => {
            if (isSubmitting) return null;
            const size = caption.fontSize || fontSize;

            return (
              <CaptionInput
                key={`${caption.id}-${size}`}
                caption={caption}
                fontSize={size}
                textStyle={{}}
                onChange={(text) =>
                  setCaptions((prev) => prev.map((c) => (c.id === caption.id ? { ...c, text } : c)))
                }
                onFocus={() => setFocusedCaptionId(caption.id)}
                onBlur={() => {
                  if ((caption.text || "").trim() === "") {
                    setCaptions((prev) => prev.filter((c) => c.id !== caption.id));
                  }
                }}
                onDragEnd={(id, newY) => {
                  setCaptions((prev) => prev.map((c) => (c.id === id ? { ...c, y: newY } : c)));
                }}
              />
            );
          })}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.snapPostButton} onPress={handleDone} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-forward-circle" size={54} color="#fff" />}
            </TouchableOpacity>
          </View>
          {isSubmitting && composeProgress > 0 && composeProgress < 1 && (
            <View style={{ position: "absolute", bottom: 110, right: 32 }}>
              <Text style={{ color: "#fff" }}>{Math.round(composeProgress * 100)}%</Text>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "flex-end",
    paddingBottom: 30,
  },
  closeButton: {
    position: "absolute",
    top: 60,
    left: 20,
    zIndex: 10,
    padding: 8,
  },
  captionToggle: {
    position: "absolute",
    top: 70,
    right: 25,
    zIndex: 20,
  },
  captionToggleText: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "bold",
  },
  fontControls: {
    position: "absolute",
    top: 130,
    right: 15,
    zIndex: 20,
    alignItems: "center",
    gap: 6,
  },
  fontBtn: { padding: 4 },
  fontLabel: {
    color: "#fff",
    fontSize: 16,
    marginVertical: 2,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  snapPostButton: {
    position: "absolute",
    bottom: 40,
    right: 25,
    zIndex: 20,
  },
});

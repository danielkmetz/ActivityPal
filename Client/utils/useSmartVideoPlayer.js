import { useEffect } from "react";
import { useVideoPlayer } from "expo-video";
import { isVideo as isVideoUtil } from "./isVideo";

const TAG = "[useSmartVideoPlayer]";

export function useSmartVideoPlayer(file, shouldPlayOrOpts = true, shouldLoopFallback = false) {
  const opts =
    shouldPlayOrOpts && typeof shouldPlayOrOpts === "object" ? shouldPlayOrOpts : null;

  const shouldPlay = opts ? (opts.shouldPlay ?? true) : !!shouldPlayOrOpts;
  const shouldLoop = opts ? !!opts.shouldLoop : !!shouldLoopFallback;
  const timeUpdateEventInterval = opts ? (opts.timeUpdateEventInterval ?? 0) : 0;
  const muted = opts ? (opts.muted ?? true) : true;
  const forceIsVideo = opts ? !!opts.forceIsVideo : false;

  const isStringSource = typeof file === "string";
  const obj = file && typeof file === "object" && !Array.isArray(file) ? file : null;
  const details = obj?.details || {};

  const uri =
    (isStringSource ? file : null) ||
    obj?.uri ||
    obj?.url ||
    obj?.mediaUrl ||
    obj?.mediaUploadUrl ||
    obj?.signedUrl ||
    obj?.vodUrl ||
    obj?.playbackUrl ||
    details?.playbackUrl ||
    details?.url ||
    details?.mediaUrl ||
    "";

  const isVid = forceIsVideo || (!!file && isVideoUtil(file));
  const source = isVid && uri ? uri : null;

  const player = useVideoPlayer(source, (p) => {
    try {
      p.muted = !!muted;
      p.volume = muted ? 0 : p.volume;
      p.audioMixingMode = "mixWithOthers";
      p.loop = !!shouldLoop;
      p.timeUpdateEventInterval = Number(timeUpdateEventInterval) || 0;
      p.pause();
    } catch (err) {
      console.error(TAG, "init error", err);
    }
  });

  // Keep config in sync when props change
  useEffect(() => {
    if (!player) return;
    player.loop = !!shouldLoop;
  }, [player, shouldLoop]);

  useEffect(() => {
    if (!player) return;
    player.timeUpdateEventInterval = Number(timeUpdateEventInterval) || 0; // 0 disables timeUpdate :contentReference[oaicite:1]{index=1}
  }, [player, timeUpdateEventInterval]);

  useEffect(() => {
    if (!player) return;
    player.muted = !!muted;
    if (muted) player.volume = 0;
  }, [player, muted]);

  useEffect(() => {
    if (!player) return;

    if (!isVid || !source) {
      player.pause();
      return;
    }

    try {
      if (shouldPlay) {
        player.play();
      } else {
        player.pause();
        player.currentTime = 0;
      }
    } catch (err) {
      console.error(TAG, "play/pause error", err);
    }
  }, [player, isVid, source, shouldPlay]);

  return isVid ? player : null;
}

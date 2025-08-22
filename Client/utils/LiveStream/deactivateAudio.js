// utils/LiveStream/deactivateAudio.js
// Helpers for Expo AV enum compatibility (plain JS)
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

function resolveInterruptionModes() {
  const A = Audio || {};

  // iOS enums (fallback to numeric if needed)
  const iosDoNotMix =
    A.INTERRUPTION_MODE_IOS_DO_NOT_MIX ||
    (A.InterruptionModeIOS && A.InterruptionModeIOS.DoNotMix) ||
    1;

  const iosDuck =
    A.INTERRUPTION_MODE_IOS_DUCK_OTHERS ||
    (A.InterruptionModeIOS && A.InterruptionModeIOS.DuckOthers) ||
    2;

  // Android enums (fallback to numeric if needed)
  const androidDoNotMix =
    A.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX ||
    (A.InterruptionModeAndroid && A.InterruptionModeAndroid.DoNotMix) ||
    1;

  const androidDuck =
    A.INTERRUPTION_MODE_ANDROID_DUCK_OTHERS ||
    (A.InterruptionModeAndroid && A.InterruptionModeAndroid.DuckOthers) ||
    2;

  return { iosDoNotMix, iosDuck, androidDoNotMix, androidDuck };
}

export async function deactivateExpoAudio() {
  const { iosDoNotMix, androidDoNotMix } = resolveInterruptionModes();

  console.log('[AUDIO] using modes', { iosDoNotMix, androidDoNotMix });

  // 1) Put AV in a non-recording, non-mixing, foreground-only mode
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: false,
    staysActiveInBackground: false,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: false,
    // set platform-specific "do not mix" flags
    ...(Platform.OS === 'ios' ? { interruptionModeIOS: iosDoNotMix } : {}),
    ...(Platform.OS === 'android' ? { interruptionModeAndroid: androidDoNotMix } : {}),
  });

  // 2) Fully disable AV so no session is kept alive
  const res = await Audio.setIsEnabledAsync(false);
  console.log('[AUDIO] setIsEnabledAsync(false) ->', res);
}

// teardown timer helpers (unchanged)
const t0Ref = { current: 0 };
export function tick(label) {
  const now = Date.now();
  if (!t0Ref.current) t0Ref.current = now;
  const dt = String(now - t0Ref.current).padStart(4, ' ');
  console.log(`[TEARDOWN +${dt}ms] ${label}`);
}
export function resetTick() { t0Ref.current = 0; }

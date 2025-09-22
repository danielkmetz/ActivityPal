const HAPTIC_COOLDOWN_MS = 200;
const _lastHapticAt = new Map();

export const fireHapticOnce = (key, fn) => {
  try {
    const now = Date.now();
    const last = _lastHapticAt.get(key) || 0;
    if (now - last >= HAPTIC_COOLDOWN_MS) {
      _lastHapticAt.set(key, now);
      fn && fn();
    }
  } catch {
    // best-effort; ignore
  }
};
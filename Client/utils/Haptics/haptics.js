import * as Haptics from 'expo-haptics';

let enabled = true; // wire this to a user setting if you want

const run = (fn) => enabled ? fn() : Promise.resolve();

export const setHapticsEnabled = (val) => { enabled = !!val; };

export const selection = () => run(() => Haptics.selectionAsync());
export const light = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const medium = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
export const heavy = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));

export const success = () =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const warning = () =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
export const error = () =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));

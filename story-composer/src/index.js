import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const LINKING_ERROR =
  `story-composer: native module not found.\n` +
  `• Did you run \`npx expo prebuild\` (or rebuild your dev client)?\n` +
  `• For iOS: run from Xcode once after prebuild.\n` +
  `• For Android: ensure gradle sync succeeded.\n`;

const Module = NativeModules.StoryComposer || new Proxy({}, {
  get() { throw new Error(LINKING_ERROR); }
});

export const StoryComposerEvents = new NativeEventEmitter(Module);

/**
 * Compose segments and/or burn captions.
 * For now this is a no-op native stub returning a fake file path.
 */
export function compose(options) {
  return Module.compose(options);
}

/** Optional: listen for progress events */
export function addProgressListener(listener) {
  return StoryComposerEvents.addListener('StoryComposerProgress', listener);
}

export function addLogListener(listener) {
  return StoryComposerEvents.addListener('StoryComposerLog', listener);
}

export default { compose, addProgressListener };

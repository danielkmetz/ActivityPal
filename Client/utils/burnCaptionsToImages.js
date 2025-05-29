import { captureRef } from 'react-native-view-shot';

export const burnCaptionsToImage = async (viewRef) => {
  try {
    console.log('📸 Attempting to capture view ref:', viewRef?.current);

    const uri = await captureRef(viewRef, {
      format: 'jpg',
      quality: 1,
      result: 'tmpfile',
    });

    console.log('✅ Captured image URI:', uri);
    return uri;
  } catch (err) {
    console.error('❌ Failed to capture image with captions:', err);
    throw err;
  }
};

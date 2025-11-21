import React from 'react';
import { isVideo } from '../../../utils/isVideo';
import PhotoItem from './PhotoItem';
import VideoItem from './VideoItem';

/**
 * Wrapper: decides image vs video.
 * For non-videos, we never even render the component that uses the player hook.
 */
const MediaItem = (props) => {
  const { media } = props;
  const isVideoFile = isVideo(media);

  if (!isVideoFile) {
    return <PhotoItem {...props} />;
  }

  return <VideoItem {...props} />;
};

export default MediaItem;

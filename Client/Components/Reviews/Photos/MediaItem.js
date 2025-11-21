import React from 'react';
import { isVideo } from '../../../utils/isVideo';
import PhotoItem from './PhotoItem';
import VideoItem from './VideoItem';

/**
 * Wrapper: decides image vs video.
 * For non-videos, we never even render the component that uses the player hook.
 */
const MediaItem = (props) => {
  const { media, shouldPlay, post, ...rest } = props;
  const isVideoFile = isVideo(media);

  if (!isVideoFile) {
    return <PhotoItem {...props} />;
  }

  return (
    <VideoItem
      media={media}
      post={post}
      shouldPlay={shouldPlay} 
      {...rest}
    />
  )
};

export default MediaItem;

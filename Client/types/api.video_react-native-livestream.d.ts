declare module '@api.video/react-native-livestream' {
  import * as React from 'react';
  import { ViewProps } from 'react-native';

  export interface LivestreamViewProps extends ViewProps {
    streamKey?: string;
    apiKey?: string;
    rtmpUrl?: string;
    onConnectionSuccess?: () => void;
    onConnectionFailed?: (error: Error | string) => void;
    onDisconnect?: () => void;
    onStreamStatusChanged?: (status: string) => void;
    cameraPosition?: 'front' | 'back';
    videoBitrate?: number;
    audioBitrate?: number;
    videoResolution?: '480p' | '720p' | '1080p';
    enableAudio?: boolean;
    enableVideo?: boolean;
  }

  export const LivestreamView: React.ComponentType<LivestreamViewProps>;
}

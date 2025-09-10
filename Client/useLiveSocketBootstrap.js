import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { connectLiveSocket, onLiveEvents } from './app/socket/liveChatSocketClient';
import { upsertLive, removeLive, setViewerCount, fetchLiveNow } from './Slices/LiveStreamSlice';
import { getUserToken } from './functions';

export function useLiveSocketBootstrap(baseUrl) {
  const dispatch = useDispatch();

  useEffect(() => {
    (async () => {
      const token = await getUserToken();
      await connectLiveSocket(baseUrl, token);

      onLiveEvents({
        onLiveStarted: (live) => dispatch(upsertLive(live)),
        onLiveEnded:   ({ liveId }) => dispatch(removeLive(liveId)),
        onPresence:    ({ liveStreamId, viewerCount, uniqueCount }) => {
          const count = typeof uniqueCount === 'number' ? uniqueCount : (viewerCount || 0);
          dispatch(setViewerCount({ liveStreamId, count }));
        },
      });

      // heal missed events
      dispatch(fetchLiveNow());
    })();
  }, [baseUrl, dispatch]);
}

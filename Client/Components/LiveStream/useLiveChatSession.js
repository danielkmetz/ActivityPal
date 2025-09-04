import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  connectLiveSocket,
  onLiveEvents,
  joinLiveStream,
  leaveLiveStream,
  clearLiveHandlers,
  getLiveSocket,
  setLiveTyping as socketSetTyping,
  sendLiveMessage as socketSend,
} from '../../app/socket/liveChatSocketClient';
import {
  fetchRecentChat,
  receiveLiveMessage,
  receiveLiveDeleted,
  setPinnedMessage,
  setTyping,
  selectLiveMessages,
} from '../../Slices/LiveChatSlice';
import { getUserToken } from '../../functions';

export function useLiveChatSession(liveId, { baseUrl, backfillOnce = true } = {}) {
  const dispatch = useDispatch();

  // Keep track of newest createdAt we have for this liveId
  const newestIso = useSelector((state) => {
    const msgs = selectLiveMessages(state, liveId) || [];
    return msgs.length ? msgs[msgs.length - 1]?.createdAt : null;
  });

  // Keep a ref so the reconnect handler always sees the latest anchor
  const newestRef = useRef(newestIso);
  newestRef.current = newestIso;

  useEffect(() => {
    if (!liveId) return;
    let mounted = true;

    (async () => {
      const token = await getUserToken();
      await connectLiveSocket(baseUrl, token);

      // 1) Initial backfill via REST (optional)
      let since = null;
      if (backfillOnce) {
        try {
          // unwrap to get { liveStreamId, items }
          const { items } = await dispatch(
            fetchRecentChat({ liveStreamId: liveId, limit: 60 })
          ).unwrap();
          if (items?.length) {
            since = items[items.length - 1]?.createdAt || null;
          }
        } catch (e) {
          // okay to keep going; join will still bring deltas
          console.warn('[live] initial backfill failed:', e?.message || e);
        }
      }

      // 2) Join the room (optionally with since)
      try {
        await joinLiveStream(liveId, { since }); // server may ignore `since`; that's fine
      } catch (e) {
        console.warn('[live] join failed:', e?.message);
      }

      // 3) Wire socket → Redux
      onLiveEvents({
        onNew: (msg) => {
          if (!mounted) return;
          dispatch(receiveLiveMessage(msg));
        },
        onDeleted: ({ messageId }) => {
          if (!mounted) return;
          dispatch(receiveLiveDeleted({ liveStreamId: liveId, messageId }));
        },
        onPinned: ({ messageId }) => {
          if (!mounted) return;
          dispatch(setPinnedMessage({ liveStreamId: liveId, messageId }));
        },
        onUnpinned: () => {
          if (!mounted) return;
          dispatch(setPinnedMessage({ liveStreamId: liveId, messageId: null }));
        },
        onTyping: ({ userId }) => {
          if (!mounted) return;
          dispatch(setTyping({ liveStreamId: liveId, userId: String(userId), isTyping: true }));
          setTimeout(() => {
            dispatch(setTyping({ liveStreamId: liveId, userId: String(userId), isTyping: false }));
          }, 3000);
        },
        onTypingStop: ({ userId }) => {
          if (!mounted) return;
          dispatch(setTyping({ liveStreamId: liveId, userId: String(userId), isTyping: false }));
        },
      });

      // 4) Reconnect gap fill: when socket (re)connects, fetch anything newer than our newest
      const s = getLiveSocket();
      const onReconnect = () => {
        const anchor = newestRef.current;
        if (anchor) {
          dispatch(fetchRecentChat({ liveStreamId: liveId, after: anchor, limit: 200 }));
        } else {
          dispatch(fetchRecentChat({ liveStreamId: liveId, limit: 60 }));
        }
      };
      s?.on?.('connect', onReconnect);
    })();

    return () => {
      mounted = false;
      leaveLiveStream(liveId);
      clearLiveHandlers();
      const s = getLiveSocket();
      s?.off?.('connect'); // if you want to remove our listener on unmount
    };
  }, [liveId, baseUrl, backfillOnce, dispatch]);

  return {
    sendLiveMessage: socketSend,
    setLiveTyping: socketSetTyping,
  };
}

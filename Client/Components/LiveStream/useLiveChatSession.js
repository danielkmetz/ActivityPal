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
import { setViewerCount } from '../../Slices/LiveStreamSlice';
import { getUserToken } from '../../functions';

export function useLiveChatSession(liveId, { baseUrl, backfillOnce = true } = {}) {
  const dispatch = useDispatch();

  // newest createdAt we currently have for this room
  const newestIso = useSelector((state) => {
    const msgs = selectLiveMessages(state, liveId) || [];
    return msgs.length ? msgs[msgs.length - 1]?.createdAt : null;
  });

  // keep stable refs across reconnects/cleanup
  const newestRef = useRef(newestIso);
  newestRef.current = newestIso;

  const reconnectHandlerRef = useRef(null); // <- NEW: holds the exact handler we attach

  useEffect(() => {
    if (!liveId) return;
    let mounted = true;

    (async () => {
      const token = await getUserToken();
      await connectLiveSocket(baseUrl, token);

      // 1) initial backfill (optional)
      if (backfillOnce) {
        try {
          await dispatch(fetchRecentChat({ liveStreamId: liveId, limit: 60 })).unwrap();
        } catch (e) {
          console.warn('[live] initial backfill failed:', e?.message || e);
        }
      }

      // 2) join the room
      try {
        await joinLiveStream(liveId);
      } catch (e) {
        console.warn('[live] join failed:', e?.message);
      }

      // 3) wire socket → redux (include presence here)
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
        onPresence: ({ liveStreamId: id, viewerCount, uniqueCount }) => {
          if (!mounted) return;
          const count = (typeof uniqueCount === 'number') ? uniqueCount : (viewerCount || 0);
          dispatch(setViewerCount({ liveStreamId: id || liveId, count }));
        },
      });

      // 4) reconnect gap fill — store handler in a ref so we can remove it later
      const s = getLiveSocket();
      const handler = () => {
        const anchor = newestRef.current;
        if (anchor) {
          dispatch(fetchRecentChat({ liveStreamId: liveId, after: anchor, limit: 200 }));
        } else {
          dispatch(fetchRecentChat({ liveStreamId: liveId, limit: 60 }));
        }
      };
      reconnectHandlerRef.current = handler;
      s?.on?.('connect', handler);
    })();

    return () => {
      mounted = false;

      // remove our reconnect listener safely
      const s = getLiveSocket();
      if (reconnectHandlerRef.current) {
        s?.off?.('connect', reconnectHandlerRef.current);
        reconnectHandlerRef.current = null;
      } else {
        // fallback: remove all 'connect' listeners we own if needed
        s?.off?.('connect');
      }

      leaveLiveStream(liveId);
      clearLiveHandlers();
    };
  }, [liveId, baseUrl, backfillOnce, dispatch]);

  return {
    sendLiveMessage: socketSend,
    setLiveTyping: socketSetTyping,
  };
}

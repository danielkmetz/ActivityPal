import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import {
  connectLiveSocket,
  onLiveEvents,
  joinLiveStream,
  leaveLiveStream,
  clearLiveHandlers,
  setLiveTyping as socketSetTyping,   // exposed to callers if needed
  sendLiveMessage as socketSend,      // exposed to callers if needed
} from '../../app/socket/liveChatSocketClient';
import {
  fetchRecentChat,
  receiveLiveMessage,
  receiveLiveDeleted,
  setPinnedMessage,
  setTyping,
} from '../../Slices/LiveChatSlice';
import { getUserToken } from '../../functions';

/**
 * Keeps the chat session alive for a given liveId while the parent screen is mounted.
 * Owns socket connect/join, event wiring, and initial backfill.
 *
 * @param {string} liveId
 * @param {object} options
 * @param {string} [options.baseUrl]  optional socket base URL override
 * @param {boolean} [options.backfillOnce=true] whether to fetch initial recent messages
 */
export function useLiveChatSession(liveId, { baseUrl, backfillOnce = true } = {}) {
  const dispatch = useDispatch();

  useEffect(() => {
    if (!liveId) return;
    let mounted = true;

    (async () => {
      const token = await getUserToken();
      // If your client already has a default URL, pass undefined here.
      await connectLiveSocket(baseUrl, token);

      try {
        await joinLiveStream(liveId);
      } catch (e) {
        console.warn('[live] join failed:', e?.message);
      }

      // Single global wiring while this screen is mounted.
      onLiveEvents({
        onNew: (msg) => {
          if (!mounted) return;
          // msg already includes liveStreamId from server
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
          // Soft timeout for UI “is typing…”
          setTimeout(() => {
            dispatch(setTyping({ liveStreamId: liveId, userId: String(userId), isTyping: false }));
          }, 3000);
        },
        onTypingStop: ({ userId }) => {
          if (!mounted) return;
          dispatch(setTyping({ liveStreamId: liveId, userId: String(userId), isTyping: false }));
        },
      });

      if (backfillOnce) {
        dispatch(fetchRecentChat({ liveStreamId: liveId, limit: 60 }));
      }
    })();

    return () => {
      mounted = false;
      // Only tear down when the entire screen unmounts
      leaveLiveStream(liveId);
      clearLiveHandlers();
    };
  }, [liveId, baseUrl, backfillOnce, dispatch]);

  // Convenience re-exports if the child prefers to call through the hook
  return {
    sendLiveMessage: socketSend,
    setLiveTyping: socketSetTyping,
  };
}

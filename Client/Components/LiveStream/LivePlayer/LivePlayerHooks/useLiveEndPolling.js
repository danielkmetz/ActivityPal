import { useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { getAuthHeaders } from '../../../../utils/Authorization/getAuthHeaders'; // adjust path OR inline getAuthHeaders

/**
 * Polls your backend to detect when a live has ended.
 * Enable this ONLY for expo-video (NOT IVS).
 */
export default function useLiveEndPolling({ liveId, enabled, apiBase, onEnded }) {
  const endedOnceRef = useRef(false);

  const safeEnd = useCallback(() => {
    if (endedOnceRef.current) return;
    endedOnceRef.current = true;
    onEnded?.();
  }, [onEnded]);

  useEffect(() => {
    if (!liveId || !enabled) return;
    let timer = null, mounted = true, authCached = null;

    const check = async () => {
      if (!mounted || endedOnceRef.current) return;
      try {
        if (!authCached) authCached = await getAuthHeaders();
        const { data } = await axios.get(`${apiBase}/status/${liveId}`, authCached);
        const st = data?.status;
        const stateStr = (st?.state || '').toString().toUpperCase();
        const isStillLive = st?.isLive === true || stateStr === 'LIVE';
        if (!isStillLive) safeEnd();
      } catch (e) {
        if (e?.response?.status === 404) safeEnd();
      }
    };

    check(); // initial
    timer = setInterval(check, 5000);
    return () => { mounted = false; if (timer) clearInterval(timer); };
  }, [liveId, enabled, apiBase, safeEnd]);
}

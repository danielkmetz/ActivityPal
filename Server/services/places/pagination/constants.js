// Cursor/session
const CURSOR_TTL_SEC = 600; // 10 minutes

// Paging
const MIN_PER_PAGE = 5;
const MAX_PER_PAGE = 25;
const PREFETCH_BUFFER = 20;

// Hard bounds to keep latency + Google usage sane
const MAX_PAGES_PER_COMBO = 3;
const MAX_GOOGLE_CALLS_PER_REQUEST = 6;

// Google next_page_token takes time to become valid
const NEXT_TOKEN_WAIT_MS = 1500;

// Keep seenIds bounded (memory + perf)
const MAX_SEEN_IDS = 600;

module.exports = {
  CURSOR_TTL_SEC,
  MIN_PER_PAGE,
  MAX_PER_PAGE,
  PREFETCH_BUFFER,
  MAX_PAGES_PER_COMBO,
  MAX_GOOGLE_CALLS_PER_REQUEST,
  NEXT_TOKEN_WAIT_MS,
  MAX_SEEN_IDS,
};

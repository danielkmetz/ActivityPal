const { parseCursor, parsePerPage, validateNewSearchQuery } = require("./validation");

function extractQuery(body, { strictWrapper = false } = {}) {
  const wrapped =
    body && typeof body.query === "object" && body.query ? body.query : null;

  if (strictWrapper) return wrapped && typeof wrapped === "object" ? wrapped : null;

  return wrapped && typeof wrapped === "object" ? wrapped : body || {};
}

function parsePaging(q, perPageOpts) {
  return {
    cursor: parseCursor(q?.cursor),
    perPage: parsePerPage(q?.perPage, perPageOpts),
    queryHash:
      typeof q?.queryHash === "string" && q.queryHash.trim().length
        ? q.queryHash.trim()
        : null,
    debug: q?.debug === true,
  };
}

function cleanInputQuery(qIn) {
  const q = qIn && typeof qIn === "object" ? { ...qIn } : {};

  if (typeof q.keyword === "string" && !q.keyword.trim()) q.keyword = null;
  if (typeof q.whenAtISO === "string" && !q.whenAtISO.trim()) q.whenAtISO = null;
  if (typeof q.quickFilter === "string" && !q.quickFilter.trim()) q.quickFilter = null;
  if (typeof q.activityType === "string" && !q.activityType.trim()) q.activityType = null;
  if (typeof q.placeCategory === "string" && !q.placeCategory.trim()) q.placeCategory = null;

  if (Array.isArray(q.vibes)) {
    q.vibes = q.vibes.map((x) => (x == null ? "" : String(x).trim())).filter(Boolean);
    if (!q.vibes.length) q.vibes = null;
  } else if (typeof q.vibes !== "undefined") {
    q.vibes = null;
  }

  if (q.placesFilters && typeof q.placesFilters === "object" && !Array.isArray(q.placesFilters)) {
    // keep as-is
  } else if (typeof q.placesFilters !== "undefined") {
    q.placesFilters = null;
  }

  if (q.eventFilters && typeof q.eventFilters === "object" && !Array.isArray(q.eventFilters)) {
    // keep as-is
  } else if (typeof q.eventFilters !== "undefined") {
    q.eventFilters = null;
  }

  return q;
}

function normalizePlacesQuery(qIn, { perPageOpts } = {}) {
  if (!qIn || typeof qIn !== "object") {
    return { ok: false, status: 400, error: "Invalid query object." };
  }

  const paging = parsePaging(qIn, perPageOpts);

  // cursor continuation: don’t mutate qIn here
  if (paging.cursor) {
    return { ok: true, kind: "cursor", qIn, value: paging };
  }

  // new search: clean/sanitize before validation
  const cleaned = cleanInputQuery(qIn);

  const v = validateNewSearchQuery(cleaned);
  if (!v.ok) return v;

  return {
    ok: true,
    kind: "new",
    qIn: cleaned,
    value: {
      ...v.value,
      perPage: paging.perPage,
      queryHash: paging.queryHash,
      debug: paging.debug,
    },
  };
}

function normalizePlacesRequest(body, { strictWrapper = false, perPageOpts } = {}) {
  const qIn = extractQuery(body, { strictWrapper });
  if (!qIn || typeof qIn !== "object") {
    return {
      ok: false,
      status: 400,
      error: strictWrapper ? 'Request must be shaped like: { "query": { ... } }' : "Invalid request body.",
    };
  }
  return normalizePlacesQuery(qIn, { perPageOpts });
}

module.exports = {
  extractQuery,
  parsePaging,
  normalizePlacesQuery,
  normalizePlacesRequest,
};

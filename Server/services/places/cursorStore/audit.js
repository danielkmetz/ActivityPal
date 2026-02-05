function safePreview(str, n = 14) {
  const s = String(str || "");
  if (!s) return null;
  return s.length <= n ? s : `${s.slice(0, Math.ceil(n / 2))}…${s.slice(-Math.floor(n / 2))}`;
}

function pickIds(list, n = 3) {
  const a = Array.isArray(list) ? list : [];
  return a
    .slice(0, n)
    .map((x) => String(x?.place_id || ""))
    .filter(Boolean);
}

function auditPush(state, entry) {
  const max = 12;
  state.audit = Array.isArray(state.audit) ? state.audit : [];
  state.audit.push(entry);
  if (state.audit.length > max) state.audit = state.audit.slice(-max);
}

module.exports = { safePreview, pickIds, auditPush };

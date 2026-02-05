function normalizeText(s) {
  if (!s) return "";
  let out = String(s).toLowerCase();

  try {
    out = out.normalize("NFKD");
  } catch {
    // ignore
  }

  return out
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { normalizeText }
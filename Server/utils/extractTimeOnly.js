function extractTimeOnly(isoDate) {
  const date = new Date(isoDate);
  return date.toISOString().substring(11, 19); // "HH:MM:SS"
};

module.exports = { extractTimeOnly }
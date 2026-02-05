function normalizeErr(e) {
  return {
    name: e?.name,
    message: e?.message,
    code: e?.code,
    status: e?.response?.status,
    dataStatus: e?.response?.data?.status,
  };
}

module.exports = { normalizeErr }
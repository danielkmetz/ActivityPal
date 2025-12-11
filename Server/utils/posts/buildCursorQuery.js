const { oid, isOid } = require('./oid');

function buildCursorQuery(after) {
  if (!after?.sortDate || !after?.id || !isOid(after.id)) return {};

  const sd = new Date(after.sortDate);
  if (Number.isNaN(sd.getTime())) return {}; // ignore garbage cursor

  return {
    $or: [
      { sortDate: { $lt: sd } },
      { sortDate: sd, _id: { $lt: oid(after.id) } },
    ],
  };
}

module.exports = { buildCursorQuery }
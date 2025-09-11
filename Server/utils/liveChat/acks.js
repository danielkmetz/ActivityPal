function ok(ack, payload = {}) { if (ack) ack({ ok: true, ...payload }); }
function fail(ack, error, extra = {}) { if (ack) ack({ ok: false, error: String(error), ...extra }); }
module.exports = { ok, fail };

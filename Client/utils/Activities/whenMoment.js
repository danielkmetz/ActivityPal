export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function nextSaturday(d = new Date()) {
  const out = new Date(d);
  const day = out.getDay(); // 0 Sun ... 6 Sat
  let delta = (6 - day + 7) % 7;
  if (delta === 0) delta = 7; // next Saturday, not today
  out.setDate(out.getDate() + delta);
  return out;
}

export function setLocalTime(date, hh, mm) {
  const out = new Date(date);
  out.setHours(hh, mm, 0, 0);
  return out;
}

export function parseHHmm(s) {
  const str = String(s || "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(str);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

export function parseISODate(s) {
  const str = String(s || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const da = Number(m[3]);
  const d = new Date(y, mo, da, 0, 0, 0, 0);
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== da) return null;
  return d;
}

export function parseDefaultHHmm(defaultHHmm) {
  const tm = parseHHmm(defaultHHmm);
  return tm || { hh: 19, mm: 0 };
}

export function computeTargetAt({ when, customWhen, now, defaultHHmm }) {
  const n = now instanceof Date ? now : new Date();
  const def = parseDefaultHHmm(defaultHHmm);

  if (when === "now") return n;

  if (when === "tonight") {
    const t = setLocalTime(n, def.hh, def.mm);
    if (t.getTime() <= n.getTime()) {
      const tomorrow = new Date(n);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return setLocalTime(tomorrow, def.hh, def.mm);
    }
    return t;
  }

  if (when === "tomorrow") {
    const d = new Date(n);
    d.setDate(d.getDate() + 1);
    return setLocalTime(d, def.hh, def.mm);
  }

  if (when === "weekend") {
    const sat = nextSaturday(n);
    return setLocalTime(sat, def.hh, def.mm);
  }

  if (when === "custom") {
    const base = parseISODate(customWhen?.dateISO);
    if (!base) return null;
    const tm = parseHHmm(customWhen?.timeHHmm) || def;
    return setLocalTime(base, tm.hh, tm.mm);
  }

  return null;
}

export function formatTargetLabel(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "—";
  const day = date.toLocaleDateString(undefined, { weekday: "short" });
  const mon = date.toLocaleDateString(undefined, { month: "short" });
  const dd = date.toLocaleDateString(undefined, { day: "2-digit" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} ${mon} ${dd} • ${time}`;
}

export function mergeTimeKeepDate(base, pickedTime) {
  const out = new Date(base);
  out.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
  return out;
}

export function toCustomWhen(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  return {
    dateISO: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    timeHHmm: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

export function mergeDateKeepTime(base, pickedDate) {
  const out = new Date(base);
  out.setFullYear(pickedDate.getFullYear(), pickedDate.getMonth(), pickedDate.getDate());
  return out;
}


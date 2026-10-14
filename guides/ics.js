// ics.js — RFC 5545 iCalendar export of maintenance reminders.
const esc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Fold to 75 octets per line (RFC 5545 §3.1). */
export function foldLine(line) {
  const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line; const out = []; let cur = '', len = 0, limit = 75;
  for (const ch of line) { const b = enc.encode(ch).length; if (len + b > limit) { out.push(cur); cur = ' '; len = 1; limit = 75; } cur += ch; len += b; }
  out.push(cur); return out.join('\r\n');
}
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
/**
 * buildICS(guide, { start?: Date (default today), name?, alarmDaysBefore?: 1 }) -> string
 * One yearly-recurring all-day VEVENT per task occurrence month (weekly/monthly tasks: one event per month in season).
 */
export function buildICS(guide, opts = {}) {
  const start = opts.start ? new Date(opts.start) : new Date(); const today = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const stamp = new Date(opts.stamp || Date.now()).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Yardplan//Guides 1.0//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(opts.name || 'Yardplan maintenance')}`];
  for (const t of guide.tasks) for (const m of t.months) {
    const day = t.date && +t.date.slice(0, 2) === m ? +t.date.slice(3, 5) : 1;
    let d = new Date(today.getFullYear(), m - 1, day); if (d < today) d = new Date(today.getFullYear() + 1, m - 1, day);
    const end = new Date(d); end.setDate(end.getDate() + 1);
    const interval = t.recurrence === 'every-2-years' ? 2 : t.recurrence === 'every-3-years' ? 3 : 1;
    const freqNote = t.recurrence === 'weekly-in-season' ? ' (weekly this month)' : t.recurrence === 'monthly' || t.recurrence === 'monthly-in-season' ? ' (monthly in season)' : '';
    const desc = `${t.details || ''}${t.details ? '\n' : ''}Est. ${t.minutes} min · DIY ~$${t.diyCost} · Pro ~$${t.proCost}. General guide — adjust for weather.`;
    L.push('BEGIN:VEVENT', `UID:yardplan-${t.id}-m${m}@yardplan.local`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(end)}`,
      `RRULE:FREQ=YEARLY${interval > 1 ? ';INTERVAL=' + interval : ''}`, `SUMMARY:${esc('🌱 ' + t.title + freqNote)}`, `DESCRIPTION:${esc(desc)}`, `CATEGORIES:${esc(t.category)}`, 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(t.title)}`, `TRIGGER:-P${opts.alarmDaysBefore ?? 1}D`, 'END:VALARM', 'END:VEVENT');
  }
  L.push('END:VCALENDAR'); return L.map(foldLine).join('\r\n') + '\r\n';
}

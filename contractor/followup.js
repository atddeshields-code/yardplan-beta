// v19 (Austin #3): follow-up reminders for Sent/Viewed jobs. Local only: nothing is scheduled or sent automatically.
// A reminder is due 2, 5 and 10 days after sentAt (counted from sentAt, not updatedAt, so edits don't hide a quiet job).
// Each reminder the contractor actually shares is recorded in job.followUps; after the third, no more chips.
export const FU_DAYS = [2, 5, 10];
const DAY = 864e5;
export const daysSince = (t, now = Date.now()) => Math.floor((now - t) / DAY);
/** followUpDue(job, now) -> null | { days, n } (n = 1..3: which reminder this is) */
export function followUpDue(j, now = Date.now()) {
  if (!j || !['sent', 'viewed'].includes(j.status) || !(+j.sentAt > 0)) return null;
  const done = Array.isArray(j.followUps) ? j.followUps.length : 0; if (done >= FU_DAYS.length) return null;
  const d = daysSince(+j.sentAt, now); return d >= FU_DAYS[done] ? { days: d, n: done + 1 } : null;
}
/** The default check-in message (editable in the sheet before sharing). Wording: keep it short, friendly and neutral. */
export function followUpText({ first = '', sentAt, total = null, business = '' } = {}) {
  const when = sentAt ? new Date(sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'recently';
  const amt = total != null && +total > 0 ? ` (${'$' + Math.round(+total).toLocaleString('en-US')})` : '';
  return `${first ? `Hi ${first}, j` : 'J'}ust checking in on the landscape proposal I sent on ${when}${amt}. Happy to answer any questions or adjust the plan. No rush.${business ? `\n${business}` : ''}`;
}
export const LOST_REASONS = { price: 'Price', timing: 'Timing', other_pro: 'Went with another pro', other: 'Other' };
/** winStats(jobs) -> null (fewer than 3 decided) | { won, lost, decided, pct } — signed counts as won; archived jobs are left out. */
export function winStats(jobs) {
  const live = (jobs || []).filter(j => j && j.status !== 'archived'), won = live.filter(j => ['won', 'signed'].includes(j.status)).length, lost = live.filter(j => j.status === 'lost').length;
  const decided = won + lost; return decided >= 3 ? { won, lost, decided, pct: Math.round(won / decided * 100) } : null;
}

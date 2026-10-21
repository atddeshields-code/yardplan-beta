// Shared budget parser (overnight B2). "$10,000-15,000" used to read as $1,000,015,000.
// Rules: read every number (commas ok, k/K = thousand, m/M = million); a range uses its upper bound (range: true);
// a trailing k/m on the last number also applies to earlier bare numbers ("10-15k"). Anything above $10M or unreadable -> 0.
export function parseBudget(s) {
  const str = String(s ?? '').replace(/[–—]/g, '-').trim(); if (!str) return { value: 0, range: false };
  const nums = [...str.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([kKmM](?![a-zA-Z]))?/g)].map(m => ({ n: +m[1].replace(/,/g, ''), u: (m[2] || '').toLowerCase() }));
  if (!nums.length) return { value: 0, range: false };
  const last = nums[nums.length - 1], mult = u => u === 'k' ? 1e3 : u === 'm' ? 1e6 : 1;
  const vals = nums.map(x => x.n * mult(x.u || (x.n < 1000 ? last.u : '')));
  const value = Math.round(Math.max(...vals));
  return { value: value > 0 && value <= 1e7 ? value : 0, range: nums.length > 1 && /-|to|–/.test(str) };
}
export const budgetValue = s => parseBudget(s).value;

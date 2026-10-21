// v19 (Austin #2): default deposit at signing, by state. A state gets a preset ONLY where a statute caps home-improvement
// deposits and we read the statute text (sources below, read 2026-10-15). Every other state gets a neutral 10% default and
// a note telling the contractor to edit it for their state's law. General information, not legal advice.
// Verified caps (statute text read):
//  CA  Cal. Bus. & Prof. Code §7159.5(a)(3): lesser of $1,000 or 10% (existing, CSLB) — https://www.cslb.ca.gov/Consumers/Hire_A_Contractor/Home_Improvement_Contracts/What_Is_A_Contract.aspx
//  NV  NRS 624.970(2)(g): lesser of $1,000 or 10% (owner-occupied single-family; not if a $100k consumer bond is on file) — https://www.leg.state.nv.us/NRS/NRS-624.html
//  MD  Md. Code, Bus. Reg. §8-617(b): no more than one-third — https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gbr&section=8-617&enactments=false
//  MA  M.G.L. c.142A §2(a)(6): greater of one-third or special-order materials cost (contracts > $1,000) — https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXX/Chapter142A/Section2
//  ME  10 M.R.S. §1487(5): down payment no more than 1/3 (contracts > $3,000) — https://legislature.maine.gov/statutes/10/title10sec1487.html
//  PA  73 P.S. §517.9(10): one-third (+ designated special-order materials) on contracts > $5,000 — https://www.attorneygeneral.gov/wp-content/uploads/HIC-Act-132.pdf
// Not preset (rule is conditional or we could not read an official text): TN (1/3 unless bonded; official code paywalled),
// OH (10% only over $25k + special-order), VT (half of labor or materials), and the escrow/deadline states (NY, FL, TX…).
export const DEPOSIT_RULES = {
  CA: { kind: 'calesser', label: 'California home-improvement cap: the lesser of $1,000 or 10%', cite: 'Cal. Bus. & Prof. Code §7159.5' },
  NV: { kind: 'calesser', label: 'Nevada residential cap: the lesser of $1,000 or 10%', cite: 'NRS 624.970(2)(g)' },
  MD: { kind: 'third', label: 'Maryland cap: no more than one-third of the contract price', cite: 'Md. Code, Bus. Reg. §8-617(b)' },
  MA: { kind: 'third', label: 'Massachusetts cap: one-third of the contract price (or the cost of special-order materials, if more)', cite: 'M.G.L. c.142A §2(a)(6)' },
  ME: { kind: 'third', label: 'Maine cap: no more than one-third of the contract price', cite: '10 M.R.S. §1487(5)' },
  PA: { kind: 'third', label: 'Pennsylvania cap on jobs over $5,000: one-third of the contract price', cite: '73 P.S. §517.9(10)' },
};
export const NEUTRAL_PCT = 10;
const pctOf = (rule, total) => rule?.kind === 'calesser' ? (total > 0 ? Math.min(10, (1000 / total) * 100) : 10) : rule?.kind === 'third' ? 100 / 3 : NEUTRAL_PCT;
/** depositDefault(state, total) -> { pct, amount, preset, label, cite, note } */
export function depositDefault(st, total) {
  const rule = DEPOSIT_RULES[String(st || '').toUpperCase()] || null, t = Math.max(0, Math.round(+total || 0));
  const pct = pctOf(rule, t), amount = rule?.kind === 'third' ? Math.floor(t / 3) : Math.round(t * pct / 100);
  return { pct, amount, preset: !!rule, label: rule?.label || '', cite: rule?.cite || '',
    note: rule ? `${rule.label} (${rule.cite}).` : `Neutral default (${NEUTRAL_PCT}%). Deposit rules differ by state; edit this for your state's law.` };
}

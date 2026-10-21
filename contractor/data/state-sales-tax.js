// Statewide base sales-tax rate (%) by state, as of July 1, 2026.
// Source: Tax Foundation, "State and Local Sales Tax Rates, Midyear 2026", table "State & Local Sales Tax Rates as of July 1, 2026",
// https://taxfoundation.org/data/all/state/2026-sales-tax-rates-midyear/ (fetched 2026-10-14). Values shown there rounded to 2 decimals;
// MO 4.225, NM 4.875, MN 6.875, NJ 6.625: exact rates from https://taxfoundation.org/data/all/state/sales-tax-rates/ (same values).
// STATE BASE ONLY: local/district add-ons are not included, and whether landscaping materials/labor are taxable varies by state.
// Applied as a default to materials only (taxOn: 'materials'); the contractor can change it in Pricebook -> Sales tax.
export const STATE_SALES_TAX = {"AK": 0.0, "AL": 4.0, "AR": 6.5, "AZ": 5.6, "CA": 7.25, "CO": 2.9, "CT": 6.35, "DC": 6.0, "DE": 0.0, "FL": 6.0, "GA": 4.0, "HI": 4.0, "IA": 6.0, "ID": 6.0, "IL": 6.25, "IN": 7.0, "KS": 6.5, "KY": 6.0, "LA": 5.0, "MA": 6.25, "MD": 6.0, "ME": 5.5, "MI": 6.0, "MN": 6.875, "MO": 4.225, "MS": 7.0, "MT": 0.0, "NC": 4.75, "ND": 5.0, "NE": 5.5, "NH": 0.0, "NJ": 6.625, "NM": 4.875, "NV": 6.85, "NY": 4.0, "OH": 5.75, "OK": 4.5, "OR": 0.0, "PA": 6.0, "RI": 7.0, "SC": 6.0, "SD": 4.2, "TN": 7.0, "TX": 6.25, "UT": 6.1, "VA": 5.3, "VT": 6.0, "WA": 6.5, "WI": 5.0, "WV": 6.0, "WY": 4.0};
export const TAX_SOURCE = 'Tax Foundation, state base rates as of July 1, 2026';

// GENERATED from data/pricing-defaults.json by tools/gen-data-modules.cjs — edit the JSON, then re-run.
export default {
  "_meta": {
    "version": 1, "asOf": "2026-10-13",
    "note": "Example defaults to plug into yardplan-contractor/pricebook.js. Shapes match CONTRACTOR_DEFAULTS (items), PLANT_DEFAULTS (plants), DEFAULT_SETTINGS (settings). Item units match yardplan/prices.js MATERIALS units. Contractors must override. See contractor-pricing.md for sources and caveats.",
    "hourlyRateMeaning": "bid.js computes hours x hourlyRate, then adds overheadPct on direct cost and markupPct on (direct + overhead). So hourlyRate should be the burdened COST per billable hour, not the billed sell rate."
  },
  "settings": { "hourlyRate": 38, "overheadPct": 22, "markupPct": 15, "taxPct": 0, "taxOn": "materials", "currency": "USD",
    "minimumJobCharge": 500, "mobilizationFee": 150, "deliveryFeeBulk": 100, "dumpFeePerLoad": 75,
    "_notes": "38 x 1.22 x 1.15 = about $53 effective sell per labor hour before material margin. Raise to market ($60-75 in Reno) through hourlyRate or markupPct. minimumJobCharge/mobilization/delivery/dump are not read by bid.js yet; add them as book.extras lines." },
  "laborRegions": {
    "_fields": "medianWage = BLS OEWS May 2024 SOC 37-3011 median $/hr; burdenPct = payroll taxes + workers comp + GL/benefits; hourlyRate = burdened cost per billable hour (wage x (1+burden) / 0.85 billable ratio); billedRange = typical market sell rate",
    "US":   { "medianWage": 17.26, "burdenPct": 30, "hourlyRate": 26, "billedRange": [45, 65], "source": "BLS OEWS May 2024 national (via search summary, verify)" },
    "NV":   { "medianWage": 18.09, "burdenPct": 30, "hourlyRate": 28, "billedRange": [50, 70], "source": "BLS OEWS May 2024 state (via search summary, verify)" },
    "Reno-NV": { "msa": "39900", "medianWage": 21.59, "meanWage": 22.14, "p25": 17.95, "p75": 23.09, "p90": 29.35, "burdenPct": 30, "hourlyRate": 33, "billedRange": [60, 70], "source": "BLS OEWS May 2024 Reno MSA 37-3011 as tabulated by righthomepros.com & salarycue.com; billed range = RightHomePros model ($61.59-68.51)" },
    "CA":   { "medianWage": 21.32, "burdenPct": 35, "hourlyRate": 34, "billedRange": [60, 90], "source": "BLS OEWS May 2024 (search summary); CA workers comp high" },
    "WA":   { "medianWage": 22.21, "burdenPct": 32, "hourlyRate": 35, "billedRange": [60, 90], "source": "BLS OEWS May 2024 (search summary)" },
    "TX":   { "meanWage": 16.09, "burdenPct": 25, "hourlyRate": 24, "billedRange": [40, 60], "source": "BLS OEWS state mean (older vintage on bls mirror page), verify" },
    "FL":   { "meanWage": 16.10, "burdenPct": 28, "hourlyRate": 24, "billedRange": [40, 60], "source": "BLS OEWS state mean (older vintage), verify" },
    "NY":   { "meanWage": 20.30, "burdenPct": 32, "hourlyRate": 32, "billedRange": [60, 90], "source": "BLS OEWS state mean (older vintage), verify" }
  },
  "items": {
    "mulch":   { "laborHoursPerUnit": 0.025, "_basis": "3-5 CY/man-hr by hand (CyanBuild); 2 cu ft bag = 1/13.5 CY; +bed prep" },
    "rock":    { "laborHoursPerUnit": 0.02,  "_basis": "~1-1.5 CY/man-hr rock spread; 0.5 cu ft bag" },
    "pavers":  { "laborHoursPerUnit": 0.07,  "_basis": "per 12x12 paver (=1 sq ft): lay+cut+joint 15-20 sf/man-hr small areas (ICPI/Ideal; CyanBuild 15-40). Base/sand/excavation priced on separate lines" },
    "sod":     { "laborHoursPerUnit": 3.5,   "_basis": "per 450 sq ft pallet: 100-200 sf/man-hr flat (CyanBuild), 75-112 per Ledge; slopes halve" },
    "topsoil": { "laborHoursPerUnit": 0.02,  "_basis": "0.75 cu ft bag; ~2 CY/man-hr wheelbarrow spread" },
    "edging":  { "laborHoursPerUnit": 0.6,   "_basis": "per 20 ft roll; 30-40 LF/man-hr plastic/poly edging incl. trenching (estimate)" },
    "fabric":  { "laborHoursPerUnit": 0.3,   "_basis": "per 150 sq ft roll; ~500 sf/man-hr incl. pinning (estimate)" },
    "base":    { "name": "Compacted gravel base (4\" deep)", "unit": "cu yd", "unitCost": 45, "laborHoursPerUnit": 1.4, "_basis": "1 ton/person-hr wheelbarrow small backyard (ICPI via Ideal PDF); ~1.4 t/CY" },
    "sand":    { "name": "Bedding sand (1\" deep)", "unit": "cu yd", "unitCost": 50, "laborHoursPerUnit": 1.0 },
    "wallblock": { "name": "Segmental retaining wall block", "unit": "sq ft face", "unitCost": 18, "laborHoursPerUnit": 0.4, "_basis": "~2-3 sq ft face/man-hr incl. base, drainage, backfill (estimate; installed $20-45/sf face market check)" },
    "grading": { "name": "Grading cut/fill", "unit": "cu yd", "unitCost": 8, "laborHoursPerUnit": 0.3, "_basis": "skid steer/mini-ex + operator ~10-20 CY/hr incl. laborer; unitCost covers equipment rental share. Hand-dug = ~1 CY/man-hr" },
    "dg":      { "name": "Decomposed granite (3\" compacted)", "unit": "cu yd", "unitCost": 55, "laborHoursPerUnit": 2.0, "_basis": "material $30-80/CY (LatestCost); spread+compact estimate. Not yet a takeoff key" },
    "excavation": { "name": "Excavation & haul-off", "unit": "cu yd", "unitCost": 25, "laborHoursPerUnit": 0.5, "_basis": "unitCost = dump/haul share; not yet a takeoff key" },
    "drip":    { "name": "Drip irrigation zone", "unit": "zone", "unitCost": 250, "laborHoursPerUnit": 8, "_basis": "estimate; not sourced, verify locally" }
  },
  "plants": {
    "4 in pot": { "unitCost": 4,   "laborHoursPerUnit": 0.05, "wholesaleRange": [2, 5],     "retailRange": [5, 10] },
    "1 gal":    { "unitCost": 9,   "laborHoursPerUnit": 0.15, "wholesaleRange": [5, 12],    "retailRange": [12, 25] },
    "5 gal":    { "unitCost": 32,  "laborHoursPerUnit": 0.4,  "wholesaleRange": [25, 70],   "retailRange": [40, 90] },
    "15 gal":   { "unitCost": 110, "laborHoursPerUnit": 1.5,  "wholesaleRange": [65, 155],  "retailRange": [120, 300] },
    "24 in box":{ "unitCost": 300, "laborHoursPerUnit": 4.0,  "wholesaleRange": [200, 450], "retailRange": [400, 900], "_note": "uncertain; needs equipment, often + crane/delivery" },
    "B&B 2 in cal": { "unitCost": 300, "laborHoursPerUnit": 3.0, "wholesaleRange": [200, 350], "retailRange": [400, 700], "_note": "Aspinall's 2025: 2in $299, 1.5in $199" },
    "_markup": "Contractors typically resell plants at 1.5-2x wholesale or near retail; bid.js applies markupPct uniformly, so either enter unitCost at wholesale and accept low plant margin, or enter near-retail."
  },
  "installedPriceChecks": {
    "_use": "Sanity-check a generated bid's $/sq ft against these market ranges (national; adjust by region)",
    "paverPatioConcrete": { "perSqFt": [14, 25], "source": "Ecostify 2026 ($12-25), BuildCalcHub 2026 ($14-22 std)" },
    "paverPatioNaturalStone": { "perSqFt": [25, 40], "source": "BuildCalcHub 2026" },
    "decomposedGranite": { "perSqFt": [4, 12], "stabilized": [6, 15], "source": "LatestCost 2026" },
    "sodInstalled": { "perSqFt": [1.0, 2.5], "materialOnly": [0.3, 0.8], "source": "Ecostify 2026" },
    "retainingWallBlock": { "perSqFtFace": [20, 45], "natStone": [25, 75], "source": "CostMyYard 2026 citing LawnStarter, LawnLove, Homewyse, HomeGuide" },
    "xeriscape": { "perSqFt": [5, 20], "source": "unverified estimate (not fetched); see md" }
  }
};

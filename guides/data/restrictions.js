// Outdoor-watering rules: utility entries (matched by ZIP → service-area circle or county), regional/state layers, and a
// default for every state + DC. verified:true = matched an official page (URL in `sources`) on `checked`.
// verified:false = from a non-official summary, partly confirmed, or not found; check with the utility.
// maxDaysPerWeek: spray/sprinkler day cap (number | [Jan..Dec] | null = no day cap). dripMaxDaysPerWeek: null = drip not day-limited/unknown.
import { ZIP_COUNTY, COUNTIES } from './zip-county.js';
export const CHECKED = '2026-10-13';
const C = CHECKED;
// e(id, state, utility, match, rule) ; match: { center:[lat,lon], radiusMi } and/or { counties:['County Name', ...] }
const e = (id, state, utility, match, r) => ({ id, state, utility, match, checked: C, verified: true, maxDaysPerWeek: null, dripMaxDaysPerWeek: null, notes: [], sources: [], rebates: [], ...r });
const NONE = 'No mandatory watering-day schedule in effect as of the check date';
const CA_MWELO = 'https://water.ca.gov/Programs/Water-Use-And-Efficiency/Urban-Water-Use-Efficiency/Model-Water-Efficient-Landscape-Ordinance';

export const ENTRIES = [
  // ---------------- California ----------------
  e('sacramento', 'CA', 'City of Sacramento Department of Utilities', { center: [38.56, -121.47], radiusMi: 7 }, {
    sources: ['https://www.cityofsacramento.gov/utilities/water-conservation/watering-schedule', 'https://codelibrary.amlegal.com/codes/sacramentoca/latest/sacramento_ca/0-0-0-26057'],
    maxDaysPerWeek: [1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1],
    notes: ['Mar 1–Oct 31: even addresses Wed & Sun, odd addresses Tue & Sat; water only before 10 a.m. or after 7 p.m.',
      'Nov 1–Feb 28: one day per week, Saturday or Sunday only (any time); no weekday watering.', 'No watering within 48 hours after 1/8 in. of rain (city rule).'],
    rebates: ['https://www.cityofsacramento.gov/utilities/water-conservation/rebates/outdoor-rebates/grass-conversion (River-Friendly grass conversion: $2.50/sq ft, up to $5,000 single-family; limited-time offer for applications Sep 1, 2026–Feb 28, 2027; drip + WaterSense smart controller required)'] }),
  e('sacco-water', 'CA', 'Sacramento County Water Agency', { counties: ['Sacramento County'], state: 'CA' }, {
    sources: ['https://waterresources.saccounty.gov/us/en/water-agency/water-efficiency.html'], maxDaysPerWeek: 3,
    notes: ['Odd addresses Tue/Thu/Sat, even addresses Wed/Fri/Sun; watering 8 p.m.–8 a.m. (per county water-efficiency page).',
      'Other Sacramento-area retailers (Sacramento Suburban WD, Carmichael WD, San Juan WD, etc. — see Regional Water Authority) set their own rules. Sacramento Suburban WD lists recommended (not mandatory) odd/even days and no watering noon–6 p.m.'],
    verified: false, verifyNote: 'County page confirmed via search summary only; retailer boundaries are not mapped to ZIPs here.' }),
  e('ladwp', 'CA', 'Los Angeles Dept. of Water & Power (LADWP)', { center: [34.05, -118.30], radiusMi: 16 }, {
    sources: ['https://www.ladwp.com/who-we-are/water-system/water-conservation/water-conservation-ordinance', 'https://www.ladwp.com/residential-services/water-conservation-faqs'],
    maxDaysPerWeek: 3, sprayMinutesCap: { standard: 8, conservingNozzle: 30 },
    notes: ['Phase 2: odd addresses Mon/Wed/Fri, even addresses Sun/Tue/Thu (sprinklers). No outdoor watering 9 a.m.–4 p.m.',
      'Standard sprinklers: one cycle up to 8 min/station per watering day; conserving nozzles (MP rotators): two 15-min cycles.', 'No watering during rain or for 48 hours after.'],
    rebates: ['https://socalwatersmart.com/en/residential/rebates/available-rebates/turf-replacement-program/ (Metropolitan base $2/sq ft up to 5,000 sq ft/yr; LADWP may add)'] }),
  e('sfpuc', 'CA', 'San Francisco Public Utilities Commission (SFPUC)', { center: [37.76, -122.44], radiusMi: 7 }, {
    sources: ['https://www.sfpuc.gov/learning/how-you-can-help/prevent-water-waste', 'https://www.sfpuc.gov/learning/gardens-and-landscapes/water-efficient-irrigation-ordinance'],
    notes: [NONE + ' (permanent water-waste rules: no runoff, no watering within 48 hours after measurable rain).',
      'SF Water Efficient Irrigation Ordinance (new/rehab landscapes ≥500 sq ft): overhead irrigation must be scheduled 8 p.m.–10 a.m.'],
    rebates: ['https://www.sfpuc.gov/learning/how-you-can-help/rebates-and-incentives (link not checked)'] }),
  e('sandiego-city', 'CA', 'City of San Diego Public Utilities', { center: [32.78, -117.13], radiusMi: 10 }, {
    sources: ['https://www.sandiego.gov/public-utilities/sustainability/water-conservation/water-use-restrictions'], maxDaysPerWeek: 3,
    notes: ['Permanent restrictions: landscape irrigation on up to three assigned days per week (see City schedule); water only before 10 a.m. or after 6 p.m.',
      'No irrigation during or within 48 hours of measurable rain; potted plants, vegetable gardens and fruit trees may be watered any day (same hours).'],
    rebates: ['https://www.sandiego.gov/public-utilities/sustainability/water-conservation/rebates (link not checked)', 'https://www.watersmartsd.org/ (link not checked)'] }),
  e('sdcwa', 'CA', 'San Diego County Water Authority (wholesale; 22 member agencies)', { counties: ['San Diego County'], state: 'CA' }, {
    sources: ['https://www.sdcwa.org/your-water/water-use/', 'https://www.sdcwa.org/member-agency-toolkit/our-members/'],
    notes: ['No regional shortage level declared (2026 Aqueduct Operating Plan: supply sufficient). Member agencies may set their own rules — check your retail agency.'],
    rebates: ['https://www.watersmartsd.org/ (link not checked)'] }),
  e('ebmud', 'CA', 'East Bay Municipal Utility District (EBMUD)', { center: [37.85, -122.20], radiusMi: 14, counties: [] }, {
    sources: ['https://www.ebmud.com/water/conservation-and-rebates/watersmart-gardener/save-water-outdoors', 'https://www.ebmud.com/application/files/2117/8302/6938/Section_29_Water_Use_Restrictions_07012026.pdf'],
    notes: [NONE + '; permanent rules: no watering during/within 48 h after measurable rain, no runoff, no hosing hard surfaces.', 'EBMUD recommends watering before dawn or at dusk.'],
    rebates: ['https://www.ebmud.com/water/conservation-and-rebates/rebates (link not checked)'] }),
  e('sanjose-water', 'CA', 'San Jose Water', { center: [37.30, -121.90], radiusMi: 9 }, {
    sources: ['https://www.sjwater.com/Drought-FAQ', 'https://www.cpuc.ca.gov/-/media/cpuc-website/divisions/water-division/reports/drought-information/san-jose-water-company/san-jose-water-company--schedule-141.pdf'],
    maxDaysPerWeek: 2, verified: false, verifyNote: 'Drought FAQ / Rule 14.1 list a 2-day schedule; could not confirm it is still active today.',
    notes: ['Rule 14.1 schedule: odd/no-number addresses Mon & Thu, even addresses Tue & Fri; automated irrigation max 15 min/station/day; not 10 a.m.–8 p.m.; drip-only zones and low-precipitation sprinklers exempt from the time cap.'],
    rebates: ['https://www.valleywater.org/saving-water/rebates-surveys (link not checked)'] }),
  e('valleywater', 'CA', 'Santa Clara Valley Water District (Valley Water, wholesale)', { counties: ['Santa Clara County'], state: 'CA' }, {
    sources: ['https://www.valleywater.org/WaterRestrictions', 'https://www.valleywater.org/accordion/permanent-water-use-prohibitions'],
    notes: ['Permanent prohibitions: no overhead irrigation 9 a.m.–6 p.m., no runoff, no watering within 48 h after measurable rain. Retailers may be stricter.'],
    rebates: ['https://www.valleywater.org/saving-water/rebates-surveys (link not checked)'] }),
  e('irwd', 'CA', 'Irvine Ranch Water District (IRWD)', { center: [33.68, -117.79], radiusMi: 7 }, {
    sources: ['https://www.irwd.com/learn/save-water-money/watering-guide/', 'https://www.irwd.com/get-help/understanding-your-bill/water-budget-formula/technical/'],
    notes: [NONE + '. IRWD uses monthly allocation-based water budgets (by household, irrigated area and local ET); guidance: water before 8 a.m.', 'IRWD publishes monthly spray/drip runtime charts.'],
    rebates: ['https://www.irwd.com/save-water/rebates (link not checked)', 'https://socalwatersmart.com/'] }),
  e('mwdoc', 'CA', 'Municipal Water District of Orange County (MWDOC, wholesale)', { counties: ['Orange County'], state: 'CA' }, {
    sources: ['https://www.mwdoc.com/save-water/rebates/residential-rebates/turf-replacement/'],
    notes: ['No county-wide watering-day schedule; your city/retail water agency sets day/hour rules — check it.',
      'Turf Replacement Program requires drip or high-efficiency rotating nozzles (no overhead spray in converted area), a rain-capture feature, ≥3 plants/100 sq ft and mulch.'],
    rebates: ['https://www.mwdoc.com/save-water/rebates/residential-rebates/turf-replacement/', 'https://socalwatersmart.com/'] }),
  e('longbeach', 'CA', 'Long Beach Utilities', { center: [33.80, -118.17], radiusMi: 6 }, {
    sources: ['https://www.lbutilities.org/water/water-use-restrictions'], maxDaysPerWeek: 3,
    notes: ['Level 1: landscape watering Tue/Thu/Sat only; before 9 a.m. or after 4 p.m.; max 10 min/station or until runoff; none within 48 h after measurable rain.'],
    rebates: ['https://socalwatersmart.com/'] }),
  e('pasadena', 'CA', 'Pasadena Water and Power', { center: [34.15, -118.14], radiusMi: 4 }, {
    sources: ['https://pwp.cityofpasadena.net/wateringschedule/', 'https://pwp.cityofpasadena.net/one-day-watering-november-2025/'],
    maxDaysPerWeek: [1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 1, 1],
    notes: ['Level 2 Water Supply Shortage Plan: Apr–Oct up to 2 days (even addresses Mon & Thu, odd Tue & Fri); Nov–Mar 1 day; before 9 a.m. or after 6 p.m.',
      'Hand watering, tree care and qualifying low-flow drip are exempt from the day limit.'],
    rebates: ['https://socalwatersmart.com/'] }),
  e('fresno', 'CA', 'City of Fresno Department of Public Utilities', { center: [36.77, -119.79], radiusMi: 9 }, {
    sources: ['https://www.fresno.gov/publicutilities/water-conservation-program/water-schedule/'], maxDaysPerWeek: [1, 1, 1, 3, 3, 3, 3, 3, 3, 3, 1, 1],
    notes: ['Apr 1–Oct 31: odd addresses Tue/Thu/Sat, even Wed/Fri/Sun. Nov 1–Mar 31: odd Saturday, even Sunday. Never Monday; never 10 a.m.–6 p.m.'],
    rebates: ['https://www.fresno.gov/publicutilities/water-conservation-program/ (link not checked)'] }),
  e('riverside', 'CA', 'Riverside Public Utilities', { center: [33.95, -117.40], radiusMi: 7 }, {
    sources: ['https://www.riversideca.gov/utilities/residents/drought-status'],
    notes: ['Stage One (normal supply): ' + NONE + '; 6 p.m.–10 a.m. watering is recommended. No watering during/within 48 h after measurable rain; no runoff.'],
    rebates: ['https://socalwatersmart.com/'] }),
  e('santabarbara', 'CA', 'City of Santa Barbara Water Resources', { center: [34.42, -119.70], radiusMi: 5 }, {
    sources: ['https://santabarbaraca.gov/government/departments/public-works/water-resources/drought-information'],
    notes: ['No declared drought stage (Stage Two repealed June 2023): ' + NONE + '. No watering during/within 48 h after ≥0.25 in. of rain; no runoff.'],
    rebates: ['https://santabarbaraca.gov/WELS (Water Efficient Landscape Standards)'] }),
  e('ccwd', 'CA', 'Contra Costa Water District (CCWD)', { center: [37.96, -122.03], radiusMi: 9 }, {
    sources: ['https://www.ccwater.com/574/Water-Use-Prohibitions'],
    notes: ['Permanent rules: no watering 9 a.m.–5 p.m.; none during/within 48 h after measurable rain; no runoff. No assigned days.'],
    rebates: ['https://www.ccwater.com/rebates (link not checked)'] }),
  e('marin', 'CA', 'Marin Water (Marin Municipal Water District)', { counties: ['Marin County'], state: 'CA' }, {
    sources: ['https://marinwater.org/waterefficiency/water-rules/'], maxDaysPerWeek: 2, dripMaxDaysPerWeek: 3,
    notes: ['Standing rules: no landscape irrigation 9 a.m.–7 p.m.; overhead sprinklers up to 2 days/week, drip up to 3 days/week (days not assigned); none within 48 h after rain.'],
    rebates: ['https://marinwater.org/waterefficiency/ (link not checked)'] }),
  // ---------------- Nevada / Southwest / Mountain ----------------
  e('reno', 'NV', 'Truckee Meadows Water Authority (TMWA)', { center: [39.53, -119.81], radiusMi: 25 }, {
    sources: ['https://tmwa.com/article/assigned-day-watering/', 'https://tmwa.com/about_us/faqs/'], maxDaysPerWeek: 3,
    notes: ['Assigned-day watering (sprinklers only): even addresses (last digit 0,2,4,6,8) Tue/Thu/Sat; odd addresses Wed/Fri/Sun; no sprinklers on Mondays.',
      'No sprinklers 12 noon–6 p.m., Memorial Day through Labor Day.', 'Drip and hand watering are allowed any day.'] }),
  e('lasvegas', 'NV', 'Southern Nevada Water Authority (SNWA) / Las Vegas Valley Water District', { center: [36.17, -115.14], radiusMi: 30 }, {
    sources: ['https://www.snwa.com/conservation/change-your-irrigation-clock/index.html', 'https://www.snwa.com/landscapes/how-and-when-to-water/index.html', 'https://www.lvvwd.com/conservation/mandatory-watering-schedule/'],
    maxDaysPerWeek: [1, 1, 3, 3, 6, 6, 6, 6, 3, 3, 1, 1], dripMaxDaysPerWeek: [1, 1, 3, 3, 6, 6, 6, 6, 3, 3, 1, 1],
    notes: ['Mandatory assigned watering groups. Summer (May 1–Aug 31): Mon–Sat. Spring (Mar–Apr) and fall (Sep–Oct): 3 assigned days. Winter (Nov–Feb): 1 assigned day. Sunday watering is always prohibited.',
      'No landscape irrigation 11 a.m.–7 p.m., May 1–Aug 31.', 'SNWA states the restrictions also apply to drip. New plants may get extra watering for the first 14 days; hand watering is allowed any time.'],
    rebates: ['https://www.snwa.com/rebates/wsl/index.html (link not checked)'] }),
  e('phoenix', 'AZ', 'City of Phoenix Water Services', { center: [33.45, -112.07], radiusMi: 25 }, {
    sources: ['https://www.phoenix.gov/administration/departments/waterservices/supply-conservation/drought.html'],
    notes: ['Stage 1 Water Alert: conservation programs plus enforcement of City Code Ch. 37 water-waste rules. ' + NONE + '.'] }),
  e('tucson', 'AZ', 'Tucson Water', { center: [32.22, -110.97], radiusMi: 15 }, {
    sources: ['https://www.tucsonaz.gov/Departments/Water/Water-Resources-and-Drought-Preparedness/Drought-Preparedness'],
    notes: ['Drought plan Tier 2: ' + NONE + '; conservation guidance only. Mandatory limits apply only if a water emergency is declared.'] }),
  e('albuquerque', 'NM', 'Albuquerque Bernalillo County Water Utility Authority', { center: [35.08, -106.65], radiusMi: 15 }, {
    sources: ['https://www.abcwua.org/water-waste/', 'https://www.abcwua.org/wp-content/uploads/Ordinances_PDFs/Section_4_Water_Waste_Reduction_Ordinance.pdf'],
    notes: ['Apr 1–Oct 31: spray irrigation only 7 p.m.–11 a.m. (none 11 a.m.–7 p.m.). Drip, bubblers and hand watering exempt. No day schedule.'] }),
  e('denver', 'CO', 'Denver Water', { center: [39.74, -104.99], radiusMi: 20 }, {
    sources: ['https://www.denverwater.org/residential/rebates-and-conservation-tips/summer-watering-rules', 'https://www.denverwater.org/drought/board-resolution-drought-declaration',
      'https://www.denverwater.org/tap/drought-conditions-worsen-denver-board-water-commissioners-declares-formal-end-lawn-watering'],
    maxDaysPerWeek: 2,
    alert: 'Stage 1 drought: lawn watering and ALL spray irrigation have been prohibited since Oct 1, 2026, until the Board acts. Denver Water says sprinklers may need to stay off in spring 2027. Trees, shrubs and perennials may be watered any day by hand-held hose with a shutoff nozzle or by drip.',
    notes: ['Stage 1 (Resolution 002-2026): grass watering limited to 2 assigned days/week (single-family: even addresses Sun/Thu, odd addresses Wed/Sat); no watering 10 a.m.–6 p.m.',
      'Trees, shrubs and perennials: any day by hand-held hose or low-volume non-spray (drip) irrigation, but not 10 a.m.–6 p.m.', 'Smart controllers must be programmed to the 2-day limit.'] }),
  e('coloradosprings', 'CO', 'Colorado Springs Utilities', { center: [38.83, -104.82], radiusMi: 12 }, {
    sources: ['https://www.csu.org/water-wise-rules/'], maxDaysPerWeek: 3, notes: ['Up to 3 days/week (customer-chosen days); May 1–Oct 15 water before 10 a.m. or after 6 p.m.'] }),
  e('saltlake', 'UT', 'Salt Lake City Public Utilities', { center: [40.76, -111.89], radiusMi: 12 }, {
    sources: ['https://www.slc.gov/utilities/public-utilities-advises-stage-2-drought/', 'https://www.slc.gov/utilities/drought-information-faqs/'],
    notes: ['Stage 2 (mild) drought: no mandatory residential restrictions; residents asked to water no more than twice per week and delay lawn watering until early May. Follow the Utah weekly lawn watering guide.'] }),
  e('boise', 'ID', 'City of Boise (pressure irrigation) / Veolia Water Idaho', { center: [43.61, -116.20], radiusMi: 10 }, {
    sources: ['https://www.cityofboise.org/departments/public-works/pressure-irrigation'], verified: false, maxDaysPerWeek: 4,
    verifyNote: 'City pressure-irrigation odd/even calendar-day rule confirmed; a reported Veolia potable Stage 2 schedule came from a non-official site and is not confirmed.',
    notes: ['City pressure-irrigation customers: even addresses water on even calendar days, odd addresses on odd days (any time that day). Potable (Veolia) customers: check Veolia Idaho for current stage.'] }),
  // ---------------- Texas / Plains ----------------
  e('austin', 'TX', 'Austin Water', { center: [30.27, -97.74], radiusMi: 20 }, {
    sources: ['https://www.austintexas.gov/water/find-your-watering-day', 'https://www.austintexas.gov/water/austin-water-drought-response',
      'https://library.municode.com/tx/austin/codes/code_of_ordinances/469236?nodeId=TIT6ENCOCO_CH6-4WACO_ART4VAALCO_S6-4-30VA'],
    maxDaysPerWeek: 1, dripMaxDaysPerWeek: 2,
    notes: ['Conservation Stage (in effect since Sept 2, 2025): residential automatic/manual irrigation 1 day/week, odd addresses Wednesday, even addresses Thursday, midnight–10 a.m. or 7 p.m.–midnight.',
      'Residential hose-end and drip: 2 days/week (odd: Wed & Sat; even: Thu & Sun). The stage changes with Highland Lakes storage, so check the current stage.'] }),
  e('dallas', 'TX', 'Dallas Water Utilities', { center: [32.78, -96.80], radiusMi: 14 }, {
    sources: ['https://savedallaswater.com/frequently-asked-questions/', 'https://dallascityhall.com/departments/waterutilities/Water%20Bill%20Insert/25_26%20INSERTS/06%20-%20MAR/Final_Time%20of%20Day%20Restrictions_Insert_2026_DIGITAL.pdf'],
    maxDaysPerWeek: 2, notes: ['Year-round max twice weekly: even/no-number addresses Sun & Thu, odd addresses Wed & Sat. No sprinklers 10 a.m.–6 p.m. (Apr 1–Oct 31 time-of-day rule). Hand watering, soaker hoses and drip any time.'] }),
  e('houston', 'TX', 'Houston Public Works', { center: [29.76, -95.37], radiusMi: 20 }, {
    sources: ['https://www.houstonpublicworks.org/current-watering-restrictions'], notes: ['Current restrictions: none (Stage One rescinded May 29, 2024). Stage Two would limit to 2 assigned days, 7 p.m.–8 a.m.'] }),
  e('sanantonio', 'TX', 'San Antonio Water System (SAWS)', { center: [29.42, -98.49], radiusMi: 18 }, {
    sources: ['https://www.saws.org/conservation/drought-restrictions/', 'https://www.saws.org/conservation/drought-restrictions/stage-3/'], maxDaysPerWeek: 1,
    notes: ['Stage 3: sprinklers once per week on your day by address last digit (0/1 Mon, 2/3 Tue, 4/5 Wed, 6/7 Thu, 8/9 Fri), 5–10 a.m. or 9 p.m.–midnight. Hand-held hose any time.'] }),
  e('okc', 'OK', 'Oklahoma City Utilities', { center: [35.47, -97.52], radiusMi: 18 }, {
    sources: ['https://www.okc.gov/Services/Water-Trash-Recycling/Water/Squeeze-Every-Drop/Water-Conservation-Measures'], maxDaysPerWeek: 4,
    notes: ['Permanent odd/even rule: odd addresses water on odd calendar days, even addresses on even days (sprinklers/irrigation; hand watering exempt).'] }),
  // ---------------- Southeast / Florida ----------------
  e('atlanta', 'GA', 'City of Atlanta Dept. of Watershed Management', { center: [33.75, -84.39], radiusMi: 12 }, {
    sources: ['https://atlantawatershed.org/current-watering-restrictions/', 'https://epd.georgia.gov/document/document/epddroughtmanagementfactsheetapril-2026pdf/download'],
    notes: ['Georgia Water Stewardship Act: landscape watering only before 10 a.m. or after 4 p.m. year-round (drip/soaker, hand watering and food gardens exempt). Level 1 drought response: no extra day limits.'] }),
  e('charlotte', 'NC', 'Charlotte Water', { center: [35.23, -80.84], radiusMi: 15 }, {
    sources: ['https://www.charlottenc.gov/water/About-Us/Drought-Resources/Drought-Dashboard'], maxDaysPerWeek: 2,
    notes: ['Mandatory Stage 2: irrigation only 6 p.m.–6 a.m. on assigned days — odd addresses Tue & Sat, even Wed & Sun. Hand watering, drip and soaker hoses any time.'] }),
  e('fl-sfwmd', 'FL', 'South Florida Water Management District (year-round irrigation rule)', { counties: ['Miami-Dade County', 'Broward County', 'Palm Beach County', 'Monroe County', 'Collier County', 'Lee County', 'Hendry County', 'Glades County', 'Martin County', 'St. Lucie County', 'Okeechobee County'], state: 'FL' }, {
    sources: ['https://sfwmd.gov/community-residents/landscape-irrigation', 'https://www.sfwmd.gov/sites/default/files/documents/jtf_yr_rule_new.pdf'], maxDaysPerWeek: 2,
    notes: ['Year-round: 2 days/week (some local governments allow 3) — odd addresses Wed & Sat, even/no address Thu & Sun; not 10 a.m.–4 p.m. Check your county/city ordinance.'] }),
  e('fl-swfwmd', 'FL', 'Southwest Florida Water Management District (Modified Phase III water shortage)', { counties: ['Citrus County', 'DeSoto County', 'Hardee County', 'Hernando County', 'Hillsborough County', 'Manatee County', 'Pasco County', 'Pinellas County', 'Polk County', 'Sarasota County', 'Sumter County', 'Charlotte County', 'Highlands County'], state: 'FL' }, {
    sources: ['https://www.swfwmd.state.fl.us/business/epermitting/district-water-restrictions'], maxDaysPerWeek: 1,
    notes: ['Modified Phase III restrictions through Mar 31, 2027: lawns once per week by address last digit (0/1 Mon, 2/3 Tue, 4/5 Wed, 6/7 Thu, 8/9 Fri), midnight–4 a.m. or 8–11:59 p.m. (unless your city/county is stricter).',
      'Hand watering/micro-irrigation of beds any day before 8 a.m. or after 6 p.m. New plants: days 1–30 any day, days 31–60 three days/week.'] }),
  e('fl-sjrwmd', 'FL', 'St. Johns River Water Management District', { counties: ['Duval County', 'Nassau County', 'Clay County', 'St. Johns County', 'Putnam County', 'Flagler County', 'Volusia County', 'Brevard County', 'Indian River County', 'Seminole County', 'Orange County', 'Lake County', 'Marion County', 'Alachua County', 'Baker County', 'Osceola County'], state: 'FL' }, {
    sources: ['https://www.sjrwmd.com/wateringrestrictions/'], maxDaysPerWeek: [1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1],
    notes: ['Daylight saving time: 2 days (odd/no address Wed & Sat, even Thu & Sun, non-residential Tue & Fri). Standard time: 1 day (odd Sat, even Sun, non-residential Tue). Not 10 a.m.–4 p.m.',
      'County split: parts of Orange/Lake/Marion/Osceola fall in other districts.'] }),
  // ---------------- Pacific NW / Northeast / Mid-Atlantic / other ----------------
  e('seattle', 'WA', 'Seattle Public Utilities', { center: [47.61, -122.33], radiusMi: 15 }, {
    sources: ['https://seattle.gov/utilities/your-services/water/water-supply-conditions'], notes: [NONE + '; voluntary conservation only.'] }),
  e('portland', 'OR', 'Portland Water Bureau', { center: [45.52, -122.68], radiusMi: 14 }, {
    sources: ['https://www.portland.gov/water/water-efficiency-programs/curtailment', 'https://www.portland.gov/water/about-portlands-water-system/seasonal-supply-planning'],
    notes: [NONE + '; curtailment stages are contingency measures only.'] }),
  e('nyc', 'NY', 'NYC Department of Environmental Protection', { center: [40.71, -73.95], radiusMi: 14 }, {
    sources: ['https://www.nyc.gov/site/dep/water/reservoir-levels.page', 'https://www.nyc.gov/site/dep/water/water-saving-tips-lawns-gardens.page'],
    notes: ['No drought watch/emergency (reservoirs above normal): ' + NONE + '. DEP suggests early-morning watering every 5–7 days without rain.'] }),
  e('honolulu', 'HI', 'Honolulu Board of Water Supply', { center: [21.31, -157.86], radiusMi: 25 }, {
    sources: ['https://www.boardofwatersupply.com/news-events/news-and-updates/water-shortage-plan', 'https://dlnr.hawaii.gov/drought/current/county-drought-notices/'],
    notes: [NONE + ' (county drought notice: irrigation "no restrictions").'] }),
  e('wssc', 'MD', 'WSSC Water', { counties: ['Montgomery County', "Prince George's County"], state: 'MD' }, {
    sources: ['https://www.wsscwater.com/essential-use'], notes: ['Essential-water-use-only request lifted; ' + NONE + '.'] }),
  e('fairfax', 'VA', 'Fairfax Water', { counties: ['Fairfax County'], state: 'VA' }, {
    sources: ['https://www.fairfaxwater.org/news/fairfax-water-encourages-wise-water-use-officials-declare-regional-drought-watch'],
    notes: ['Regional Drought Watch: voluntary conservation, ' + NONE + '.'] }),
  e('minneapolis', 'MN', 'Minneapolis Public Works – Water', { center: [44.98, -93.27], radiusMi: 8 }, {
    sources: ['https://library.municode.com/mn/minneapolis/codes/code_of_ordinances?nodeId=MICOOR_TIT19WASTSASE_CH509WAWO_ARTVIWASHOF'], verified: false,
    verifyNote: 'No official current-status page found; news reports indicate no active odd/even restriction.', notes: ['No active sprinkling restriction reported; the city ordinance allows restrictions when declared.'] }),
];

// State-level layers that apply on top of any local entry.
export const STATE_LAYERS = {
  CA: { id: 'ca-state', utility: 'State of California (SWRCB / DWR)', checked: C, verified: true,
    sources: ['https://www.law.cornell.edu/regulations/california/23-CCR-995', CA_MWELO,
      'https://water.ca.gov/-/media/DWR-Website/Web-Pages/Programs/Water-Use-And-Efficiency/MWELO-Rulemaking/Final-MWELO-Text-and-Appendices_20250103.pdf',
      'https://www.waterboards.ca.gov/water_issues/programs/conservation_portal/regs/water_efficiency_legislation.html', 'https://waterboards.ca.gov/conservation/nonfunctional-turf.html'],
    notes: ['Statewide permanent prohibitions (23 CCR §995): no watering turf/ornamental landscape during or within 48 hours after ≥0.25 in. of rain; no runoff; no potable irrigation of turf in public street medians.',
      'MWELO (DWR; 2015 update, amended text effective Jan 2, 2025 — clarifications, no new substantive requirements) applies to new landscapes ≥500 sq ft and rehabilitated landscapes ≥2,500 sq ft that need a permit, plan check or design review. Cities/counties may adopt stricter local ordinances.',
      '"Making Conservation a California Way of Life" (SWRCB, adopted July 3, 2024, effective Jan 1, 2025) sets water-use objectives for urban retail suppliers (not households); compliance starts Jan 1, 2027 — expect supplier budgets, rebates and tighter local rules.',
      'AB 1572 (Water Code §10608.14): no potable water on nonfunctional turf at CII properties from Jan 1, 2028 (state DGS & most local-government properties Jan 1, 2027; HOA/common-interest common areas Jan 1, 2029). Single-family yards are not covered.'],
    rebates: ['https://socalwatersmart.com/ (Southern California, Metropolitan base $2/sq ft)', 'https://www.saveourwater.com/rebates (link not checked)'] },
  GA: { id: 'ga-state', utility: 'Georgia EPD (Water Stewardship Act)', checked: C, verified: true, sources: ['https://epd.georgia.gov/document/document/epddroughtmanagementfactsheetapril-2026pdf/download'],
    notes: ['Statewide: outdoor landscape watering only 4 p.m.–10 a.m. (exemptions for drip/soaker, hand watering, food gardens, new landscapes 30 days).'] },
};
const STATE_NAMES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico' };
export const STATE_DEFAULTS = Object.fromEntries(Object.entries(STATE_NAMES).map(([s, n]) => [s, { id: `default-${s}`, state: s, utility: `${n} — local water provider`, checked: C, verified: false,
  maxDaysPerWeek: null, dripMaxDaysPerWeek: null, sources: ['https://www.epa.gov/watersense/what-plant'],
  notes: [`No utility-specific rule on file for this ZIP. Check your local water district or city for watering days, hours and drought stage.${s === 'FL' ? ' Florida water management districts set year-round landscape irrigation rules (NWFWMD and SRWMD areas not mapped here).' : ''}`],
  rebates: [] }]));

const countyFips = {}; for (const [f, [st, name]] of Object.entries(COUNTIES)) countyFips[`${st}|${name}`] = f;
for (const x of ENTRIES) x._counties = new Set((x.match.counties || []).map(n => countyFips[`${x.match.state || x.state}|${n}`]).filter(Boolean));
export const RULES = Object.fromEntries(ENTRIES.map(x => [x.id, x]));
export default RULES;
const pub = x => { const { _counties, ...r } = x; return r; };
/** findRules(zip, lat, lon, distMi) -> { primary, layers[], county:{fips,name,state} } — smallest matching service circle wins, then county entries, then state default. */
export function findRules(zip, lat, lon, distMi) {
  const fips = ZIP_COUNTY[zip]; const [st, cname] = COUNTIES[fips] || [null, null];
  const hits = [];
  for (const x of ENTRIES) {
    if (x.match.center && distMi([lat, lon], x.match.center) <= x.match.radiusMi) hits.push([x.match.radiusMi, x]);
    else if (fips && x._counties.has(fips)) hits.push([1000, x]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  const state = st || null;
  const primary = hits.length ? pub(hits[0][1]) : state && STATE_DEFAULTS[state] ? STATE_DEFAULTS[state] : null;
  const layers = [...hits.slice(1).map(h => pub(h[1])), ...(state && STATE_LAYERS[state] ? [STATE_LAYERS[state]] : [])];
  return { primary, layers, county: fips ? { fips, name: cname, state } : null };
}
export function metroFor(lat, lon, distMi) { for (const x of ENTRIES) if (x.match.center && distMi([lat, lon], x.match.center) <= x.match.radiusMi) return x.id; return null; }
/** daysCap(rule, monthIndex, 'spray'|'drip') -> number|null — strictest of the rule and its layers. */
export function daysCap(rule, m, kind = 'spray') {
  const one = r => { const v = r && (kind === 'drip' ? r.dripMaxDaysPerWeek : r.maxDaysPerWeek); return v == null ? null : Array.isArray(v) ? v[m] : v; };
  const vals = [rule, ...((rule && rule.layers) || [])].map(one).filter(v => v != null); return vals.length ? Math.min(...vals) : null;
}
/** Summary counts for reporting. */
export function coverageSummary() {
  const by = {}; for (const x of ENTRIES) { const k = x.state === 'CA' ? 'CA' : 'other'; by[k] = by[k] || { verified: 0, unverified: 0 }; by[k][x.verified ? 'verified' : 'unverified']++; }
  return { entries: ENTRIES.length, byRegion: by, stateLayers: Object.keys(STATE_LAYERS), stateDefaults: Object.keys(STATE_DEFAULTS).length };
}

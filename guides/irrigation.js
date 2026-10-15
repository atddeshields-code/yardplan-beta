// irrigation.js — design-driven irrigation plan for Yardplan designs (yard3d serialize() v2, feet).
// General planning guide only — follow local codes / water rules; backflow often requires a licensed installer.
// The generator lives in irrigation-core.js (no data tables); this wrapper adds the offline ZIP → location lookup.
import { getLocation } from './location.js';
import { generateIrrigationPlan as core } from './irrigation-core.js';
export * from './irrigation-core.js';
export function generateIrrigationPlan(design, opts = {}) {
  return core(design, { ...opts, location: opts.location || getLocation(opts.zip, { zipFallback: opts.catalog && opts.catalog.zipFallback }) });
}

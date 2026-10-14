// catalog-node.js — Node-only loader for /workspace/yardplan/data.js (classic script) via vm. Read-only.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
export const DEFAULT_DATA_JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data.js');
export function loadAppCatalog(file = DEFAULT_DATA_JS) {
  const ctx = vm.createContext({}); vm.runInContext(fs.readFileSync(file, 'utf8') +
    '\n;this.__c={plants:PLANTS,plant3d:typeof PLANT_SIZE!=="undefined"?PLANT_SIZE:{},zipFallback:typeof ZIP_FALLBACK!=="undefined"?ZIP_FALLBACK:{},materials:typeof MATERIALS!=="undefined"?MATERIALS:null};', ctx);
  return JSON.parse(JSON.stringify(ctx.__c));
}

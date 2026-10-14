// ==== PRICING: EXAMPLE ESTIMATES ONLY — NOT LIVE PRICES ====
// Base prices are rough illustrative US big-box retail figures, hand-entered.
// unit: what you buy; calc(areaSqFt, opts) -> units needed.
const MATERIALS={
 mulch:{name:'Shredded mulch (3" deep)',unit:'2 cu ft bag',price:4.00,calc:a=>Math.ceil(a*(3/12)/2)},
 rock:{name:'River rock (2" deep)',unit:'0.5 cu ft bag',price:6.00,calc:a=>Math.ceil(a*(2/12)/0.5)},
 pavers:{name:'Concrete pavers 12"×12"',unit:'paver',price:3.00,calc:a=>Math.ceil(a*1.05)},
 sod:{name:'Sod',unit:'pallet (~450 sq ft)',price:250.00,calc:a=>Math.ceil(a*1.05/450)},
 topsoil:{name:'Topsoil (4" deep)',unit:'0.75 cu ft bag',price:3.50,calc:a=>Math.ceil(a*(4/12)/0.75)},
 edging:{name:'Landscape edging (perimeter of square area)',unit:'20 ft roll',price:20.00,calc:a=>Math.ceil(4*Math.sqrt(a)/20)},
 fabric:{name:'Landscape fabric',unit:'3×50 ft roll (150 sq ft)',price:15.00,calc:a=>Math.ceil(a*1.1/150)},
};
// Example regional multipliers by first digit of zip (illustrative, not sourced).
const REGION_MULT={'0':1.15,'1':1.15,'2':1.0,'3':0.95,'4':0.95,'5':0.97,'6':0.97,'7':0.93,'8':1.03,'9':1.18};

/**
 * PriceProvider interface — plug real retailer data in here.
 * async getPrice(materialKey, zip) => {price:number, unit:string, source:string, store?:string, asOf:Date} | null
 * Real candidates (need partner/affiliate agreements or approved data vendors; none are wired up):
 *  - Home Depot: no open public price API; access via affiliate (Impact) program or licensed data providers.
 *  - Lowe's: same — partner/affiliate programs only.
 *  - Third-party product data APIs (e.g. SerpApi Home Depot engine, BlueCart/Rainforest-style APIs) — paid, check ToS.
 * Prices would be fetched by your OWN backend (to keep API keys secret) keyed by zip -> nearest store.
 */
class ExamplePriceProvider{
  async getPrice(key,zip){const m=MATERIALS[key];const mult=REGION_MULT[(zip||'')[0]]??1;
    return {price:+(m.price*mult).toFixed(2),unit:m.unit,source:'Example estimate (not live)',asOf:null,isEstimate:true};}
}
/**
 * Live prices from Yardplan's own backend (backend/ — Cloudflare Worker + SerpApi Home Depot engine).
 * - One batched POST per zip for all materials, memoized per page (keystroke re-renders cost no requests).
 * - Never throws or returns null: any failure, missing zip, or per-item isEstimate falls back to ExamplePriceProvider.
 * - Prices come back per the app's purchase unit (MATERIALS[key].unit), so calc() quantities stay correct.
 */
class RetailerApiPriceProvider{
  constructor(endpoint,{fallback=new ExamplePriceProvider(),timeoutMs=8000}={}){
    this.endpoint=endpoint;this.fallback=fallback;this.timeoutMs=timeoutMs;this.byZip=new Map();this.failedAt=new Map();}
  _load(zip){
    if(Date.now()-(this.failedAt.get(zip)||0)<60000)return Promise.resolve(null); // back off 60 s after a failure
    if(!this.byZip.has(zip)){
      const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),this.timeoutMs);
      const p=fetch(this.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctl.signal,
          body:JSON.stringify({zip,materials:Object.keys(MATERIALS).map(k=>({key:k,unit:MATERIALS[k].unit}))})})
        .then(r=>r.ok?r.json():Promise.reject(new Error('HTTP '+r.status)))
        .catch(e=>{this.byZip.delete(zip);this.failedAt.set(zip,Date.now());console.info('Yardplan: live prices unavailable, using example estimates.',e&&e.message);return null;}) // retried after the back-off
        .finally(()=>clearTimeout(t));
      this.byZip.set(zip,p);}
    return this.byZip.get(zip);}
  async getPrice(key,zip){
    try{
      if(!/^\d{5}$/.test(zip||''))return this.fallback.getPrice(key,zip);
      const data=await this._load(zip);const r=data&&data.results&&data.results[key];
      if(!r||r.isEstimate||typeof r.price!=='number'||!(r.price>0))return this.fallback.getPrice(key,zip);
      return {price:r.price,unit:MATERIALS[key].unit,source:r.source||'Retailer',store:r.store,asOf:r.fetchedAt?new Date(r.fetchedAt):null,
              url:r.url,product:r.product,productUnitPrice:r.productPrice,isEstimate:false};
    }catch(e){return this.fallback.getPrice(key,zip);}
  }
}
// Live pricing is OFF unless a backend URL is configured, e.g. in index.html before prices.js:
//   <script>window.YARDPLAN_PRICES_URL='https://yardplan-prices.<account>.workers.dev/api/prices'</script>
const PRICES_API_URL=(typeof window!=='undefined'&&window.YARDPLAN_PRICES_URL)||'';
let priceProvider=PRICES_API_URL?new RetailerApiPriceProvider(PRICES_API_URL):new ExamplePriceProvider();

const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const state={zip:'',zone:null,zoneLabel:''};
const img=id=>CREDITS[id]?`img/plants/${id}.jpg`:null;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// ---- navigation ----
function setMode(m){document.body.dataset.mode=m;const b=$('#modeBtn');b.hidden=m!=='pro';b.setAttribute('aria-pressed',m==='pro');try{localStorage.setItem('yardplan.mode',m)}catch(e){}}
setMode(localStorage.getItem('yardplan.mode')==='pro'?'pro':'home');
$('#modeBtn').onclick=()=>{setMode('home');go('home');};$('#proEntry').onclick=()=>go('pro');
function go(tab){if(tab==='pro')setMode('pro');$$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 $$('#nav button').forEach(b=>b.toggleAttribute('aria-current',b.dataset.tab===tab));$$('.tab').forEach(t=>t.classList.toggle('active',t.id==='tab-'+tab));document.body.dataset.tab=tab;window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 if(tab==='styles')closeStyle();if(tab==='overlay'&&window.onOverlayShow)window.onOverlayShow();if(tab==='site'&&window.onSiteShow)window.onSiteShow();if(tab==='pro'&&window.onProShow)window.onProShow();if(tab==='care'&&window.onCareShow)window.onCareShow();window.dispatchEvent(new CustomEvent('yardplan:tab',{detail:tab}));}
$$('#nav button').forEach(b=>b.onclick=()=>go(b.dataset.tab));
document.addEventListener('click',e=>{const a=e.target.closest('[data-go]');if(a){e.preventDefault();go(a.dataset.go);if(a.dataset.step&&window.flowApi)window.flowApi.step(+a.dataset.step);}});
// ---- zone ----
for(let z=1;z<=13;z++)for(const h of['a','b'])$('#zoneSel').insertAdjacentHTML('beforeend',`<option>${z}${h}</option>`);
$('#zoneSel').onchange=e=>{if(e.target.value)setZone(e.target.value,'Selected manually')};
async function lookupZone(zip){
 try{const r=await fetch(`https://phzmapi.org/${zip}.json`);if(!r.ok)throw 0;const j=await r.json();
  return {zone:j.zone,src:`USDA 2023 map via phzmapi.org · avg. winter low ${j.temperature_range}°F`};}
 catch(e){try{const Z=(await import('./guides/data/usda-zones.js')).default;if(Z[zip])return{zone:Z[zip],src:'USDA 2023 map (offline copy, PRISM/OSU)'};}catch(_){}if(ZIP_FALLBACK[zip])return{zone:ZIP_FALLBACK[zip],src:'Offline sample data (approximate)'};return null;}}
const zr=$('#zoneResult');
$('#zipForm').onsubmit=async e=>{e.preventDefault();const zip=$('#zip').value.trim();zr.hidden=false;
 if(!/^\d{5}$/.test(zip)){zr.innerHTML='Please enter a 5-digit US ZIP code.';return;}
 state.zip=zip;zr.innerHTML='Looking up your zone…';const r=await lookupZone(zip);
 if(r)setZone(r.zone,r.src);else zr.innerHTML=`We couldn't find ZIP ${esc(zip)}. Pick your zone manually below.`;renderMaterials();};
function setZone(z,src){state.zone=parseInt(z,10);state.zoneLabel=z;$('#zoneSel').value=z;
 const n=PLANTS.filter(fits).length;zr.hidden=false;
 zr.innerHTML=`<b>${state.zip?'ZIP '+state.zip+' · ':''}Zone ${z}</b> · ${n} plants do well here<small>${esc(src)}</small>`;
 $('#zonePill').textContent='Zone '+z;$('#moreZone').textContent=(state.zip?'ZIP '+state.zip+' · ':'')+'Zone '+z;window.dispatchEvent(new Event('yardplan:zone'));renderPlants();renderStyles();renderPalette();}
const fits=p=>!state.zone||(state.zone>=p.zmin&&state.zone<=p.zmax);
const sunTxt={full:'Full sun',part:'Part shade',shade:'Shade'},waterTxt={low:'Low water',med:'Med water',high:'High water'};
function photo(p,cls='ph'){const s=img(p.id);return `<div class="${cls}">${s?`<img loading="lazy" src="${s}" alt="${esc(p.name)}" onerror="this.remove()">`:''}<div class="fb" ${s?'style="z-index:-1"':''}>${p.icon}</div><span class="badge">${p.type}</span></div>`}
function plantCard(p){return `<article class="pc">${photo(p)}<div class="bd"><h3>${esc(p.name)}</h3><div class="sci">${esc(p.sci)}</div>
<div class="meta"><span class="chip zone">Zones ${p.zmin}–${p.zmax}</span><span class="chip">${p.sun.map(s=>sunTxt[s]).join(' · ')}</span><span class="chip">${waterTxt[p.water]}</span></div>
<div class="small">${esc(p.size)}<br>${esc(p.native)}</div></div></article>`}
function renderPlants(){const s=$('#fSun').value,w=$('#fWater').value,t=$('#fType').value;
 const list=PLANTS.filter(p=>fits(p)&&(!s||p.sun.includes(s))&&(!w||p.water===w)&&(!t||p.type===t));
 $('#plantCount').textContent=state.zone?`${list.length} plants suited to zone ${state.zoneLabel}`:`${list.length} plants · set your ZIP to filter by zone`;
 $('#plantList').innerHTML=list.map(plantCard).join('')||`<div class="empty"><b>No plants match</b>Try loosening the sun, water or type filters${state.zone?', or check another zone':''}.<br><br><button class="btn ghost" onclick="['#fSun','#fWater','#fType'].forEach(i=>$(i).value='');renderPlants()">Clear filters</button></div>`;}
['#fSun','#fWater','#fType'].forEach(id=>$(id).onchange=renderPlants);
// ---- styles ----
function renderStyles(){$('#styleList').innerHTML=STYLES.map(st=>{const n=PLANTS.filter(p=>p.styles.includes(st.id)&&fits(p)).length;
 return `<button class="sc" data-style="${st.id}" style="background-image:image-set(url(img/styles/${st.id}-800.webp) 1x,url(img/styles/${st.id}-1600.webp) 2x)"><div><h3>${st.name}</h3><span>${n} catalog plants${state.zone?' for zone '+state.zoneLabel:''}</span></div></button>`}).join('');
 if(!$('#styleDetail').hidden)openStyle(state.openStyle);}
$('#styleList').onclick=e=>{const b=e.target.closest('[data-style]');if(b)openStyle(b.dataset.style);};
function openStyle(id){state.openStyle=id;const st=STYLES.find(s=>s.id===id),ps=PLANTS.filter(p=>p.styles.includes(id)&&fits(p));
 $('#styleIndex').hidden=true;const d=$('#styleDetail');d.hidden=false;
 d.innerHTML=`<div class="sd-hero" style="background-image:url(img/styles/${id}-1600.webp)"><button class="back" onclick="closeStyle()">← All styles</button><div><p class="eyebrow">Design style</p><h2>${st.name}</h2></div></div>
 <div class="card pad" style="margin-top:14px"><p style="margin:0;font-size:16px">${st.desc}</p><div class="facts"><div><h4>Typical plants</h4>${st.plants}</div><div><h4>Typical materials</h4>${st.materials}</div></div></div>
 <div class="sechead" style="padding-top:8px"><h2 style="font-size:24px">Catalog plants that fit</h2><p class="muted">${state.zone?`Filtered for zone ${state.zoneLabel}`:'Set your ZIP in My yard to filter by zone'}</p></div>
 <div class="grid">${ps.map(plantCard).join('')||`<div class="empty"><b>Nothing for this zone yet</b>None of our catalog plants for this style grow in zone ${state.zoneLabel}. Try a different style.</div>`}</div>
 <p class="foot">Illustration: AI-generated, shows the general look of the style · <a href="#" data-go="credits">credits</a></p>`;window.scrollTo({top:0});}
function closeStyle(){$('#styleDetail').hidden=true;$('#styleIndex').hidden=false;}
// ---- materials ----
$('#matChecks').innerHTML=Object.entries(MATERIALS).map(([k,m])=>`<label class="ck"><input type="checkbox" value="${k}" ${k==='mulch'||k==='fabric'?'checked':''}> ${m.name}</label>`).join('');
$('#matChecks').onchange=renderMaterials;$('#area').oninput=renderMaterials;
$('#adj').oninput=()=>{$('#adjVal').textContent='×'+(+$('#adj').value).toFixed(2);renderMaterials();};
let matSeq=0;
if(PRICES_API_URL)$('#priceNotice').innerHTML='<b>Live prices where available.</b> With your ZIP set, prices come from your nearest store via Yardplan\'s pricing service, as of the date shown. Anything we can\'t price live is clearly marked as an example estimate. Always confirm at the store.';
async function renderMaterials(){const a=Math.max(0,+$('#area').value||0),adj=+$('#adj').value,seq=++matSeq;let total=0,rows='';
 const sel=[...$$('#matChecks input:checked')];
 const prs=await Promise.all(sel.map(cb=>priceProvider.getPrice(cb.value,state.zip)));
 if(seq!==matSeq)return; // a newer render started while prices were loading
 const anyEst=prs.some(p=>p.isEstimate!==false),allEst=prs.every(p=>p.isEstimate!==false);
 sel.forEach((cb,i)=>{const k=cb.value,m=MATERIALS[k],q=m.calc(a),pr=prs[i];const unit=pr.price*adj,c=Math.round(q*unit);total+=c;
  const live=pr.isEstimate===false;
  const sub=live?`<div class="small">${q} × ${m.unit} · ${pr.url?`<a href="${esc(pr.url)}" target="_blank" rel="noopener">${esc(pr.product||'product')}</a>`:esc(pr.product||'')}</div>`:`<div class="small">${q} × ${m.unit}${anyEst&&!allEst?' · <span class="tag-ex sm">example</span>':''}</div>`;
  rows+=`<tr><td>${m.name}${sub}</td><td class="n">$${unit.toFixed(2)}</td><td class="n">$${c.toLocaleString('en-US')}</td></tr>`;});
 const live=prs.find(p=>p.isEstimate===false);
 const asOf=live&&live.asOf?live.asOf.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'';
 const tag=allEst?'<span class="tag-ex">EXAMPLE ESTIMATE · NOT LIVE PRICES</span>':anyEst?'<span class="tag-ex">MIXED: SOME LIVE PRICES, SOME EXAMPLE ESTIMATES</span>':'<span class="tag-live">LIVE RETAIL PRICES</span>';
 const foot=allEst?`Region: ${state.zip?'ZIP '+state.zip+' (×'+(REGION_MULT[state.zip[0]]??1)+' example multiplier)':'national example (set ZIP on Home)'}`
   :`Prices from ${esc(live.store||live.source)}${asOf?', as of '+asOf:''}; prices and stock may vary${anyEst?'. Rows marked "example" use example estimates':''}`;
 $('#matResult').innerHTML=!sel.length?'<div class="empty" style="box-shadow:none"><b>Pick a material</b>Choose one or more materials to see quantities.</div>':`${tag}<table><tr><th>Material</th><th class="n">${allEst?'Est./unit':'Price/unit'}</th><th class="n">Est. cost</th></tr>${rows}
 <tr class="total"><th colspan="2">${allEst?'Example total':'Estimated total'}</th><th class="n">$${total.toLocaleString('en-US')}</th></tr></table>
 <p class="small" style="margin-top:10px">${foot} · your adjustment ×${adj.toFixed(2)}. Waste: pavers and sod +5%, fabric +10%; bagged mulch, rock, topsoil and edging have no waste allowance (the Pro takeoff adds 10%). Not a quote.</p>`;}
// ---- photo overlay palette (photo tools live in photo.js) ----
function renderPalette(){$('#palette').innerHTML=PLANTS.filter(fits).map(p=>`<button data-id="${p.id}">${img(p.id)?`<img src="${img(p.id)}" alt="" loading="lazy">`:`<span class="fbr">${p.icon}</span>`}${esc(p.name)}</button>`).join('');}
// ---- credits ----
function licUrl(l){const m=/^CC (BY(?:-SA)?) (\d\.\d)$/i.exec((l||'').trim());if(m)return`https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/`;if(/^CC0/i.test(l))return'https://creativecommons.org/publicdomain/zero/1.0/';if(/public domain/i.test(l))return'https://creativecommons.org/publicdomain/mark/1.0/';return null;}
function licLink(l){const u=licUrl(l);return u?`<a href="${u}" target="_blank" rel="noopener license">${esc(l)}</a>`:esc(l);}
$('#creditList').innerHTML=Object.entries(CREDITS).map(([k,c])=>{const nm=c.kind==='styles'?STYLES.find(s=>s.id===k).name:PLANTS.find(p=>p.id===k).name;
 return `<div class="cr"><img src="img/${c.kind}/${k}.jpg" alt="" loading="lazy"><div><b>${esc(nm)}</b>${esc(c.author||'Unknown author')} · ${licLink(c.license)}<br><a href="${c.source}" target="_blank" rel="noopener">${esc(c.file)}</a>${c.note?`<div class="small">${esc(c.note)}</div>`:''}</div></div>`}).join('');
renderPlants();renderStyles();renderPalette();renderMaterials();

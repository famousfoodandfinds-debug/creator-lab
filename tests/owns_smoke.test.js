// Ownership-on path: when the creator has ticked "I own or use this product myself", the VOICE flips to
// first-person and the ownership-tagged body exemplars load. Drives the real Generate path and reads the prompt.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const sbCode = blocks.find(b => b.includes('window.SaxeBrief ='));
const win = {}; new Function('window', sbCode)(win); const SB = win.SaxeBrief;

function mkEl(id){ return { id:id||'', style:{cssText:'',display:'',color:''}, value:'', textContent:'', disabled:false, _children:[], classList:{add(){},remove(){}}, set innerHTML(v){ this._children=[]; this._html=v; }, get innerHTML(){ return this._html||''; }, appendChild(c){ this._children.push(c); return c; }, addEventListener(){}, focus(){}, click(){}, removeChild(){}, querySelector(){ return null; } }; }
const byId = {};
const document = { readyState:'complete', getElementById(id){ if(!byId[id]) byId[id]=mkEl(id); return byId[id]; }, createElement(t){ return mkEl('<'+t+'>'); }, createDocumentFragment(){ return mkEl('#frag'); }, querySelector(s){ if(!byId[s]) byId[s]=mkEl(s); return byId[s]; }, addEventListener(){}, body:{classList:{add(){},remove(){}}} };
global.setTimeout = function(fn){ try { fn(); } catch(e){} };

const OWN_SCRIPTS = [
  { hook:"I keep this on my counter for a reason", body1:"I reach for it every morning without thinking", preclose:"If it wasn't this easy I would not use it daily", body2:"My drinks are cold before I sit down", cta:"Grab one before they go" },
  { hook:"Somehow my guests always ask about it", body1:"I fill it once and forget it", preclose:"One tank keeps the whole night going", body2:"I host without a second thought", cta:"Tap the link to try it" },
  { hook:"The freezer tray could not keep up with me", body1:"I got tired of waiting for a slow refill", preclose:"It tucks into a small corner of my kitchen", body2:"My counter stays clear now", cta:"Check it out right here" },
  { hook:"Cold drinks used to be a whole chore for me", body1:"I dreaded the empty tray every time", preclose:"A quiet cycle and I am done", body2:"I actually enjoy the crunch now", cta:"See it on the shop page" }
];
let fetchCalls = 0, capturedPrompt = '';
const fetchStub = function(url, opts){ fetchCalls++; try { if(!capturedPrompt) capturedPrompt = JSON.parse(opts.body).messages[0].content; } catch(e){} return Promise.resolve({ status:200, text(){ return Promise.resolve(JSON.stringify({ content:[{type:'text', text: JSON.stringify(OWN_SCRIPTS)}] })); } }); };

const psCode = blocks.find(b => b.includes('window.ProductScreen ='));
const params = ['window','document','currentUser','sb','currentProductId','currentProductName','currentProduct','loadProductById','buildSelect','transcribeTikTokLink','claudeHeaders','showToast','fetch','console'];
const chain = { select(){ return chain; }, eq(){ return chain; }, update(){ return chain; }, insert(){ return chain; }, order(){ return { then(r){ r({data:[],error:null}); } }; }, single(){ return { then(r){ r({data:{id:'p1'},error:null}); } }; }, then(r){ r({data:{id:'p1'},error:null}); } };
// This suite exercises the CURRENT engine with FULL guards -- pin them (the app default is now minimal/liability).
global.localStorage = { getItem(k){ return k === 'saxe_engine' ? 'current' : k === 'saxe_guards' ? 'full' : k === 'saxe_minimal_model' ? 'haiku' : null; }, setItem(){} };
new Function(...params, psCode)(win, document, {id:'261c4239-34bc-427e-9a4d-8b23d73ede47'}, { from(){ return chain; } }, 'p1', 'Ice maker', {}, function(){}, function(){}, function(){ return Promise.resolve({}); }, function(){ return {}; }, function(){}, fetchStub, console);
const PS = win.ProductScreen;

let pass=0, fail=0; function ok(c,m){ if(c) pass++; else { fail++; console.log('  ✗ '+m); } }

let brief = SB.emptyBrief();
brief.meta.lastDerivedAt = '2026-01-01T00:00:00Z'; brief.meta.reviewCount = 12; brief.meta.classified = true;
brief.lines.objections = SB.normalizeBrief({lines:{objections:[{value:'worried it is too small', count:4, classified:true, cause:'the tank holds less'}]}}).lines.objections;
let raw = SB.emptyRaw(); raw.reviews = [{ id:'r1', full:'love it' }]; raw.ownership = "used";   // <-- USED OVER TIME (full first person)
const product = { id:'p1', name:'Ice maker', updated_at:'2026-01-01T00:00:00Z', brief:brief, raw:raw };
try { PS.fill(product); } catch(e){ ok(false, 'fill threw: ' + e.message); }

(async () => {
  try { PS.generateScripts(); } catch(e){ ok(false, 'generateScripts threw: ' + e.message); }
  for (let k=0;k<80;k++) await Promise.resolve();
  const status = (byId['genStatus'] && byId['genStatus'].textContent) || '';
  ok(fetchCalls >= 1, 'reached the model call');
  ok(status.indexOf('hit an error') < 0, 'no error surfaced');
  ok(capturedPrompt.indexOf('you have USED this product over time') >= 0, 'ownership USED -> first-person VOICE');
  ok(capturedPrompt.indexOf("If it wasn't dishwasher safe I wouldn't own it") >= 0, 'the owns-tagged turn exemplar loads only when owns');
  // First-person scripts are NOT dropped when owns is on.
  ok(status.indexOf('4 script') >= 0 && status.indexOf('dropped') < 0, 'first-person scripts pass the guard when the creator owns the product');
  function walk(el,a,d){ if(!el||d>12) return; (el._children||[]).forEach(function(c){ if(c.textContent||c.value) a.push(c.textContent||c.value); walk(c,a,d+1); }); }
  let t=[]; walk(byId['genScripts'], t, 0);
  ok(t.join(' | ').indexOf('I keep this on my counter for a reason') >= 0, 'the first-person script rendered');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

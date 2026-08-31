// Regression: a figure a REVIEWER gave about their own unit ("a fresh batch every six to seven minutes")
// got laundered into the features list by derivation, and the number guard -- which trusted anything in the
// features list as a listing spec -- let it through. The guard now judges a figure by PROVENANCE: a figure is
// a verifiable spec only when it is in the actual listing text (raw.description) or a feature the OWNER added
// by hand. A derivation-created feature's figure that never made the listing is blocked. Drives the real path.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const win = {}; new Function('window', blocks.find(b => b.includes('window.SaxeBrief =')))(win); const SB = win.SaxeBrief;
function mkEl(id){ return { id:id||'', style:{cssText:'',display:'',color:''}, value:'', textContent:'', disabled:false, _children:[], classList:{add(){},remove(){}}, set innerHTML(v){ this._children=[]; this._html=v; }, get innerHTML(){ return this._html||''; }, appendChild(c){ this._children.push(c); return c; }, addEventListener(){}, focus(){}, click(){}, removeChild(){}, querySelector(){ return null; } }; }
const byId = {};
const document = { readyState:'complete', getElementById(id){ if(!byId[id]) byId[id]=mkEl(id); return byId[id]; }, createElement(t){ return mkEl('<'+t+'>'); }, createDocumentFragment(){ return mkEl('#frag'); }, querySelector(s){ if(!byId[s]) byId[s]=mkEl(s); return byId[s]; }, addEventListener(){}, body:{classList:{add(){},remove(){}}} };
global.setTimeout = function(fn){ try { fn(); } catch(e){} };

// Script A asserts a LISTING figure (in raw.description). Script B asserts the REVIEW figure that only reached
// the features list. Both regen attempts for B keep the review figure, so B is dropped; A is clean throughout.
const A = { hook:"Your glass deserves better ice", body1:"You keep chewing weak hollow cubes", preclose:"", body2:"It makes 33 pounds of ice a day", cta:"Grab yours before they go" };
const B = { hook:"Ice on tap whenever you want", body1:"You stop planning around the freezer", preclose:"", body2:"A fresh batch cycles every six to seven minutes", cta:"Tap the link to try it" };
let calls = 0;
const fetchStub = function(u, o){
  calls++;
  const content = JSON.parse(o.body).messages[0].content;
  const payload = /REGENERATE ONLY SCRIPT/.test(content)
    ? JSON.stringify(B)                 // every rewrite of B keeps the review figure -> stays blocked
    : JSON.stringify([A, B]);           // the batch
  return Promise.resolve({ status:200, text(){ return Promise.resolve(JSON.stringify({ content:[{ type:'text', text: payload }] })); } });
};
const psCode = blocks.find(b => b.includes('window.ProductScreen ='));
const params = ['window','document','currentUser','sb','currentProductId','currentProductName','currentProduct','loadProductById','buildSelect','transcribeTikTokLink','claudeHeaders','showToast','fetch','console'];
const chain = { select(){ return chain; }, eq(){ return chain; }, update(){ return chain; }, insert(){ return chain; }, order(){ return { then(r){ r({data:[],error:null}); } }; }, single(){ return { then(r){ r({data:{id:'p1'},error:null}); } }; }, then(r){ r({data:{id:'p1'},error:null}); } };
new Function(...params, psCode)(win, document, {id:'u1'}, { from(){ return chain; } }, 'p1', 'Ice maker', {}, function(){}, function(){}, function(){ return Promise.resolve({}); }, function(){ return {}; }, function(){}, fetchStub, console);
const PS = win.ProductScreen;

let pass=0, fail=0; function ok(c,m){ if(c) pass++; else { fail++; console.log('  ✗ '+m); } }

// ---- unit: the guard itself judges a figure by the listingText it is handed --------------------------------
ok(SB.scriptViolations({ body2:"it makes 33 pounds a day" }, { listingText:"Makes 33 lbs per 24 hours" }).indexOf('asserted-number') < 0, 'guard: a figure in the listing text is allowed');
ok(SB.scriptViolations({ body2:"a batch every six to seven minutes" }, { listingText:"Makes 33 lbs per 24 hours" }).indexOf('asserted-number') >= 0, 'guard: a figure NOT in the listing text is blocked');
// adapter carries feature provenance (added) so generation can tell a listing spec from a review-derived one.
ok(SB.briefToGenContext(SB.normalizeBrief({features:[{feature:'33 lbs a day', benefit:'x', added:true}]}), SB.emptyRaw()).features[0].added === true, 'adapter: exposes hand-added feature provenance');

// ---- end to end: the review figure laundered into features is blocked; the listing figure survives ---------
let brief = SB.emptyBrief();
brief.meta.lastDerivedAt='2026-01-01'; brief.meta.reviewCount=12; brief.meta.classified=true;
brief.lines.pains = SB.normalizeBrief({lines:{pains:[{value:'ice runs out too fast', count:5, classified:true, about:'alternative'}]}}).lines.pains;
// features: the real listing spec (33) AND a review figure derivation laundered in (six/seven), both added=false.
brief.features = SB.normalizeBrief({features:[
  { feature:'makes 33 lbs per 24 hours', benefit:'plenty of ice' },
  { feature:'a fresh batch every six to seven minutes', benefit:'quick refill' }
]}).features;
let raw = SB.emptyRaw();
raw.reviews = [{ id:'r1', full:'mine cycles a fresh batch every six to seven minutes, so good' }];
raw.description = 'Portable nugget ice maker. Makes 33 lbs per 24 hours. 1.8 L tank.';   // the true listing: has 33, not six/seven
PS.fill({id:'p1', name:'Ice maker', updated_at:'2026-01-01', brief, raw});

(async () => {
  PS.generateScripts();
  for (let k=0;k<200;k++) await Promise.resolve();
  const status = (byId['genStatus'] && byId['genStatus'].textContent) || '';
  function walk(el,a,d){ if(!el||d>12) return; (el._children||[]).forEach(function(c){ if(c.textContent||c.value) a.push(c.textContent||c.value); walk(c,a,d+1); }); }
  let t=[]; walk(byId['genScripts'], t, 0); const joined = t.join(' | ');
  ok(joined.indexOf('It makes 33 pounds of ice a day') >= 0, 'the LISTING figure (in raw.description) survived');
  ok(joined.indexOf('six to seven minutes') < 0, 'the REVIEW figure laundered into features never reached the screen');
  ok(/unverifiable figure/.test(status) && /Script 2/.test(status), 'the review-figure script was dropped and named: "' + status.slice(0,110) + '"');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

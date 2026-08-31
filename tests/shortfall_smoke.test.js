// Regression test for the SILENT SHORTFALL: the model returns fewer than GEN_COUNT scripts, and the batch
// used to come back short with no message. Now the skipped slots are generated to their assignment, so the
// batch reaches the target (or reports the shortfall) -- never two scripts back with no explanation.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const win = {}; new Function('window', blocks.find(b => b.includes('window.SaxeBrief =')))(win); const SB = win.SaxeBrief;
function mkEl(id){ return { id:id||'', style:{cssText:'',display:'',color:''}, value:'', textContent:'', disabled:false, _children:[], classList:{add(){},remove(){}}, set innerHTML(v){ this._children=[]; this._html=v; }, get innerHTML(){ return this._html||''; }, appendChild(c){ this._children.push(c); return c; }, addEventListener(){}, focus(){}, click(){}, removeChild(){}, querySelector(){ return null; } }; }
const byId = {};
const document = { readyState:'complete', getElementById(id){ if(!byId[id]) byId[id]=mkEl(id); return byId[id]; }, createElement(t){ return mkEl('<'+t+'>'); }, createDocumentFragment(){ return mkEl('#frag'); }, querySelector(s){ if(!byId[s]) byId[s]=mkEl(s); return byId[s]; }, addEventListener(){}, body:{classList:{add(){},remove(){}}} };
global.setTimeout = function(fn){ try { fn(); } catch(e){} };

// The model returns only TWO scripts in the batch; then one distinct single object per top-up call.
const BATCH2 = [
  { hook:"Your morning coffee deserves real ice", body1:"You wait around for the tray to freeze", preclose:"One tank keeps the glasses full", body2:"You pour without a thought", cta:"Grab yours before they go" },
  { hook:"The freezer tray never keeps up", body1:"You keep refilling the same tray", preclose:"It tucks into a small corner", body2:"Your counter stays clear", cta:"Tap the link to try it" }
];
const SINGLES = [
  { hook:"Cold drinks should not be this hard", body1:"You dread the empty tray", preclose:"A quiet cycle and it is done", body2:"You enjoy the crunch now", cta:"See it on the shop page" },
  { hook:"You keep running out at the worst time", body1:"You scramble for a bag of ice", preclose:"It refills itself overnight", body2:"You stop thinking about ice", cta:"Check it out right here" }
];
let calls = 0, singleIdx = 0;
const fetchStub = function(u, o){
  // The monthly-cap counter fetch (count_only) is not a generation call -- ignore it and don't count it, so
  // the batch stays the first generation call this test sequences on.
  var b = {}; try { b = JSON.parse(o.body); } catch(e){}
  if (b.count_only) return Promise.resolve({ status:200, text(){ return Promise.resolve(JSON.stringify({ ok:false })); } });
  calls++;
  var payload;
  if (calls === 1) payload = JSON.stringify({ content:[{ type:'text', text: JSON.stringify(BATCH2) }] });          // batch: only 2
  else payload = JSON.stringify({ content:[{ type:'text', text: JSON.stringify(SINGLES[singleIdx++ % SINGLES.length]) }] }); // top-up: one each
  return Promise.resolve({ status:200, text(){ return Promise.resolve(payload); } });
};
const psCode = blocks.find(b => b.includes('window.ProductScreen ='));
const params = ['window','document','currentUser','sb','currentProductId','currentProductName','currentProduct','loadProductById','buildSelect','transcribeTikTokLink','claudeHeaders','showToast','fetch','console'];
const chain = { select(){ return chain; }, eq(){ return chain; }, update(){ return chain; }, insert(){ return chain; }, order(){ return { then(r){ r({data:[],error:null}); } }; }, single(){ return { then(r){ r({data:{id:'p1'},error:null}); } }; }, then(r){ r({data:{id:'p1'},error:null}); } };
new Function(...params, psCode)(win, document, {id:'u1'}, { from(){ return chain; } }, 'p1', 'Ice maker', {}, function(){}, function(){}, function(){ return Promise.resolve({}); }, function(){ return {}; }, function(){}, fetchStub, console);
const PS = win.ProductScreen;

let pass=0, fail=0; function ok(c,m){ if(c) pass++; else { fail++; console.log('  ✗ '+m); } }
let brief = SB.emptyBrief();
brief.meta.lastDerivedAt='2026-01-01'; brief.meta.reviewCount=12; brief.meta.classified=true;
brief.lines.pains = SB.normalizeBrief({lines:{pains:[{value:'ice runs out on RV trips', count:5, classified:true},{value:'the freezer has no room for bags', count:4, classified:true}]}}).lines.pains;
let raw = SB.emptyRaw(); raw.reviews=[{id:'r1',full:'great ice'}];
PS.fill({id:'p1', name:'Ice maker', updated_at:'2026-01-01', brief, raw});

(async () => {
  PS.generateScripts();
  for (let k=0;k<120;k++) await Promise.resolve();
  const status = (byId['genStatus'] && byId['genStatus'].textContent) || '';
  ok(calls >= 3, 'the two skipped slots each triggered a top-up model call (batch returned only 2)');
  function walk(el,a,d){ if(!el||d>12) return; (el._children||[]).forEach(function(c){ if(c.textContent||c.value) a.push(c.textContent||c.value); walk(c,a,d+1); }); }
  let t=[]; walk(byId['genScripts'], t, 0); const joined = t.join(' | ');
  ok(joined.indexOf('Cold drinks should not be this hard') >= 0 && joined.indexOf('You keep running out at the worst time') >= 0, 'the two skipped scripts were generated and rendered');
  ok(/4 of 4|4 script/.test(status), 'the batch reached the target (never a silent short batch): "' + status.slice(0,70) + '"');
  ok(status.indexOf('hit an error') < 0, 'no silent error');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

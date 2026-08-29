// Regression for the HALF-A-BATCH drop: a script that breaks a hard rule used to get ONE rewrite and then be
// dropped, so two of four kept vanishing (invented figures) and the owner only ever saw half a batch. Now a
// violating slot is retried up to MAX_TRIES before it is dropped, so a slot that comes clean on a later attempt
// is recovered (the batch reaches target), and a slot that never comes clean is dropped ONCE and named.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const win = {}; new Function('window', blocks.find(b => b.includes('window.SaxeBrief =')))(win); const SB = win.SaxeBrief;
function mkEl(id){ return { id:id||'', style:{cssText:'',display:'',color:''}, value:'', textContent:'', disabled:false, _children:[], classList:{add(){},remove(){}}, set innerHTML(v){ this._children=[]; this._html=v; }, get innerHTML(){ return this._html||''; }, appendChild(c){ this._children.push(c); return c; }, addEventListener(){}, focus(){}, click(){}, removeChild(){}, querySelector(){ return null; } }; }
const byId = {};
const document = { readyState:'complete', getElementById(id){ if(!byId[id]) byId[id]=mkEl(id); return byId[id]; }, createElement(t){ return mkEl('<'+t+'>'); }, createDocumentFragment(){ return mkEl('#frag'); }, querySelector(s){ if(!byId[s]) byId[s]=mkEl(s); return byId[s]; }, addEventListener(){}, body:{classList:{add(){},remove(){}}} };
global.setTimeout = function(fn){ try { fn(); } catch(e){} };

// A CLEAN script and a script that trips the asserted-number guard (a percent is always blocked as a figure).
const HOOKS = { a:"Cold drinks should not be this hard", c:"Your freezer bags take up every inch", recovered:"Nobody warned you about the endless store runs" };
const CTAS = { a:"Grab yours before they sell out", c:"Order one for your kitchen today", recovered:"Tap the link and try it" };
function clean(tag){ return { hook:HOOKS[tag]||("Fresh ice on demand "+tag), body1:"You keep waiting around "+tag, preclose:"", body2:"You pour without a thought "+tag, cta:CTAS[tag]||("See it on shop "+tag) }; }
const BAD = { hook:"This cuts your ice waiting by 50 percent", body1:"You keep waiting on the tray", preclose:"", body2:"You pour without a thought", cta:"See it on the shop page" };
// Batch: slots 1 and 3 clean; slot 2 (index 1) trips the guard; slot 4 (index 3) trips the guard.
const BATCH = [ clean("a"), BAD, clean("c"), BAD ];
// Per-script rewrite behaviour, keyed by the "REGENERATE ONLY SCRIPT N" number in the prompt:
//   SCRIPT 2 -> still bad on the first rewrite, then CLEAN (recovers within the retry budget).
//   SCRIPT 4 -> bad on every rewrite (never recovers -> dropped once, named).
let seen = { 2:0, 4:0 };
const fetchStub = function(u, o){
  const content = JSON.parse(o.body).messages[0].content;
  const m = content.match(/REGENERATE ONLY SCRIPT (\d+)/);
  let payload;
  if (!m){ payload = JSON.stringify(BATCH); }               // the first batch call
  else {
    const n = m[1] | 0; seen[n] = (seen[n] | 0) + 1;
    if (n === 2) payload = JSON.stringify(seen[2] >= 2 ? clean("recovered") : BAD);   // clean on 2nd rewrite
    else payload = JSON.stringify(BAD);                                               // SCRIPT 4 never recovers
  }
  return Promise.resolve({ status:200, text(){ return Promise.resolve(JSON.stringify({ content:[{ type:'text', text: payload }] })); } });
};
const psCode = blocks.find(b => b.includes('window.ProductScreen ='));
const params = ['window','document','currentUser','sb','currentProductId','currentProductName','currentProduct','loadProductById','buildSelect','transcribeTikTokLink','claudeHeaders','showToast','fetch','console'];
const chain = { select(){ return chain; }, eq(){ return chain; }, update(){ return chain; }, insert(){ return chain; }, order(){ return { then(r){ r({data:[],error:null}); } }; }, single(){ return { then(r){ r({data:{id:'p1'},error:null}); } }; }, then(r){ r({data:{id:'p1'},error:null}); } };
new Function(...params, psCode)(win, document, {id:'u1'}, { from(){ return chain; } }, 'p1', 'Ice maker', {}, function(){}, function(){}, function(){ return Promise.resolve({}); }, function(){ return {}; }, function(){}, fetchStub, console);
const PS = win.ProductScreen;

let pass=0, fail=0; function ok(c,m){ if(c) pass++; else { fail++; console.log('  ✗ '+m); } }
let brief = SB.emptyBrief();
brief.meta.lastDerivedAt='2026-01-01'; brief.meta.reviewCount=12; brief.meta.classified=true;
brief.lines.pains = SB.normalizeBrief({lines:{pains:[{value:'ice runs out on RV trips', count:5, classified:true, about:'alternative'},{value:'the freezer has no room for bags', count:4, classified:true, about:'alternative'}]}}).lines.pains;
let raw = SB.emptyRaw(); raw.reviews=[{id:'r1',full:'great ice'}]; raw.description='Portable nugget ice maker. Makes 33 lbs a day.';
PS.fill({id:'p1', name:'Ice maker', updated_at:'2026-01-01', brief, raw});

(async () => {
  PS.generateScripts();
  for (let k=0;k<200;k++) await Promise.resolve();
  const status = (byId['genStatus'] && byId['genStatus'].textContent) || '';
  ok(seen[2] >= 2, 'the violating slot 2 was retried more than once (not dropped after a single miss): tries=' + seen[2]);
  ok(seen[4] >= 3, 'the never-clean slot 4 exhausted its retry budget before dropping: tries=' + seen[4]);
  function walk(el,a,d){ if(!el||d>12) return; (el._children||[]).forEach(function(c){ if(c.textContent) a.push(c.textContent); walk(c,a,d+1); }); }
  let t=[]; walk(byId['genScripts'], t, 0); const joined = t.join(' | ');
  ok(joined.indexOf('recovered') >= 0, 'the recoverable slot was regenerated clean and rendered (not lost)');
  ok(joined.indexOf('50 percent') < 0, 'no figure-inventing script reached the screen');
  ok(/3 of 4/.test(status) || /dropped/i.test(status), 'the one unrecoverable slot is named as a drop, not silently missing: "' + status.slice(0,90) + '"');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

// Phase 2-4 -- HOOK READ-BACK. After the batch, one model call reads the four hooks against a four-question
// rubric; a flagged hook is rewritten to its assignment (reusing genOnePrompt); a second read keeps the rewrite
// only if it now passes, else reverts to the original. It is fail-open (any error or unparseable reply -> drafts
// untouched) and never touches the guards. This proves: (1) a flagged hook is rewritten and the improved version
// renders, (2) an unparseable read leaves the batch untouched, (3) a rewrite that does not verify is reverted.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const win = {}; new Function('window', blocks.find(b => b.includes('window.SaxeBrief =')))(win); const SB = win.SaxeBrief;
function mkEl(id){ return { id:id||'', style:{cssText:'',display:'',color:''}, value:'', textContent:'', disabled:false, _children:[], classList:{add(){},remove(){}}, set innerHTML(v){ this._children=[]; this._html=v; }, get innerHTML(){ return this._html||''; }, appendChild(c){ this._children.push(c); return c; }, addEventListener(){}, focus(){}, click(){}, removeChild(){}, querySelector(){ return null; } }; }
const byId = {};
const document = { readyState:'complete', getElementById(id){ if(!byId[id]) byId[id]=mkEl(id); return byId[id]; }, createElement(t){ return mkEl('<'+t+'>'); }, createDocumentFragment(){ return mkEl('#frag'); }, querySelector(s){ if(!byId[s]) byId[s]=mkEl(s); return byId[s]; }, addEventListener(){}, body:{classList:{add(){},remove(){}}} };
global.setTimeout = function(fn){ try { fn(); } catch(e){} };

// Four clean, guard-passing scripts; script 2 (index 1) opens on a deliberately WEAK hook. Distinct body1 and CTA
// openings so the repetition guard never fires.
const BATCH = [
  { hook:"Cold drinks should not be this hard",            body1:"Mornings you scramble for something cold", preclose:"", body2:"You pour a glass and move on",   cta:"Grab yours today" },
  { hook:"WEAKHOOK floating fragments with no subject",    body1:"The afternoon slump hits you hard",         preclose:"", body2:"You feel good again",             cta:"Check it out on shop" },
  { hook:"Your freezer is packed and still nothing to sip",body1:"You open the door and just sigh",           preclose:"", body2:"Now there is always one ready",   cta:"See it on the shop page" },
  { hook:"Nobody warned you how fast the day drains you",  body1:"By three you are already dragging",          preclose:"", body2:"One sip and you reset",           cta:"Tap to try it" }
];
const IMPROVED = { hook:"IMPROVEDHOOK that lands as one clear thought", body1:"The afternoon slump hits and you reach for it", preclose:"", body2:"You feel good again", cta:"Check it out on shop" };
const STILLBAD = { hook:"STILLBADHOOK the rewrite that never verified", body1:"The afternoon slump hits and you reach for it", preclose:"", body2:"You feel good again", cta:"Check it out on shop" };

// MODE: 'happy' (flag 2, rewrite improves, pass-2 verifies) | 'junk' (reader reply is not JSON -> fail-open) |
// 'revert' (flag 2, rewrite still bad, pass-2 fails it -> revert to the original weak hook).
let MODE = 'happy';
let readCount = 0, rewrite2 = 0;
function reply(obj){ return { status:200, text(){ return Promise.resolve(JSON.stringify({ content:[{ type:'text', text: (typeof obj === 'string' ? obj : JSON.stringify(obj)) }] })); } }; }
const fetchStub = function(u, o){
  const content = JSON.parse(o.body).messages[0].content;
  const rw = content.match(/REGENERATE ONLY SCRIPT (\d+)/);
  if (content.indexOf('HOOK READ-BACK') >= 0){
    readCount++;
    if (MODE === 'junk') return Promise.resolve(reply("the model declined to answer"));   // not a JSON array -> fail-open
    if (readCount === 1) return Promise.resolve(reply([{i:1,pass:true},{i:2,pass:false,fix:"make it one clear thought with a subject"},{i:3,pass:true},{i:4,pass:true}]));
    // second read (verify): happy -> script 2 now passes; revert -> script 2 still fails
    if (MODE === 'revert') return Promise.resolve(reply([{i:1,pass:true},{i:2,pass:false,fix:"still weak"},{i:3,pass:true},{i:4,pass:true}]));
    return Promise.resolve(reply([{i:1,pass:true},{i:2,pass:true},{i:3,pass:true},{i:4,pass:true}]));
  }
  if (rw){ const n = rw[1] | 0; if (n === 2) rewrite2++; return Promise.resolve(reply(MODE === 'revert' ? STILLBAD : IMPROVED)); }
  return Promise.resolve(reply(BATCH));   // the batch call
};
const psCode = blocks.find(b => b.includes('window.ProductScreen ='));
const params = ['window','document','currentUser','sb','currentProductId','currentProductName','currentProduct','loadProductById','buildSelect','transcribeTikTokLink','claudeHeaders','showToast','fetch','console'];
const chain = { select(){ return chain; }, eq(){ return chain; }, update(){ return chain; }, insert(){ return chain; }, order(){ return { then(r){ r({data:[],error:null}); } }; }, single(){ return { then(r){ r({data:{id:'p1'},error:null}); } }; }, then(r){ r({data:{id:'p1'},error:null}); } };
// This suite exercises the CURRENT engine with FULL guards -- pin them (the app default is now minimal/liability).
global.localStorage = { getItem(k){ return k === 'saxe_engine' ? 'current' : k === 'saxe_guards' ? 'full' : k === 'saxe_minimal_model' ? 'haiku' : null; }, setItem(){} };
new Function(...params, psCode)(win, document, {id:'u1'}, { from(){ return chain; } }, 'p1', 'Ice maker', {}, function(){}, function(){}, function(){ return Promise.resolve({}); }, function(){ return {}; }, function(){}, fetchStub, console);
const PS = win.ProductScreen;

let pass=0, fail=0; function ok(c,m){ if(c) pass++; else { fail++; console.log('  ✗ '+m); } }
function freshBrief(){ let b = SB.emptyBrief(); b.meta.lastDerivedAt='2026-01-01'; b.meta.reviewCount=12; b.meta.classified=true;
  b.lines.pains = SB.normalizeBrief({lines:{pains:[{value:'ice runs out on trips', count:5, classified:true, about:'alternative'}]}}).lines.pains; return b; }
let raw = SB.emptyRaw(); raw.reviews=[{id:'r1',full:'great ice'}]; raw.description='Portable nugget ice maker. Makes 33 lbs a day.';
function walk(el,a,d){ if(!el||d>12) return; (el._children||[]).forEach(function(c){ if(c.textContent||c.value) a.push(c.textContent||c.value); walk(c,a,d+1); }); }
async function run(mode){
  MODE = mode; readCount = 0; rewrite2 = 0;
  if (byId['genScripts']) byId['genScripts']._children = [];
  if (byId['genStatus']) byId['genStatus'].textContent = '';
  PS.fill({id:'p1', name:'Ice maker', updated_at:'2026-01-01', brief:freshBrief(), raw});
  PS.generateScripts();
  for (let k=0;k<400;k++) await Promise.resolve();
  let t=[]; walk(byId['genScripts'], t, 0); return t.join(' | ');
}

(async () => {
  // 1. HAPPY: the reader flags the weak hook, it is rewritten, the second read verifies it, and the IMPROVED hook
  //    reaches the screen -- the weak original is gone. The other three hooks are untouched.
  const h = await run('happy');
  ok(readCount >= 2, 'the read-back ran and then re-read the rewrite (two reader passes): reads=' + readCount);
  ok(rewrite2 === 1, 'exactly the flagged hook (script 2) was rewritten once: rewrites=' + rewrite2);
  ok(h.indexOf('IMPROVEDHOOK that lands as one clear thought') >= 0, 'the sharpened hook reaches the screen');
  ok(h.indexOf('WEAKHOOK floating fragments with no subject') < 0, 'the weak original hook is gone once the rewrite verified');
  ok(h.indexOf('Cold drinks should not be this hard') >= 0 && h.indexOf('Nobody warned you how fast the day drains you') >= 0, 'the hooks the reader passed are left untouched');

  // 2. JUNK: the reader reply is not a JSON array. Fail-open -- the batch passes through untouched and the original
  //    (weak) hook still renders. Generation behaves exactly as before the read-back.
  const j = await run('junk');
  ok(j.indexOf('WEAKHOOK floating fragments with no subject') >= 0, 'an unparseable read leaves the batch untouched (fail-open)');
  ok(rewrite2 === 0, 'no rewrite fires when the read cannot be parsed');

  // 3. REVERT: the flagged hook is rewritten but the second read still fails it -> revert to the original. A
  //    rewrite can never ship a hook the reader would not pass; the un-verified rewrite is discarded.
  const r = await run('revert');
  ok(r.indexOf('STILLBADHOOK the rewrite that never verified') < 0, 'a rewrite that does not verify is never shown');
  ok(r.indexOf('WEAKHOOK floating fragments with no subject') >= 0, 'the original hook is restored when the rewrite fails the second read');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

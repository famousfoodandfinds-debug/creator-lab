// GUARDS toggle: Full vs Liability-only. In liability-only mode only health-claim, moderation, and price (and
// the technical no-content case) drop a script; every other guard becomes a NOTE on the rendered script instead
// of removing it. This proves: (1) in liability-only mode a figure violation is kept, rendered, and annotated;
// (2) a health claim still drops even in liability-only mode; (3) in full mode both are dropped as before.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
function mkEl(id){ return { id:id||'', style:{cssText:'',display:'',color:''}, value:'', textContent:'', disabled:false, _children:[], classList:{add(){},remove(){}}, set innerHTML(v){ this._children=[]; this._html=v; }, get innerHTML(){ return this._html||''; }, appendChild(c){ this._children.push(c); return c; }, addEventListener(){}, focus(){}, click(){}, removeChild(){}, querySelector(){ return null; } }; }
global.setTimeout = function(fn){ try { fn(); } catch(e){} };

const psCode = blocks.find(b => b.includes('window.ProductScreen ='));
const params = ['window','document','currentUser','sb','currentProductId','currentProductName','currentProduct','loadProductById','buildSelect','transcribeTikTokLink','claudeHeaders','showToast','fetch','console'];
const chain = { select(){ return chain; }, eq(){ return chain; }, update(){ return chain; }, insert(){ return chain; }, order(){ return { then(r){ r({data:[],error:null}); } }; }, single(){ return { then(r){ r({data:{id:'p1'},error:null}); } }; }, then(r){ r({data:{id:'p1'},error:null}); } };

// S1/S4 clean; S2 trips asserted-number (a percent -- NOT a liability guard); S3 trips health-claim (a liability
// guard). Distinct openings so the repetition guard never fires.
const S1 = { hook:"Cold drinks should not be this hard",         body1:"Mornings you scramble for something cold", preclose:"", body2:"You pour a glass and move on", cta:"Grab yours today" };
const S2 = { hook:"This cuts your ice waiting by 50 percent",    body1:"Every tray drips before it freezes",       preclose:"", body2:"You pour without a thought",   cta:"See it on the shop page" };
const S3 = { hook:"Metal flakes are scraping into your food",    body1:"Your old pan sheds with every scrub",       preclose:"", body2:"This one never does",          cta:"Check it out today" };
const S4 = { hook:"Nobody warned you about the endless store runs", body1:"The runs to the store never end",        preclose:"", body2:"Now the ice is always ready",  cta:"Tap the link to try it" };
const BATCH = [S1, S2, S3, S4];

function harness(guards){
  const win = {}; new Function('window', blocks.find(b => b.includes('window.SaxeBrief =')))(win); const SB = win.SaxeBrief;
  const byId = {};
  const document = { readyState:'complete', getElementById(id){ if(!byId[id]) byId[id]=mkEl(id); return byId[id]; }, createElement(t){ return mkEl('<'+t+'>'); }, createDocumentFragment(){ return mkEl('#frag'); }, querySelector(s){ if(!byId[s]) byId[s]=mkEl(s); return byId[s]; }, addEventListener(){}, body:{classList:{add(){},remove(){}}} };
  function reply(obj){ return { status:200, text(){ return Promise.resolve(JSON.stringify({ content:[{ type:'text', text:(typeof obj==='string'?obj:JSON.stringify(obj)) }] })); } }; }
  const fetchStub = function(u, o){
    const content = JSON.parse(o.body).messages[0].content;
    if (content.indexOf('HOOK READ-BACK') >= 0) return Promise.resolve(reply([{i:1,pass:true},{i:2,pass:true},{i:3,pass:true},{i:4,pass:true}]));
    const rw = content.match(/REGENERATE ONLY SCRIPT (\d+)/);
    if (rw){ const n = rw[1]|0; return Promise.resolve(reply(BATCH[n-1])); }   // never recovers -> the blocking ones drop
    return Promise.resolve(reply(BATCH));
  };
  global.localStorage = { getItem(k){ return k === 'saxe_guards' ? guards : 'current'; }, setItem(){} };
  new Function(...params, psCode)(win, document, {id:'u1'}, { from(){ return chain; } }, 'p1', 'Ice maker', {}, function(){}, function(){}, function(){ return Promise.resolve({}); }, function(){ return {}; }, function(){}, fetchStub, console);
  function freshBrief(){ let b = SB.emptyBrief(); b.meta.lastDerivedAt='2026-01-01'; b.meta.reviewCount=12; b.meta.classified=true;
    b.lines.pains = SB.normalizeBrief({lines:{pains:[{value:'ice runs out on trips', count:5, classified:true, about:'alternative'}]}}).lines.pains; return b; }
  let raw = SB.emptyRaw(); raw.reviews=[{id:'r1',full:'great ice'}]; raw.description='Portable nugget ice maker. Makes 33 lbs a day.';
  return { byId, SB, freshBrief, raw, PS: win.ProductScreen };
}
function walk(el,a,d){ if(!el||d>12) return; (el._children||[]).forEach(function(c){ if(c.textContent||c.value) a.push(c.textContent||c.value); walk(c,a,d+1); }); }
let pass=0, fail=0; function ok(c,m){ if(c) pass++; else { fail++; console.log('  ✗ '+m); } }
async function run(h){
  h.PS.fill({id:'p1', name:'Ice maker', updated_at:'2026-01-01', brief:h.freshBrief(), raw:h.raw});
  h.PS.generateScripts();
  for (let k=0;k<400;k++) await Promise.resolve();
  let t=[]; walk(h.byId['genScripts'], t, 0);
  return { text:t.join(' | '), status:(h.byId['genStatus']&&h.byId['genStatus'].textContent)||'' };
}

(async () => {
  // 1. LIABILITY-ONLY: the figure script is KEPT with a note; the health script still DROPS.
  const Lib = await run(harness('liability'));
  ok(Lib.text.indexOf('This cuts your ice waiting by 50 percent') >= 0, 'liability-only: the figure script is rendered, not dropped');
  ok(/Guard notes \(liability-only\): unverifiable figure \('50 percent'\)/.test(Lib.text), 'liability-only: the kept script carries a guard note naming the figure');
  ok(Lib.text.indexOf('Metal flakes are scraping into your food') < 0, 'liability-only: a HEALTH claim still drops (never rendered)');
  ok(/liability-only guards/.test(Lib.status), 'the status marks the run as liability-only');
  ok(/3 of 4/.test(Lib.status) && /Script 3: manufactured health/.test(Lib.status), 'liability-only: three kept, the health script named as the one drop: "' + Lib.status.slice(0,120) + '"');

  // 2. FULL (default): both the figure and the health script drop, and no notes are shown.
  const Full = await run(harness('full'));
  ok(Full.text.indexOf('This cuts your ice waiting by 50 percent') < 0, 'full guards: the figure script is dropped (as before)');
  ok(Full.text.indexOf('Metal flakes are scraping into your food') < 0, 'full guards: the health script is dropped');
  ok(Full.text.indexOf('Guard notes') < 0, 'full guards: no guard-note banner is shown');
  ok(/2 of 4/.test(Full.status), 'full guards: two dropped, two kept: "' + Full.status.slice(0,120) + '"');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

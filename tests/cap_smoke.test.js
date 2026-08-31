// Client side of the monthly cap: the Generate batch call must be TAGGED so the server can count it as one
// batch (call_name "script_batch" + a generation_id), and a 429 from the cap must show the member-facing block
// message (library/Planner stay open, resets on the 1st) -- never a generic "try again". Drives the real
// ProductScreen block with a stubbed fetch, same isolation as the browser.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const win = {}; new Function('window', blocks.find(b => b.includes('window.SaxeBrief =')))(win); const SB = win.SaxeBrief;
function mkEl(id){ return { id:id||'', style:{cssText:'',display:'',color:''}, value:'', textContent:'', disabled:false, _children:[], classList:{add(){},remove(){}}, set innerHTML(v){ this._children=[]; this._html=v; }, get innerHTML(){ return this._html||''; }, appendChild(c){ this._children.push(c); return c; }, addEventListener(){}, focus(){}, click(){}, removeChild(){}, querySelector(){ return null; } }; }
const byId = {};
const document = { readyState:'complete', getElementById(id){ if(!byId[id]) byId[id]=mkEl(id); return byId[id]; }, createElement(t){ return mkEl('<'+t+'>'); }, createDocumentFragment(){ return mkEl('#frag'); }, querySelector(s){ if(!byId[s]) byId[s]=mkEl(s); return byId[s]; }, addEventListener(){}, body:{classList:{add(){},remove(){}}} };
global.setTimeout = function(fn){ try { fn(); } catch(e){} };

const SCRIPTS = [
  { hook:"Your drink deserves better", body1:"You keep chewing weak cubes", preclose:"", body2:"You pour without a thought", cta:"Grab yours before they go" },
  { hook:"The ice runs out too fast", body1:"You refill the tray again", preclose:"", body2:"You host without worry", cta:"Tap the link to try it" },
  { hook:"The freezer tray cannot keep up", body1:"You wait for a slow refill", preclose:"", body2:"Your counter stays clear", cta:"Check it out right here" },
  { hook:"Cold drinks should be easy", body1:"You dread the empty tray", preclose:"", body2:"You enjoy the crunch now", cta:"See it on the shop page" }
];
let mode = "ok";             // "ok" -> normal batch; "limit" -> 429 monthly cap
let batchBody = null;        // the captured script-batch call body
let regenIds = [];           // generation_ids seen on regen (max_tokens 1500) calls
function resp(status, text){ return { status, text: function(){ return Promise.resolve(text); } }; }
const fetchStub = function(url, opts){
  let body = {}; try { body = JSON.parse(opts.body); } catch(e){}
  if (body.count_only) return Promise.resolve(resp(200, JSON.stringify({ ok:true, used:6, limit:7, remaining:1 }))); // limit 7 (not 150) proves copy reads the EFFECTIVE limit; remaining 1 exercises the singular warning
  if (body.call_name === "script_batch" && body.max_tokens >= 4000 && !batchBody) batchBody = body;
  if (body.call_name === "script_batch" && body.max_tokens < 4000) regenIds.push(body.generation_id);
  if (mode === "limit") return Promise.resolve(resp(429, JSON.stringify({ error:"monthly_limit_reached", message:"blocked", used:150, limit:150 })));
  return Promise.resolve(resp(200, JSON.stringify({ content:[{ type:"text", text: JSON.stringify(SCRIPTS) }] })));
};
const psCode = blocks.find(b => b.includes('window.ProductScreen ='));
const params = ['window','document','currentUser','sb','currentProductId','currentProductName','currentProduct','loadProductById','buildSelect','transcribeTikTokLink','claudeHeaders','showToast','fetch','console'];
const chain = { select(){ return chain; }, eq(){ return chain; }, update(){ return chain; }, insert(){ return chain; }, order(){ return { then(r){ r({data:[],error:null}); } }; }, single(){ return { then(r){ r({data:{id:'p1'},error:null}); } }; }, then(r){ r({data:{id:'p1'},error:null}); } };
// This suite exercises the CURRENT engine with FULL guards -- pin them (the app default is now minimal/liability).
global.localStorage = { getItem(k){ return k === 'saxe_engine' ? 'current' : k === 'saxe_guards' ? 'full' : k === 'saxe_minimal_model' ? 'haiku' : null; }, setItem(){} };
new Function(...params, psCode)(win, document, {id:'u1'}, { from(){ return chain; } }, 'p1', 'Ice maker', {}, function(){}, function(){}, function(){ return Promise.resolve({}); }, function(){ return { 'Content-Type':'application/json' }; }, function(){}, fetchStub, console);
const PS = win.ProductScreen;

let pass=0, fail=0; function ok(c,m){ if(c) pass++; else { fail++; console.log('  ✗ '+m); } }
let brief = SB.emptyBrief();
brief.meta.lastDerivedAt = '2026-01-01'; brief.meta.reviewCount = 12; brief.meta.classified = true;
brief.lines.pains = SB.normalizeBrief({lines:{pains:[{value:'ice runs out too fast', count:5, classified:true}]}}).lines.pains;
let raw = SB.emptyRaw(); raw.reviews = [{ id:'r1', full:'great ice' }];
PS.fill({ id:'p1', name:'Ice maker', updated_at:'2026-01-01', brief, raw });

function walk(el, a, d){ if(!el||d>12) return; (el._children||[]).forEach(function(c){ if(c.textContent||c.value) a.push(c.textContent||c.value); walk(c, a, d+1); }); }
(async () => {
  // Let the initial count fetch (remaining 1) resolve and render, so the SINGULAR warning is checked.
  for (let k=0;k<60;k++) await Promise.resolve();
  let pre=[]; walk(byId['genScripts'], pre, 0); const preJoined = pre.join(' | ');
  ok(/Only 1 generation left this month/.test(preJoined), 'the warning is singular at 1 left: "1 generation", not "1 generations"');
  ok(!/1 generations left/.test(preJoined), 'no plural "1 generations" bug in the warning');

  PS.generateScripts();
  for (let k=0;k<120;k++) await Promise.resolve();
  ok(!!batchBody, 'the batch call was made');
  ok(batchBody && batchBody.call_name === 'script_batch', 'the batch call is tagged call_name "script_batch" so the cap can count it');
  ok(batchBody && typeof batchBody.generation_id === 'string' && batchBody.generation_id.length > 0, 'the batch carries a generation_id (one per press of Generate)');
  ok(regenIds.every(function(id){ return id === (batchBody && batchBody.generation_id); }), 'any guard-retry rides the SAME generation_id (never counts as a new batch)');
  const okStatus = (byId['genStatus'] && byId['genStatus'].textContent) || '';
  ok(okStatus.indexOf('from your brief') >= 0, 'a normal batch renders its success status');

  // Now the cap blocks: a 429 must show the member-facing wall, not a generic failure.
  mode = "limit";
  PS.generateScripts();
  for (let k=0;k<120;k++) await Promise.resolve();
  const blockStatus = (byId['genStatus'] && byId['genStatus'].textContent) || '';
  ok(/all 7 generations this month/.test(blockStatus), 'the 429 block cites the EFFECTIVE limit from the server (7), not a hardcoded 150: "' + blockStatus.slice(0,80) + '"');
  ok(!/150/.test(blockStatus), 'the block message never shows a stale hardcoded 150');
  ok(/library and Planner stay open/.test(blockStatus) && /resets? on the 1st/i.test(blockStatus), 'the block copy keeps library/Planner open and says it resets on the 1st');
  ok(!/try again|hit an error/i.test(blockStatus), 'the 429 is NOT shown as a generic failure');
  // At the wall: the button is reworded/disabled, and the block message is NOT stacked twice.
  let atl=[]; walk(byId['genScripts'], atl, 0); const atlJoined = atl.join(' | ');
  ok(/Monthly limit reached/.test(atlJoined), 'the Generate button is reworded to "Monthly limit reached" at the wall, not "Generate again"');
  ok((atlJoined.match(/all 7 generations this month/g) || []).length === 0, 'the block message is not duplicated as a warning line (genStatus owns it, so it renders once)');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

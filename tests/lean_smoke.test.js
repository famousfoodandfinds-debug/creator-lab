// LEAN ENGINE. A second engine behind the Current/Lean toggle: minimal instruction built on the copywriting
// checklist as a writing framework, the model chooses the four buyers and what to leave out, then the SAME guards
// + hook read-back run, plus a lean-only buyer/grounding check. This proves: (1) the toggle routes to the lean
// prompt when Lean and the current prompt when Current, (2) the buyer/grounding check flags a colliding or
// ungrounded script and rewrites it, and (3) the check is fail-open when its reply cannot be parsed.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
function mkEl(id){ return { id:id||'', style:{cssText:'',display:'',color:''}, value:'', textContent:'', disabled:false, _children:[], classList:{add(){},remove(){}}, set innerHTML(v){ this._children=[]; this._html=v; }, get innerHTML(){ return this._html||''; }, appendChild(c){ this._children.push(c); return c; }, addEventListener(){}, focus(){}, click(){}, removeChild(){}, querySelector(){ return null; } }; }
global.setTimeout = function(fn){ try { fn(); } catch(e){} };

const psCode = blocks.find(b => b.includes('window.ProductScreen ='));
const params = ['window','document','currentUser','sb','currentProductId','currentProductName','currentProduct','loadProductById','buildSelect','transcribeTikTokLink','claudeHeaders','showToast','fetch','console'];
const chain = { select(){ return chain; }, eq(){ return chain; }, update(){ return chain; }, insert(){ return chain; }, order(){ return { then(r){ r({data:[],error:null}); } }; }, single(){ return { then(r){ r({data:{id:'p1'},error:null}); } }; }, then(r){ r({data:{id:'p1'},error:null}); } };

// Four clean, guard-passing scripts (distinct hooks/body1/cta so the repetition guard never fires).
const BATCH = [
  { hook:"Cold drinks should not be this hard",         body1:"Mornings you scramble for something cold", preclose:"", body2:"You pour a glass and move on",   cta:"Grab yours today" },
  { hook:"You keep pulling the basket out to check",    body1:"Check it. Nope. Push it back in.",         preclose:"", body2:"Now you just glance and know",    cta:"Check it out on shop" },
  { hook:"It is just the both of you most nights now",  body1:"You heat a whole oven for barely anything", preclose:"", body2:"You cook only what you need",     cta:"See it on the shop page" },
  { hook:"Cooking is fine, the dishes are the problem", body1:"Pan, then a plate, then a container",       preclose:"", body2:"You cook, serve, and store in one",cta:"Tap to try it" }
];
const REWORK2 = { hook:"A DIFFERENTBUYER angle for the second script", body1:"One fresh setup here", preclose:"", body2:"One fresh payoff line", cta:"Grab it now" };
const REWORK3 = { hook:"A GROUNDEDREASON angle for the third script",  body1:"Another separate setup", preclose:"", body2:"Another separate payoff", cta:"See it here" };

// One shared harness factory: its own window/doc/byId so the lean and current instances never share DOM state.
function harness(engine){
  const win = {}; new Function('window', blocks.find(b => b.includes('window.SaxeBrief =')))(win); const SB = win.SaxeBrief;
  const byId = {};
  const document = { readyState:'complete', getElementById(id){ if(!byId[id]) byId[id]=mkEl(id); return byId[id]; }, createElement(t){ return mkEl('<'+t+'>'); }, createDocumentFragment(){ return mkEl('#frag'); }, querySelector(s){ if(!byId[s]) byId[s]=mkEl(s); return byId[s]; }, addEventListener(){}, body:{classList:{add(){},remove(){}}} };
  const state = { captured:'', mode:'flag', buyerChecks:0, hookReads:0, regen:{} };
  function reply(obj){ return { status:200, text(){ return Promise.resolve(JSON.stringify({ content:[{ type:'text', text:(typeof obj==='string'?obj:JSON.stringify(obj)) }] })); } }; }
  const fetchStub = function(u, o){
    const content = JSON.parse(o.body).messages[0].content;
    if (!state.captured) state.captured = content;                                 // the batch prompt is the first call
    if (content.indexOf('BUYER + GROUNDING CHECK') >= 0){
      state.buyerChecks++;
      if (state.mode === 'junk') return Promise.resolve(reply("the check could not answer"));   // fail-open
      return Promise.resolve(reply([{i:1,keep:true},{i:2,keep:false,fix:"same buyer as script 1, make it different"},{i:3,keep:false,fix:"the empty-nester reason is not in the brief"},{i:4,keep:true}]));
    }
    if (content.indexOf('HOOK READ-BACK') >= 0){ state.hookReads++; return Promise.resolve(reply([{i:1,pass:true},{i:2,pass:true},{i:3,pass:true},{i:4,pass:true}])); }
    const rw = content.match(/REGENERATE ONLY SCRIPT (\d+)/);
    if (rw){ const n = rw[1]|0; state.regen[n] = (state.regen[n]|0)+1; return Promise.resolve(reply(n===2?REWORK2:(n===3?REWORK3:BATCH[n-1]))); }
    return Promise.resolve(reply(BATCH));
  };
  global.localStorage = { getItem(){ return engine; }, setItem(){} };
  new Function(...params, psCode)(win, document, {id:'u1'}, { from(){ return chain; } }, 'p1', 'Ninja Crispi Pro', {}, function(){}, function(){}, function(){ return Promise.resolve({}); }, function(){ return {}; }, function(){}, fetchStub, console);
  function freshBrief(){ let b = SB.emptyBrief(); b.meta.lastDerivedAt='2026-01-01'; b.meta.reviewCount=20; b.meta.classified=true;
    b.lines.pains = SB.normalizeBrief({lines:{pains:[{value:'pulling the basket out to check', count:6, classified:true, about:'alternative'},{value:'heating a whole oven for a small meal', count:4, classified:true, about:'alternative'}]}}).lines.pains; return b; }
  let raw = SB.emptyRaw(); raw.reviews=[{id:'r1',full:'love the glass'}]; raw.description='Ninja Crispi Pro. Glass bowls.';
  return { win, byId, state, SB, freshBrief, raw, PS: win.ProductScreen };
}
function walk(el,a,d){ if(!el||d>12) return; (el._children||[]).forEach(function(c){ if(c.textContent||c.value) a.push(c.textContent||c.value); walk(c,a,d+1); }); }

let pass=0, fail=0; function ok(c,m){ if(c) pass++; else { fail++; console.log('  ✗ '+m); } }
async function run(h, mode){
  h.state.captured=''; h.state.mode=mode; h.state.buyerChecks=0; h.state.regen={};
  if (h.byId['genScripts']) h.byId['genScripts']._children=[];
  if (h.byId['genStatus']) h.byId['genStatus'].textContent='';
  h.PS.fill({id:'p1', name:'Ninja Crispi Pro', updated_at:'2026-01-01', brief:h.freshBrief(), raw:h.raw});
  h.PS.generateScripts();
  for (let k=0;k<400;k++) await Promise.resolve();
  let t=[]; walk(h.byId['genScripts'], t, 0);
  return { text:t.join(' | '), status:(h.byId['genStatus']&&h.byId['genStatus'].textContent)||'', state:h.state };
}

(async () => {
  const L = harness('lean');

  // 1. ROUTING (lean): the toggle sends the batch to the LEAN prompt (framework markers present, current-path
  //    hook-rule markers absent).
  const r1 = await run(L, 'flag');
  ok(L.state.captured.indexOf('THE WRITING FRAMEWORK') >= 0 && L.state.captured.indexOf('TWIST THE KNIFE') >= 0, 'Lean toggle -> the batch uses the lean prompt (framework + twist-the-knife)');
  ok(L.state.captured.indexOf('CLIMB PAST THE FEATURE') >= 0 && L.state.captured.indexOf('NAME THE FEELING, NEVER THE CATEGORY') >= 0, 'the lean prompt carries the ladder and the name-the-feeling move');
  ok(L.state.captured.indexOf('FOUR DIFFERENT REASONS TO WATCH') < 0 && L.state.captured.indexOf('HOOK -- it must pass ALL') < 0, 'the current-path rule pile is NOT in the lean prompt');

  // 2. BUYER/GROUNDING CHECK: it ran, flagged the colliding script 2 and the ungrounded script 3, and rewrote
  //    BOTH via the lean rewrite -- the reworked buyers reach the screen.
  ok(r1.state.buyerChecks >= 1, 'the buyer + grounding check ran on the lean batch');
  ok(r1.state.regen[2] === 1 && r1.state.regen[3] === 1, 'both the colliding (2) and the ungrounded (3) scripts were rewritten once each');
  ok(r1.text.indexOf('DIFFERENTBUYER angle for the second script') >= 0, 'the colliding script was reworked to a different buyer and rendered');
  ok(r1.text.indexOf('GROUNDEDREASON angle for the third script') >= 0, 'the ungrounded script was reworked to a grounded reason and rendered');
  ok(r1.text.indexOf('It is just the two of you most nights now') < 0, 'the flagged original (ungrounded script 3) is gone once reworked');

  // 3. FAIL-OPEN: when the check reply cannot be parsed, no rewrite fires and the original batch passes through.
  const r2 = await run(L, 'junk');
  ok(!r2.state.regen[2] && !r2.state.regen[3], 'an unparseable check triggers no rewrites (fail-open)');
  ok(r2.text.indexOf('It is just the both of you most nights now') >= 0, 'the original scripts pass through untouched when the check cannot be parsed');

  // 4. ROUTING (current): the same toggle set to Current sends the batch to the CURRENT prompt, and the lean
  //    buyer/grounding check never runs.
  const C = harness('current');
  const r3 = await run(C, 'flag');
  ok(C.state.captured.indexOf('THE WRITING FRAMEWORK') < 0 && (C.state.captured.indexOf('HOOK -- it must pass ALL') >= 0 || C.state.captured.indexOf('FOUR DIFFERENT REASONS TO WATCH') >= 0), 'Current toggle -> the batch uses the current prompt, not the lean one');
  ok(r3.state.buyerChecks === 0, 'the lean buyer/grounding check never runs on the current path');

  // 5. PAIN vs DESIRE: the lean prompt lets the model decide the shape from the brief, and does not force pain.
  ok(/SELLS ON -- PAIN or DESIRE/.test(L.state.captured) && /IF DESIRE-LED/.test(L.state.captured) && /IF PAIN-LED/.test(L.state.captured), 'the lean prompt presents both pain-led and desire-led shapes and asks the model to decide');
  ok(/NAME THE FEELING, NEVER THE CATEGORY/.test(L.state.captured), 'the never-name-the-audience rule survives');

  // 6. PROFILE WIRING: with the voice + audience profile functions present, their output is injected into the lean
  //    prompt; with them absent (as in the routing runs above) nothing is injected -- a guaranteed no-op.
  ok(L.state.captured.indexOf('CREATOR VOICE PROFILE') < 0 && L.state.captured.indexOf('WHO ACTUALLY BUYS THIS') < 0, 'no profile wired -> no profile text in the prompt (fail-safe no-op)');
  global.getVoiceProfileNote = function(){ return ' CREATOR VOICE PROFILE -- calm and understated | short clipped fragments.'; };
  global.audienceTargetingNote = function(){ return 'WHO ACTUALLY BUYS THIS: 68% female; age 53% 45-54. NEVER name the age, gender, or life stage in a script.'; };
  const P = harness('lean');
  await run(P, 'flag');
  ok(P.state.captured.indexOf('CREATOR VOICE PROFILE') >= 0, 'the creator voice profile reaches the lean prompt when present');
  ok(P.state.captured.indexOf('WHO ACTUALLY BUYS THIS') >= 0 && /NEVER name the age, gender, or life stage/.test(P.state.captured), 'the buyer demographic reaches the lean prompt, carrying its never-name rule');

  // 7. MINIMAL engine: the one-sentence prompt (brief + profile + liability floor, nothing else), and NO
  //    post-generation rewriting -- no hook read-back, no buyer/grounding check. The profile still wires in.
  const M = harness('minimal');
  const rm = await run(M, 'flag');
  ok(/Structure each as hook, setup, payoff, call to action/.test(M.state.captured), 'minimal -> the one-sentence minimal prompt');
  ok(/First, name \d+ DIFFERENT buyers for this product from the brief/.test(M.state.captured) && /write ONE script to each buyer/.test(M.state.captured), 'minimal names the buyers FIRST, then writes one script to each (the only added instruction)');
  ok(M.state.captured.indexOf('THE WRITING FRAMEWORK') < 0 && M.state.captured.indexOf('SELLS ON -- PAIN or DESIRE') < 0 && M.state.captured.indexOf('HOOK -- it must pass ALL') < 0, 'minimal is not lean or current: none of their spec headers are present');
  ok(/Here is a copywriting framework\. Use whichever of these moves fit the buyer/.test(M.state.captured) && /Not all of them belong in every script/.test(M.state.captured), 'the checklist is included as REFERENCE (use whichever fit, not all belong), not as a specification');
  ok(M.state.captured.indexOf('WORSE ALTERNATIVES') >= 0 && M.state.captured.indexOf('TWISTING THE KNIFE') >= 0, 'the checklist moves are present as reference material, in the owner\'s own wording');
  ok(/The brief below is research, written in research language\. Never repeat its phrasing/.test(M.state.captured), 'minimal tells the model to translate the brief, never repeat its research phrasing');
  ok(M.state.captured.indexOf('CREATOR VOICE PROFILE') >= 0 && M.state.captured.indexOf('WHO ACTUALLY BUYS THIS') >= 0, 'the voice + audience profile still reach the minimal prompt');
  ok(rm.state.buyerChecks === 0, 'minimal runs NO buyer/grounding check');
  ok(rm.state.hookReads === 0, 'minimal runs NO hook read-back (zero post-generation rewriting)');
  ok(rm.text.indexOf('Cold drinks should not be this hard') >= 0, 'minimal output still passes through the guards and renders');
  delete global.getVoiceProfileNote; delete global.audienceTargetingNote;

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

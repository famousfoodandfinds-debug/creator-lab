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
global.system = 'SYSTEMPROMPTMARKER';   // stand-in for the ~16.6k-token system prompt current/lean send and minimal must not
let FAIL_NEXT = false;                   // when true, the next batch call returns a technical failure (timeout)

const psCode = blocks.find(b => b.includes('window.ProductScreen ='));
const params = ['window','document','currentUser','sb','currentProductId','currentProductName','currentProduct','loadProductById','buildSelect','transcribeTikTokLink','claudeHeaders','showToast','fetch','console'];
const chain = { select(){ return chain; }, eq(){ return chain; }, update(){ return chain; }, insert(){ return chain; }, order(){ return { then(r){ r({data:[],error:null}); } }; }, single(){ return { then(r){ r({data:{id:'p1'},error:null}); } }; }, then(r){ r({data:{id:'p1'},error:null}); } };

// Four clean, guard-passing scripts (distinct hooks/body1/cta so the repetition guard never fires).
const BATCH = [
  { angle:"STRIPPEDHEADER", buyer:"x", coreDesire:"y", featureProof:"z", doNotDiscuss:"w", hook:"Cold drinks should not be this hard",         body1:"Mornings you scramble for something cold", preclose:"", body2:"You pour a glass and move on",   cta:"Grab yours today" },
  { hook:"You keep pulling the basket out to check",    body1:"Check it. Nope. Push it back in.",         preclose:"", body2:"Now you just glance and know",    cta:"Check it out on shop" },
  { hook:"It is just the both of you most nights now",  body1:"You heat a whole oven for barely anything", preclose:"", body2:"You cook only what you need",     cta:"See it on the shop page" },
  { hook:"Cooking is fine, the dishes are the problem", body1:"Pan, then a plate, then a container",       preclose:"", body2:"You cook, serve, and store in one",cta:"Tap to try it" }
];
// Minimal's two-step output: { hooks:[...], scripts:[...] }, returned only when MIN_OBJECT is on. Strategy fields
// (angle/doNotDiscuss) carry a STRIPPEDSTRAT marker that must not survive into the rendered card.
let MIN_OBJECT = false;
let MIN_SONNET = false;
let MIN_UNSET = false;   // when true, the minimal-model config is unset -> exercises the DEFAULT (now Sonnet)
const HAIKU = 'claude-haiku-4-5-20251001', SONNET = 'claude-sonnet-4-6';
const MINOBJ = { hooks:["HOOKONE lands massive","HOOKTWO finally sharp","HOOKTHREE oil slick by 3","HOOKFOUR bread aisle"], scripts:[
  { buyer:"b1", angle:"STRIPPEDSTRAT1", coreDesire:"d", featureProof:"f", doNotDiscuss:"STRIPPEDSTRAT1b", body1:"HOOKONE lands massive. You reach for it early", body2:"It just works", cta:"Grab it now" },
  { buyer:"b2", angle:"STRIPPEDSTRAT2", coreDesire:"d", featureProof:"f", doNotDiscuss:"STRIPPEDSTRAT2b", body1:"The counter is a mess", body2:"Now it is clear", cta:"See it here" },
  { buyer:"b3", angle:"STRIPPEDSTRAT3", coreDesire:"d", featureProof:"f", doNotDiscuss:"STRIPPEDSTRAT3b", body1:"Guests keep noticing", body2:"You feel proud", cta:"Check this out" },
  { buyer:"b4", angle:"STRIPPEDSTRAT4", coreDesire:"d", featureProof:"f", doNotDiscuss:"STRIPPEDSTRAT4b", body1:"You almost skipped it", body2:"So glad you did not", cta:"Tap to try it" }
]};
const REWORK2 = { hook:"A DIFFERENTBUYER angle for the second script", body1:"One fresh setup here", preclose:"", body2:"One fresh payoff line", cta:"Grab it now" };
const REWORK3 = { hook:"A GROUNDEDREASON angle for the third script",  body1:"Another separate setup", preclose:"", body2:"Another separate payoff", cta:"See it here" };

// One shared harness factory: its own window/doc/byId so the lean and current instances never share DOM state.
function harness(engine, userId){
  const win = {}; new Function('window', blocks.find(b => b.includes('window.SaxeBrief =')))(win); const SB = win.SaxeBrief;
  const byId = {};
  const document = { readyState:'complete', getElementById(id){ if(!byId[id]) byId[id]=mkEl(id); return byId[id]; }, createElement(t){ return mkEl('<'+t+'>'); }, createDocumentFragment(){ return mkEl('#frag'); }, querySelector(s){ if(!byId[s]) byId[s]=mkEl(s); return byId[s]; }, addEventListener(){}, body:{classList:{add(){},remove(){}}} };
  const state = { captured:'', batchModel:'', batchSystem:'__unset__', batchUrl:'', mode:'flag', buyerChecks:0, hookReads:0, regen:{} };
  function reply(obj){ return { status:200, text(){ return Promise.resolve(JSON.stringify({ content:[{ type:'text', text:(typeof obj==='string'?obj:JSON.stringify(obj)) }] })); } }; }
  // Streaming reply: the SSE Anthropic sends, chunked in two content_block_delta events so the client's reassembly
  // (accumulate text across deltas) is exercised, then message_stop.
  function streamReply(fullText){
    const enc = new TextEncoder(); const mid = Math.floor(fullText.length / 2);
    const lines = [fullText.slice(0, mid), fullText.slice(mid)].map(function(c){ return 'data: ' + JSON.stringify({ type:'content_block_delta', delta:{ type:'text_delta', text:c } }) + '\n'; });
    lines.push('data: ' + JSON.stringify({ type:'message_stop' }) + '\n');
    const stream = new ReadableStream({ start(controller){ lines.forEach(function(l){ controller.enqueue(enc.encode(l)); }); controller.close(); } });
    return { status:200, body: stream, text(){ return Promise.resolve(''); } };
  }
  const fetchStub = function(u, o){
    const body = JSON.parse(o.body); const content = body.messages[0].content;
    if (!state.captured){ state.captured = content; state.batchModel = body.model; state.batchSystem = body.system; state.batchUrl = u; }  // the batch prompt is the first call
    if (u && u.indexOf('/api/claude-stream') >= 0) return Promise.resolve(streamReply(JSON.stringify(MIN_OBJECT ? MINOBJ : BATCH)));   // the streaming endpoint (Minimal-on-Sonnet)
    if (FAIL_NEXT && content.indexOf('REGENERATE ONLY SCRIPT') < 0 && content.indexOf('HOOK READ-BACK') < 0 && content.indexOf('BUYER + GROUNDING CHECK') < 0){
      return Promise.resolve({ status:504, text(){ return Promise.resolve('inactivity timeout'); } });   // the batch times out
    }
    if (content.indexOf('BUYER + GROUNDING CHECK') >= 0){
      state.buyerChecks++;
      if (state.mode === 'junk') return Promise.resolve(reply("the check could not answer"));   // fail-open
      return Promise.resolve(reply([{i:1,keep:true},{i:2,keep:false,fix:"same buyer as script 1, make it different"},{i:3,keep:false,fix:"the empty-nester reason is not in the brief"},{i:4,keep:true}]));
    }
    if (content.indexOf('HOOK READ-BACK') >= 0){ state.hookReads++; return Promise.resolve(reply([{i:1,pass:true},{i:2,pass:true},{i:3,pass:true},{i:4,pass:true}])); }
    const rw = content.match(/REGENERATE ONLY SCRIPT (\d+)/);
    if (rw){ const n = rw[1]|0; state.regen[n] = (state.regen[n]|0)+1; return Promise.resolve(reply(n===2?REWORK2:(n===3?REWORK3:BATCH[n-1]))); }
    if (MIN_OBJECT && content.indexOf('write 4 HOOKS') >= 0) return Promise.resolve(reply(MINOBJ));   // minimal two-step batch
    return Promise.resolve(reply(BATCH));
  };
  global.localStorage = { getItem(k){ if (k === 'saxe_minimal_model') return MIN_UNSET ? null : (MIN_SONNET ? 'sonnet' : 'haiku'); return engine; }, setItem(){} };
  new Function(...params, psCode)(win, document, {id: userId || '261c4239-34bc-427e-9a4d-8b23d73ede47'}, { from(){ return chain; } }, 'p1', 'Ninja Crispi Pro', {}, function(){}, function(){}, function(){ return Promise.resolve({}); }, function(){ return {}; }, function(){}, fetchStub, console);
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
  ok(M.state.captured.indexOf('A hook is something a PERSON SAYS OUT LOUD') < 0, 'the descriptive hook instruction is gone (the description was narrowing the shape)');
  ok(/Here are hooks that have actually worked/.test(M.state.captured) && M.state.captured.indexOf('WOW, this is massive.') >= 0 && M.state.captured.indexOf('Do NOT copy them') >= 0, 'the hook is taught by a WIDE-RANGE set of examples, not a rule (do not copy them)');
  ok(M.state.captured.indexOf('CREATOR VOICE PROFILE') >= 0 && M.state.captured.indexOf('WHO ACTUALLY BUYS THIS') >= 0, 'the voice + audience profile still reach the minimal prompt');
  ok(rm.state.buyerChecks === 0, 'minimal runs NO buyer/grounding check');
  ok(rm.state.hookReads === 0, 'minimal runs NO hook read-back (zero post-generation rewriting)');
  ok(rm.text.indexOf('Cold drinks should not be this hard') >= 0, 'minimal output still passes through the guards and renders');
  ok(/Work in TWO steps/.test(M.state.captured) && /write 4 HOOKS/.test(M.state.captured) && /"hooks":\[/.test(M.state.captured) && /"scripts":\[/.test(M.state.captured), 'minimal writes ALL FOUR hooks FIRST, then the scripts (two-step {hooks, scripts} output)');
  ok(/never derive a hook from a script you have not written yet/.test(M.state.captured), 'the hook is written before the script, so it cannot become a summary of it');
  ok(/doNotDiscuss MUST be DIFFERENT from the others/.test(M.state.captured), "each script's DO NOT DISCUSS must differ, forcing a distinct leave-out choice");
  ok(rm.text.indexOf('STRIPPEDHEADER') < 0, 'the strategy header is a thinking step -- stripped by cleanScript, never rendered on the card');

  // Minimal's { hooks:[...], scripts:[...] } output: hook[i] is paired onto script[i], strategy fields stripped.
  MIN_OBJECT = true;
  const MO = harness('minimal');
  const rmo = await run(MO, 'flag');
  ok(rmo.text.indexOf('HOOKONE lands massive') >= 0 && rmo.text.indexOf('You reach for it early') >= 0, 'minimal pairs the first HOOK onto the first script and renders both');
  ok(rmo.text.indexOf('HOOKFOUR bread aisle') >= 0 && rmo.text.indexOf('You almost skipped it') >= 0, 'the fourth hook is paired onto the fourth script (order preserved)');
  ok(rmo.text.indexOf('STRIPPEDSTRAT') < 0, 'the per-script strategy fields (angle/doNotDiscuss) are stripped, never rendered');
  // The model echoed the hook as the first sentence of script 1's setup; the merge peels that one repeat so the
  // hook shows once (in the hook field), not twice (hook field + start of setup).
  ok((rmo.text.match(/HOOKONE lands massive/g) || []).length === 1, 'an echoed hook is de-duplicated: it appears once, not repeated at the top of the setup');
  ok(rmo.text.indexOf('You reach for it early') >= 0, 'the rest of the setup survives the de-duplication');
  MIN_OBJECT = false;

  // MODEL config: minimal defaults to Haiku; flipped to Sonnet it runs the minimal batch on Sonnet; Current and
  // Lean are never affected (always Haiku).
  ok(M.state.batchModel === HAIKU, 'minimal defaults to Haiku');
  ok(C.state.batchModel === HAIKU && P.state.batchModel === HAIKU, 'Current and Lean always run on Haiku');
  MIN_SONNET = true;
  const S = harness('minimal');
  const rs = await run(S, 'flag');
  ok(S.state.batchModel === SONNET, 'minimal flipped to Sonnet -> the minimal batch runs on Sonnet');
  ok(S.state.batchUrl === '/api/claude-stream', 'Minimal-on-Sonnet routes to the STREAMING endpoint');
  ok(M.state.batchUrl === '/api/claude' && C.state.batchUrl === '/api/claude' && P.state.batchUrl === '/api/claude', 'minimal-on-Haiku, Current and Lean all use the buffered /api/claude (never the stream)');
  ok(rs.text.indexOf('Cold drinks should not be this hard') >= 0, 'the streamed SSE is reassembled into the batch and rendered (client streaming branch works)');
  ok(/minimal engine, Sonnet/.test(rs.status), 'the status names the Sonnet run so batches are distinguishable');
  MIN_SONNET = false;
  const S2 = harness('minimal');
  await run(S2, 'flag');
  ok(S2.state.batchModel === HAIKU, 'flipping the config back returns minimal to Haiku (not a permanent switch)');

  // DEFAULT: with the config unset, minimal now defaults to Sonnet (and therefore the streaming endpoint).
  MIN_UNSET = true;
  const D = harness('minimal');
  await run(D, 'flag');
  ok(D.state.batchModel === SONNET && D.state.batchUrl === '/api/claude-stream', 'minimal DEFAULTS to Sonnet (via streaming) when the model config is unset');
  MIN_UNSET = false;
  ok(/NEVER cite or quote the reviews, and never attribute anything to an outside party/.test(M.state.captured), 'minimal floor bans citing reviews and attributing to an outside party ("one person said")');

  // NEW-MEMBER DEFAULTS: with NOTHING stored (engine, guards, and model keys all unset), a member lands on
  // Minimal + Sonnet (streaming) + liability-only guards -- the toggles still exist, they just are not the
  // thing a newcomer has to find. harness(null) returns null for every localStorage key, so the code defaults win.
  MIN_UNSET = true;
  const N = harness(null);
  const rn = await run(N, 'flag');
  MIN_UNSET = false;
  ok(/Work in TWO steps/.test(N.state.captured), 'default ENGINE is Minimal (the two-step minimal prompt is what gets sent)');
  ok(N.state.batchSystem === undefined, 'default engine is minimal -> no system prompt sent (the minimal tell)');
  ok(N.state.batchModel === SONNET && N.state.batchUrl === '/api/claude-stream', 'default MODEL is Sonnet, via the streaming endpoint');
  ok(/liability-only guards/.test(rn.status), 'default GUARDS are liability-only (the status names the mode)');
  // OWNER sees the controls (positive control): the engine + guards + model toggles render for the owner. N was
  // built with the owner id (harness default), so its rendered head carries the segmented toggles.
  ok(rn.text.indexOf('Guards: Full') >= 0 && rn.text.indexOf('Current') >= 0 && rn.text.indexOf('Lean') >= 0, 'OWNER: the engine + guards toggles are rendered');
  ok(rn.text.indexOf('Haiku') >= 0 && rn.text.indexOf('Sonnet') >= 0, 'OWNER: the model toggle is rendered (engine is minimal)');

  // OWNER GATE: a MEMBER (non-owner id) never sees the toggles and is forced onto the fixed config, even when a
  // stale localStorage says otherwise. localStorage here says engine=current, but applyOwnerGating overrides it.
  MIN_UNSET = true;
  const MEM = harness('current', 'member-not-the-owner');
  const rmem = await run(MEM, 'flag');
  MIN_UNSET = false;
  ok(/Work in TWO steps/.test(MEM.state.captured), 'MEMBER: forced onto Minimal even though localStorage says current');
  ok(MEM.state.batchModel === SONNET && MEM.state.batchUrl === '/api/claude-stream', 'MEMBER: forced onto Sonnet (streaming)');
  ok(/liability-only guards/.test(rmem.status), 'MEMBER: forced onto liability-only guards');
  ok(rmem.text.indexOf('Guards: Full') < 0 && rmem.text.indexOf('Current') < 0 && rmem.text.indexOf('Lean') < 0 && rmem.text.indexOf('Haiku') < 0, 'MEMBER: no engine/guards/model toggles are rendered');

  // SYSTEM PROMPT: minimal sends none (cuts the ~16.6k-token prefill that times Sonnet out); current & lean send it.
  ok(M.state.batchSystem === undefined, 'minimal sends NO system prompt (truly minimal; the prefill that blows the timeout is gone)');
  ok(C.state.batchSystem === 'SYSTEMPROMPTMARKER' && P.state.batchSystem === 'SYSTEMPROMPTMARKER', 'Current and Lean still send the system prompt (unchanged)');

  // STALE SCRIPTS: a technical failure (timeout) clears the previous batch instead of leaving it on screen.
  const F = harness('current');
  const f1 = await run(F, 'flag');
  ok(f1.text.indexOf('Cold drinks should not be this hard') >= 0, 'a successful generation renders its batch');
  FAIL_NEXT = true;
  const f2 = await run(F, 'flag');
  FAIL_NEXT = false;
  ok(f2.text.indexOf('Cold drinks should not be this hard') < 0, 'a failed generation CLEARS the previous batch -- no stale scripts left on screen');
  ok(/Generation failed/.test(f2.status) && /no new scripts were produced/.test(f2.status), 'the failure line says no new scripts were produced, not "nothing was lost"');
  delete global.getVoiceProfileNote; delete global.audienceTargetingNote;

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

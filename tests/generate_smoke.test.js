// Smoke test for the GENERATE path -- the one code path that matters most, and the one that 230 unit tests
// and a green preview did NOT cover when an undefined variable (`str is not defined`) crashed it on click.
// This loads the REAL ProductScreen block with the same scope isolation as the browser (SaxeBrief helpers
// stay private to their own block), fills a product, stubs the model call, and invokes generateScripts.
// If any variable on the sync setup path is undefined, the run never reaches the model call and this fails.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);

const sbCode = blocks.find(b => b.includes('window.SaxeBrief ='));
const win = {}; new Function('window', sbCode)(win);
const SB = win.SaxeBrief;

// Minimal stub DOM (same shape as the edit-UI smoke).
function mkEl(id){ return {
  id: id||'', style:{cssText:'', display:'', color:''}, value:'', textContent:'', title:'', type:'', disabled:false,
  _children:[], classList:{add(){},remove(){}},
  set innerHTML(v){ this._children = []; this._html = v; }, get innerHTML(){ return this._html||''; },
  appendChild(c){ this._children.push(c); return c; },
  addEventListener(){}, focus(){}, click(){}, removeChild(){}, querySelector(){ return null; },
}; }
const byId = {};
const document = {
  readyState: 'complete',
  getElementById(id){ if(!byId[id]) byId[id]=mkEl(id); return byId[id]; },
  createElement(tag){ return mkEl('<'+tag+'>'); },
  createDocumentFragment(){ return mkEl('#frag'); },
  querySelector(sel){ if(!byId[sel]) byId[sel]=mkEl(sel); return byId[sel]; },
  addEventListener(){}, body:{classList:{add(){},remove(){}}},
};
global.setTimeout = function(fn){ try { fn(); } catch(e){} };

// Four clean scripts. One asserts a LISTING figure ("33 pounds a day", listing says "33 lbs per 24 hours")
// to guard the provenance wiring bug end to end: it must be ACCEPTED, not dropped as an unverifiable figure.
const SCRIPTS = [
  { hook:"Your drink deserves better than this", body1:"You keep chewing weak hollow cubes", preclose:"The nugget ice is soft and craveable", body2:"It makes 33 pounds of ice a day", cta:"Grab yours before they go" },
  { hook:"Somehow the ice runs out too fast", body1:"You refill the tray again and again", preclose:"One tank keeps the glasses full", body2:"You host without a second thought", cta:"Tap the link to try it" },
  { hook:"The freezer tray can't keep up anymore", body1:"You wait around for a slow refill", preclose:"It tucks into a small corner", body2:"Your counter stays effortless now", cta:"Check it out right here" },
  { hook:"Cold drinks should not feel like work", body1:"You dread the empty freezer tray", preclose:"A quiet cycle and it is done", body2:"You enjoy the crunch now", cta:"See it on the shop page" }
];
let fetchCalls = 0, capturedPrompt = '';
const fetchStub = function(url, opts){
  fetchCalls++;
  try { if (!capturedPrompt) capturedPrompt = JSON.parse(opts.body).messages[0].content; } catch(e){}
  const payload = JSON.stringify({ content: [{ type:'text', text: JSON.stringify(SCRIPTS) }] });
  return Promise.resolve({ status: 200, text: function(){ return Promise.resolve(payload); } });
};

const psCode = blocks.find(b => b.includes('window.ProductScreen ='));
const params = ['window','document','currentUser','sb','currentProductId','currentProductName','currentProduct',
  'loadProductById','buildSelect','transcribeTikTokLink','claudeHeaders','showToast','fetch','console'];
const chain = { select(){ return chain; }, eq(){ return chain; }, update(){ return chain; }, insert(){ return chain; },
  order(){ return { then(res){ res({ data: [], error: null }); } }; },
  single(){ return { then(res){ res({ data: { id:'p1' }, error:null }); } }; },
  then(res){ res({ data:{ id:'p1' }, error:null }); } };
const sbMock = { from(){ return chain; } };
new Function(...params, psCode)(
  win, document, {id:'u1'}, sbMock,
  null, '', '', function(){}, function(){}, function(){ return Promise.resolve({}); }, function(){ return {}; }, function(){},
  fetchStub, console
);
const PS = win.ProductScreen;

let pass = 0, fail = 0; function ok(c,m){ if(c) pass++; else { fail++; console.log('  ✗ ' + m); } }
ok(typeof PS.generateScripts === 'function', 'generateScripts is exported for testing');

// A DERIVED brief WITH a listing (features carry the seller specs, as on the real product) so the provenance
// guard has a source of truth -- this is the case that was failing closed and dropping every figure.
let brief = SB.emptyBrief();
brief.meta.lastDerivedAt = '2026-01-01T00:00:00Z';
brief.meta.reviewCount = 12;
brief.lines.who = SB.normalizeBrief({lines:{who:{value:'people who host and always run out of ice'}}}).lines.who;
brief.lines.desire = SB.normalizeBrief({lines:{desire:{value:'never run dry mid-party'}}}).lines.desire;
brief.lines.pains = SB.normalizeBrief({lines:{pains:[{value:'ice runs out too fast', count:6, classified:true, about:'alternative', need:'convenience'}, {value:'the last cooler let it melt on a hot day', count:5, classified:true, about:'alternative', need:'safety'}, {value:'the first batch is watery', count:3, classified:true, about:'product', words:['cooler','melts']}]}}).lines.pains;
// words are added so the objections THREAD-FIT the scenarios (assignment is now by fit, not position):
// "too small" carries ice/runs to fit the "ice runs out" scenario; the watery flaw carries cooler/melts to fit
// the "cooler ... melt" scenario. Without a shared word an objection would (correctly) go unassigned.
brief.lines.objections = SB.normalizeBrief({lines:{objections:[{value:'worried it is too small', count:4, classified:true, cause:'the tank holds less', resolve:'you top it off once and it keeps going', words:['ice','runs out']}]}}).lines.objections;
brief.features = SB.normalizeBrief({features:[{feature:'makes 33 lbs per 24 hours', benefit:'plenty of ice'}, {feature:'1.8 L tank', benefit:'fewer refills'}]}).features;
let raw = SB.emptyRaw(); raw.reviews = [{ id:'r1', full:'the nugget ice is so good' }];
const product = { id:'p1', name:'Ice maker', updated_at:'2026-01-01T00:00:00Z', brief:brief, raw:raw };

let fillErr = null;
try { PS.fill(product); } catch(e){ fillErr = e; }
ok(!fillErr, 'fill(product) does not throw' + (fillErr ? ' (' + fillErr.message + ')' : ''));

(async () => {
  let genErr = null;
  try { PS.generateScripts(); } catch(e){ genErr = e; }
  ok(!genErr, 'generateScripts() does not throw synchronously' + (genErr ? ' (' + genErr.message + ')' : ''));
  for (let k = 0; k < 80; k++) await Promise.resolve();   // drain the model-call + validate microtask chain

  // The crux: the sync setup (including the listingText line that had `str is not defined`) must complete and
  // reach the model call. With the bug, generateScripts fails before fetch and fetchCalls stays 0.
  ok(fetchCalls >= 1, 'the Generate path reaches the model call (sync setup did not crash) -- catches `str is not defined`');
  ok(capturedPrompt.indexOf('THE JOB') >= 0 && capturedPrompt.toLowerCase().indexOf('tap the link to buy') >= 0, 'the prompt leads with the selling directive above the rules');
  // The product name reaches the model AND it is told to say it once, early -- so scripts are not all "this one"/"it".
  ok(capturedPrompt.indexOf('PRODUCT NAME: Ice maker') >= 0, 'the product name is threaded into the batch prompt');
  ok(capturedPrompt.indexOf('SAY THE PRODUCT NAME, ONCE, BEFORE THE OBJECTION TURN') >= 0 && /Once is the FLOOR, not a quota/.test(capturedPrompt), 'the name instruction is present, and once is the floor not a quota (no ad-read repetition)');
  ok(/say it by the END OF THE SETUP \(body1\) -- BEFORE the objection turn/.test(capturedPrompt), 'the name must land by end of setup, before the objection turn (not in the payoff when there is a turn)');
  ok(/Do NOT force it into the hook/.test(capturedPrompt), 'the name instruction defers to the hook rules (never forced into a clunky hook)');
  ok(capturedPrompt.indexOf('SAY WHAT IT DOES, SPECIFICALLY, OR CUT THE LINE') >= 0 && /read like the writer never looked at the product/.test(capturedPrompt), 'the anti-filler rule: a works-claim must be specific from the material, or the line is cut');
  // The "ingredient list only" doctrine is reworded (write FROM the description's specifics) in both sites, and
  // the stale "buyer cards" / "buyer insight fields" data model is replaced by the derived brief. Assert on the
  // raw file: the genPrompt label only renders when a listing exists (this fixture has none).
  ok(html.indexOf('ingredient list') < 0, 'the "ingredient list only" doctrine is gone from both the system prompt and the genPrompt label');
  ok(html.indexOf('buyer cards are your script') < 0 && html.indexOf('buyer insight and creator fields are your primary brief') < 0, 'the stale buyer-cards / buyer-insight-fields data model is gone from the system prompt');
  ok(html.indexOf('write from the specific factual details in it, in the buyer') >= 0, 'the genPrompt PRODUCT LISTING label now tells the model to write from the specific details, keeping the no-claims rule');
  ok(/write the script FROM the specific, factual details in the product description/.test(html) && html.indexOf('derived brief') >= 0, 'the system prompt writes from the description specifics and names the derived brief as the buyer source');
  ok(capturedPrompt.indexOf('OBJECTION AS CURIOSITY') >= 0, 'objection-as-curiosity hook IS in rotation when the material names a cause');
  ok(capturedPrompt.indexOf('the tank holds less') >= 0, 'the grounded cause is fed to the objection hook (never invented)');
  ok(/current year is 20\d\d/.test(capturedPrompt), 'the real current year is passed into the prompt for the contrast device');
  // Architecture-scoped body exemplars: this product has objections -> C, so setup/payoff examples load.
  ok(capturedPrompt.indexOf('PROBLEM -> TRANSFORMATION') >= 0, 'architecture picked (C) and named in the prompt');
  ok(capturedPrompt.indexOf('SETUP (body1) examples') >= 0 && capturedPrompt.indexOf('PAYOFF (body2) examples') >= 0, 'setup and payoff exemplars are loaded (previously empty)');
  // Ownership off (default): recommender voice, no first-person invited.
  ok(capturedPrompt.indexOf('recommending this to the viewer') >= 0, 'ownership off -> recommender voice');
  // Field-filled hooks: assert availability + real-field injection via the test hook (independent of which
  // GEN_COUNT the rotation shows in this batch -- the pool is larger than the batch and walks across regens).
  const ctxT = SB.briefToGenContext(product.brief, product.raw);
  const hooks = PS.__availableHooks(ctxT);
  const byKey = {}; hooks.forEach(h => byKey[h.key] = h.instr);
  ok(byKey['bonepick'], 'bone-to-pick (cause-free reversal) is available on a pain');
  ok(byKey['audience'] && byKey['audience'].indexOf('people who host and always run out of ice') >= 0, 'audience hook reads "who this is for" straight from the brief');
  ok(byKey['group'] && byKey['group'].indexOf('never run dry mid-party') >= 0, 'group hook reads the desire line from the brief');
  ok(byKey['fearvisual'], 'fear-visual is available when the material names an alternative pain');
  // Pain split: the alternative pain is a scenario/opener; the product flaw is a doubt, never an opener.
  const varyIdx = capturedPrompt.indexOf('VARY THE SCENARIO');
  const flawIdx = capturedPrompt.indexOf('PRODUCT FLAWS ARE DOUBTS');
  ok(varyIdx >= 0 && capturedPrompt.slice(varyIdx, flawIdx > varyIdx ? flawIdx : varyIdx + 400).indexOf('ice runs out too fast') >= 0, 'the ALTERNATIVE pain is in the scenario/opener list');
  ok(flawIdx >= 0 && capturedPrompt.slice(flawIdx, flawIdx + 300).indexOf('the first batch is watery') >= 0, 'the PRODUCT flaw is listed as a doubt, never an opener');
  ok(varyIdx >= 0 && capturedPrompt.slice(varyIdx, flawIdx > varyIdx ? flawIdx : varyIdx + 400).indexOf('the first batch is watery') < 0, 'the product flaw does NOT appear in the scenario/opener list');
  // Maslow need is rotated per script; the arc and feeling-first setup are present.
  ok(/NEED \(the drive this script serves/.test(capturedPrompt), 'each script is assigned a Maslow need');
  ok(capturedPrompt.indexOf('SAFETY') >= 0, 'the safety drive gets a script (it converts hardest and kept being skipped)');
  ok(capturedPrompt.indexOf('THE ARC') >= 0 && capturedPrompt.indexOf('CLOSE THE EXACT GAP THE HOOK OPENED') >= 0, 'the arc is in the prompt: hook opens a gap, payoff closes that gap');
  ok(capturedPrompt.indexOf('names the FEELING') >= 0, 'the setup rule leads with the feeling, not just the situation');
  // The setup is the viewer's world: the product arrives at the END, the "write from specifics" doctrine is
  // scoped to the payoff/turn, and a sequence-walk exemplar gives the setup a positive shape to imitate.
  ok(capturedPrompt.indexOf("THE SETUP IS THE VIEWER'S WORLD") >= 0 && /product ARRIVES at the END of it or after it/.test(capturedPrompt), 'the setup rule: viewer\'s world, product arrives at the end not the start');
  ok(/does NOT apply here; the setup carries no specs/.test(capturedPrompt), 'the write-from-specifics doctrine is scoped OUT of the setup (payoff/objection turn only)');
  ok(capturedPrompt.indexOf('dig the iron out of the cupboard') >= 0, 'the sequence-walk exemplar (a lived chain of frictions, product absent) is loaded into the setup examples');
  // Setup openings must vary and need not use "you" -- second person is not what makes a setup a scene.
  ok(capturedPrompt.indexOf('VARY HOW THE SETUP OPENS, AND DO NOT DEFAULT TO "YOU"') >= 0 && /a setup does NOT need to start with "you" at all/.test(capturedPrompt), 'the setup rule: vary the openings and do not default to second person');
  ok(capturedPrompt.indexOf("the onions are half-chopped") >= 0, 'a no-second-person setup exemplar is loaded (a scene without "you")');
  // Fix 1: a hook must assert/reveal, not narrate the viewer's own action back at them (works with the rotation).
  ok(capturedPrompt.indexOf('ASSERT OR REVEAL, NEVER NARRATE') >= 0 && /not a hook, it is a caption/.test(capturedPrompt), 'hooks must assert or reveal, never merely narrate the viewer\'s action');
  // Fix 2: the setup loophole -- second-person framing on a spec list is still a spec list (about-ness, not person).
  ok(capturedPrompt.indexOf('A SPEC LIST IN SECOND PERSON IS STILL A SPEC LIST') >= 0 && /what each sentence is ABOUT, not what person/.test(capturedPrompt), 'the setup rule tests what the sentence is ABOUT, not its grammatical person');
  // Fix 3: show-the-fix must be a plain feature, not a rebuttal in shape (defensive posture plants the doubt).
  ok(capturedPrompt.indexOf('STATE IT AS A PLAIN GOOD THING, NEVER A REBUTTAL') >= 0 && /the SHAPE of a rebuttal plants the doubt/.test(capturedPrompt), 'the resolving action is stated as a plain feature, never a defensive rebuttal');
  // Fix 4: no analyst/spec-sheet jargon unless buyers use the phrase in the material.
  ok(capturedPrompt.indexOf('NO ANALYST OR SPEC-SHEET JARGON') >= 0 && /Only words a buyer actually used in the material/.test(capturedPrompt), 'analyst/spec-sheet jargon is banned unless it is the buyer\'s own vocabulary');
  // Manufacturer/material spec language (borosilicate, thermal shock resistant...) must be translated to a
  // buyer's plain benefit, never dropped in raw -- same principle as the analyst-jargon rule, different source.
  ok(capturedPrompt.indexOf('TRANSLATE MANUFACTURER SPEC LANGUAGE, NEVER DROP IT IN RAW') >= 0 && /No viewer knows what borosilicate is/.test(capturedPrompt) && /NEVER list specs in a row/.test(capturedPrompt), 'manufacturer spec language must be translated to a buyer\'s plain benefit, and never listed in a row');
  // Fix: the model may speak to a worry buyers expressed but must never manufacture the health/safety/contamination claim.
  ok(capturedPrompt.indexOf('NEVER MANUFACTURE A HEALTH, SAFETY, OR CONTAMINATION CLAIM') >= 0 && /asserting it and ASKING whether it is true are BOTH the claim/i.test(capturedPrompt), 'a health/safety/contamination claim is banned in any form (assertion or question); only a documented worry may be voiced');
  // Fix: a problem hook must be anchored to the category, not float without a subject.
  ok(capturedPrompt.indexOf('ANCHOR THE HOOK TO WHAT THE PROBLEM IS WITH') >= 0 && /naming the CATEGORY of thing is enough/.test(capturedPrompt), 'a problem hook must name the category so it does not float without a subject');
  // Fix: the objection turn must connect to the script's own thread, not arrive from a different angle.
  ok(capturedPrompt.indexOf("THE OBJECTION TURN BELONGS TO THIS SCRIPT'S THREAD") >= 0 && /a turn that reads like it belongs to a different script has failed/.test(capturedPrompt), 'the objection turn must continue this script\'s thread and name the product, not switch angle or open with a bare "This"');
  // Fix: a hook must not presuppose the viewer already moved on from the old thing.
  ok(capturedPrompt.indexOf('NEVER ASSUME THE VIEWER HAS MOVED ON') >= 0 && capturedPrompt.indexOf('your old X') >= 0, 'the hook must not assume the viewer already replaced the old thing');
  // Fix: ask, don't assert, the viewer's experience (safe form for a documented worry).
  ok(capturedPrompt.indexOf("ASK, DON'T ASSERT, THE VIEWER'S EXPERIENCE") >= 0, 'the hook asks the viewer\'s experience rather than asserting it');
  // Fix: the strongest hook makes the viewer supply the answer (names nothing, stays inside the claim rules).
  ok(capturedPrompt.indexOf('THE STRONGEST HOOK MAKES THE VIEWER SUPPLY THE ANSWER') >= 0 && /imply it, make them supply it, name nothing/.test(capturedPrompt), 'the strongest hook implies the subject and makes the viewer supply it');
  // Fix: the health-claim rule holds in every slot, not just the hook.
  ok(/This holds in EVERY slot -- hook, setup, pre-close, payoff AND cta/.test(capturedPrompt), 'the health/safety/contamination ban is script-wide, not a hook-only rule');
  // The system prompt itself now scopes the doctrine and keeps the setup product-free (raw-file assertion).
  ok(/Those specifics belong where you SHOW what the product does -- the payoff and the objection turn/.test(html), 'the system prompt scopes the specifics doctrine to the payoff and objection turn');
  ok(html.indexOf('The SETUP is the viewer\'s world BEFORE the product arrives, so it carries no specs') >= 0, 'the system prompt keeps the setup product-free');
  // The comprehension test: a hook that drops a middle step (step 1 + step 3, listener assembles the rest)
  // sounds fine aloud but fails on sense; the prompt must demand the WHOLE thought, every link of a chain.
  ok(capturedPrompt.indexOf('COMPLETE (comprehension)') >= 0, 'the hook comprehension test is in the prompt');
  ok(capturedPrompt.indexOf('say EVERY link') >= 0 && /middle/i.test(capturedPrompt), 'the comprehension test forbids dropping a middle step of a causal chain');
  // Objection-turn construction must vary across the batch (not four concede-then-counter openings).
  ok(capturedPrompt.indexOf('VARY THE OBJECTION-TURN CONSTRUCTION') >= 0, 'the pre-close construction is told to vary across the batch');
  // A conceded downside must be answered about the SAME thing (the slow-production gap that never closed).
  ok(capturedPrompt.indexOf('A CONCESSION MUST RESOLVE ITSELF') >= 0, 'a concession must resolve the same downside it raises');
  // The objection turn must never NAME the doubt (planting mold/price/noise in the viewer's head); show the fix.
  ok(capturedPrompt.indexOf('NEVER NAME THE DOUBT') >= 0 && /PLANTS it/.test(capturedPrompt), 'the objection turn is told to resolve a doubt without ever stating it');
  ok(/RESOLVE THIS DOUBT WITHOUT EVER NAMING IT/.test(capturedPrompt), 'the per-script objection is framed as what to resolve, not a line to speak');
  // The brief is intelligence: a finding tells the script what to SHOW, never a label to say. Objections
  // carry a resolving ACTION derivation worked out, handed to the script to put on screen.
  ok(capturedPrompt.indexOf('THE BRIEF IS INTELLIGENCE, NOT COPY') >= 0, 'the intelligence-not-copy principle is in the prompt');
  ok(capturedPrompt.indexOf('SHOW THIS ACTION as the answer') >= 0 && capturedPrompt.indexOf('you top it off once and it keeps going') >= 0, 'the resolving action is handed to the script to show');
  // DEFUSE-ONLY branch: an objection with NO resolving action ("the first batch is watery", a product flaw with
  // empty resolve) is routed to the dedicated REFRAME treatment, not the resolve/show-the-fix framing.
  ok(capturedPrompt.indexOf('REFRAME THIS LIMITATION AS THE BOUNDARY OF A JOB IT DOES WELL') >= 0, 'a defuse-only objection (empty resolve) gets the reframe-the-boundary instruction');
  ok(/Do NOT name this limitation, do NOT deny it, do NOT argue against it/.test(capturedPrompt), 'the reframe instruction forbids naming, denying, or arguing the limitation');
  ok(capturedPrompt.indexOf('PRE-CLOSE STYLE: REFRAME THE BOUNDARY') >= 0, 'the reframe is a dedicated pre-close treatment, not a rotated PRECLOSE angle');
  // The reframe attaches to the flaw with no resolve ("watery"), and the resolvable doubt is NOT reframed.
  const rfIdx = capturedPrompt.indexOf('REFRAME THIS LIMITATION AS THE BOUNDARY');
  const rfWin = capturedPrompt.slice(rfIdx, rfIdx + 500);
  ok(rfWin.indexOf('the first batch is watery') >= 0, 'the reframe is applied to the resolve-less product flaw');
  ok(rfWin.indexOf('you top it off once and it keeps going') < 0, 'the resolvable objection is not swept into the reframe branch (its resolve action is not in the reframe block)');
  // The old rotated "reframe it as the point" angle is gone -- the reframe is now the dedicated defuse-only path.
  ok(html.indexOf('Reframe it as the point') < 0, 'the reframe was removed from the rotated PRECLOSE_ANGLES list');
  const dp2 = PS.__derivePrompt([{ full: 'worried about mold' }]);
  ok(/resolve \(objections only\)/.test(dp2) && /resolving action/.test(dp2), 'derivation is told to capture each objection\'s resolving action');
  // Money is banned in any slot; a hook/setup may never assume the viewer owns it; reassure only a real doubt.
  ok(capturedPrompt.indexOf('NO MONEY, EVER') >= 0 && /spending a fortune/.test(capturedPrompt), 'the absolute money ban is in the prompt');
  ok(capturedPrompt.indexOf('THE VIEWER DOES NOT OWN IT YET') >= 0, 'a hook/setup may never assume the viewer already owns it');
  ok(capturedPrompt.indexOf('ANSWER ONLY A DOUBT SOMEONE ACTUALLY HAS') >= 0, 'the objection turn may not invent a doubt nobody raised');
  // A physical-behavior claim must come from the material (not "nugget ice melts slower"); no invented rival claim.
  ok(capturedPrompt.indexOf('NEVER ASSERT A PHYSICAL PROPERTY THE MATERIAL DOES NOT STATE') >= 0 && /melts slower/.test(capturedPrompt), 'an invented physical-property claim is forbidden');
  ok(capturedPrompt.indexOf('NO CLAIM ABOUT A COMPETING PRODUCT') >= 0, 'an invented claim about a competing product is forbidden');
  ok(/the machine you already have/.test(capturedPrompt), 'the ownership rule now covers "the machine you already have" phrasing');
  // The action hook must not be a spec/operating sequence ("fill the tank, press the button"). Check the
  // source directly (it may or may not land in this batch's rotation, so do not rely on the prompt text).
  const actionSrc = (PS.__availableHooks(ctxT) || []).find(h => h.key === 'action');
  ok(actionSrc && /spec sequence/.test(actionSrc.instr) && /FELT payoff/.test(actionSrc.instr), 'the action hook forbids an operating-step sequence and demands a felt payoff');
  // Participation over narration: the strongest hooks make the viewer act (answer/claim), not hear their
  // life described back. And a hook must be as broad as the product, never narrowed by a season qualifier.
  ok(capturedPrompt.indexOf('MAKE THE VIEWER DO SOMETHING') >= 0, 'the participation hook rule is in the prompt');
  ok(capturedPrompt.indexOf('AS BROAD AS THE PRODUCT') >= 0 && /on a hot day/.test(capturedPrompt), 'the breadth rule rejects an excluding qualifier (the hot-day example)');
  // Cultural moment must be a named ritual with a specific image, not a generic errand.
  const cultSrc = (PS.__availableHooks(ctxT) || []).find(h => h.key === 'cultural');
  ok(cultSrc && /ritual the group would name themselves/i.test(cultSrc.instr) && /GENERIC inconvenience is NOT/.test(cultSrc.instr), 'the cultural-moment shape demands a named ritual, not a generic inconvenience');
  // Derivation must not turn WHEN reviews were written into a buyer fact, nor narrow a line with a qualifier.
  const dp = PS.__derivePrompt([{ full: 'great in summer' }]);
  ok(/WHEN the reviews were written/.test(dp) && /summer product/.test(dp), 'derivation is told not to treat a seasonal review cluster as a buyer fact');
  ok(/narrow a value with a qualifier that only applies to SOME buyers/.test(dp), 'derivation is told not to narrow a line with a partial-audience qualifier');
  // Architecture selection: objections -> C, else scarcity -> B, else A.
  ok(PS.__architecture(ctxT).label.indexOf('TRANSFORMATION') >= 0, 'objections present -> architecture C');
  const bBrief = SB.emptyBrief(); bBrief.lines.scarcity = SB.normalizeBrief({lines:{scarcity:{value:'limited run this month'}}}).lines.scarcity;
  ok(PS.__architecture(SB.briefToGenContext(bBrief, SB.emptyRaw())).label.indexOf('SCARCITY') >= 0, 'no objections + scarcity -> architecture B');
  ok(PS.__architecture(SB.briefToGenContext(SB.emptyBrief(), SB.emptyRaw())).label.indexOf('GIFT') >= 0, 'no objections, no scarcity -> architecture A');

  const status = (byId['genStatus'] && byId['genStatus'].textContent) || '';
  ok(status.indexOf('hit an error') < 0, 'no error status was surfaced (would fire if any layer threw)');
  ok(status.indexOf('from your brief') >= 0, 'success status shown: "' + status.slice(0, 60) + '..."');
  ok(status.indexOf('4 script') >= 0 && status.indexOf('dropped') < 0, 'all four accepted, none dropped -- the listing figure ("33 pounds a day") was NOT falsely flagged');

  // Scripts actually rendered into the host.
  function walkText(el, acc, depth){ if(!el||depth>12) return; (el._children||[]).forEach(function(c){ if(c.textContent) acc.push(c.textContent); walkText(c, acc, depth+1); }); }
  let texts = []; walkText(byId['genScripts'], texts, 0);
  const joined = texts.join(' | ');
  ok(joined.indexOf('Your drink deserves better than this') >= 0, 'the first script rendered into #genScripts');
  ok(joined.indexOf('It makes 33 pounds of ice a day') >= 0, 'the listing-figure script survived and rendered');
  ok(joined.indexOf('See it on the shop page') >= 0, 'the fourth script rendered too (all four accepted, no regen)');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

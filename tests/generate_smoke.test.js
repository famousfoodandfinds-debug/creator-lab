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
brief.lines.pains = SB.normalizeBrief({lines:{pains:[{value:'ice runs out too fast', count:6, classified:true, about:'alternative', need:'convenience'}, {value:'the last cooler let it melt on a hot day', count:5, classified:true, about:'alternative', need:'safety'}, {value:'the first batch is watery', count:3, classified:true, about:'product'}]}}).lines.pains;
brief.lines.objections = SB.normalizeBrief({lines:{objections:[{value:'worried it is too small', count:4, classified:true, cause:'the tank holds less'}]}}).lines.objections;
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
  // The comprehension test: a hook that drops a middle step (step 1 + step 3, listener assembles the rest)
  // sounds fine aloud but fails on sense; the prompt must demand the WHOLE thought, every link of a chain.
  ok(capturedPrompt.indexOf('COMPLETE (comprehension)') >= 0, 'the hook comprehension test is in the prompt');
  ok(capturedPrompt.indexOf('say EVERY link') >= 0 && /middle/i.test(capturedPrompt), 'the comprehension test forbids dropping a middle step of a causal chain');
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

// Phase 1 -- FALLBACK TIERING. The old all-flagged fallback rendered the ORIGINAL first-pass drafts (before any
// guard ran), so the one time the batch was worst it showed raw, guard-banned lines and threw away every rewrite.
// Now guards are split into TERMINAL (never render: health, price, unverifiable figure, company, lifted/copied,
// wrong-ownership framing) and TASTE (renderable rough drafts). When nothing comes clean, the screen shows the
// best TERMINAL-FREE attempt per slot and holds back any slot whose only survivors hit a hard rule -- and if every
// slot is terminal, it shows NOTHING rather than a banned line. This locks that in.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const win = {}; new Function('window', blocks.find(b => b.includes('window.SaxeBrief =')))(win); const SB = win.SaxeBrief;
function mkEl(id){ return { id:id||'', style:{cssText:'',display:'',color:''}, value:'', textContent:'', disabled:false, _children:[], classList:{add(){},remove(){}}, set innerHTML(v){ this._children=[]; this._html=v; }, get innerHTML(){ return this._html||''; }, appendChild(c){ this._children.push(c); return c; }, addEventListener(){}, focus(){}, click(){}, removeChild(){}, querySelector(){ return null; } }; }
const byId = {};
const document = { readyState:'complete', getElementById(id){ if(!byId[id]) byId[id]=mkEl(id); return byId[id]; }, createElement(t){ return mkEl('<'+t+'>'); }, createDocumentFragment(){ return mkEl('#frag'); }, querySelector(s){ if(!byId[s]) byId[s]=mkEl(s); return byId[s]; }, addEventListener(){}, body:{classList:{add(){},remove(){}}} };
global.setTimeout = function(fn){ try { fn(); } catch(e){} };

// A TERMINAL draft (trips asserted-number -- a percent is never a listing figure here) and a TASTE draft (trips
// cites-source -- it references "the reviews", a taste-tier flag). Neither ever comes clean on rewrite, so every
// scenario lands in the all-flagged fallback.
function terminalDraft(tag){ return { hook:"This cuts your wait by 50 percent "+tag, body1:"You stand there waiting "+tag, preclose:"", body2:"You pour without a thought "+tag, cta:"See it on the shop page "+tag }; }
function tasteDraft(tag){ return { hook:"Cold drinks should not be this hard "+tag, body1:"Mornings you scramble "+tag, preclose:"", body2:"The reviews rave about how good it is "+tag, cta:"Grab yours today "+tag }; }

// MODE steers the stub: 'terminal' (all four terminal, rewrites stay terminal), 'taste' (all four taste, rewrites
// stay taste), 'recover' (first pass terminal, EVERY rewrite returns a terminal-free taste draft).
let MODE = 'terminal';
const fetchStub = function(u, o){
  const content = JSON.parse(o.body).messages[0].content;
  const m = content.match(/REGENERATE ONLY SCRIPT (\d+)/);
  let payload;
  if (!m){
    const base = (MODE === 'taste') ? tasteDraft : terminalDraft;   // recover + terminal both open on terminal drafts
    payload = JSON.stringify([base('a'), base('b'), base('c'), base('d')]);
  } else {
    const n = m[1] | 0;
    if (MODE === 'recover') payload = JSON.stringify(tasteDraft('r'+n));   // rewrites recover to a terminal-free (taste) draft
    else if (MODE === 'taste') payload = JSON.stringify(tasteDraft('r'+n));
    else payload = JSON.stringify(terminalDraft('r'+n));
  }
  return Promise.resolve({ status:200, text(){ return Promise.resolve(JSON.stringify({ content:[{ type:'text', text: payload }] })); } });
};
const psCode = blocks.find(b => b.includes('window.ProductScreen ='));
const params = ['window','document','currentUser','sb','currentProductId','currentProductName','currentProduct','loadProductById','buildSelect','transcribeTikTokLink','claudeHeaders','showToast','fetch','console'];
const chain = { select(){ return chain; }, eq(){ return chain; }, update(){ return chain; }, insert(){ return chain; }, order(){ return { then(r){ r({data:[],error:null}); } }; }, single(){ return { then(r){ r({data:{id:'p1'},error:null}); } }; }, then(r){ r({data:{id:'p1'},error:null}); } };
// This suite exercises the CURRENT engine with FULL guards -- pin them (the app default is now minimal/liability).
global.localStorage = { getItem(k){ return k === 'saxe_engine' ? 'current' : k === 'saxe_guards' ? 'full' : k === 'saxe_minimal_model' ? 'haiku' : null; }, setItem(){} };
new Function(...params, psCode)(win, document, {id:'u1'}, { from(){ return chain; } }, 'p1', 'Ice maker', {}, function(){}, function(){}, function(){ return Promise.resolve({}); }, function(){ return {}; }, function(){}, fetchStub, console);
const PS = win.ProductScreen;

let pass=0, fail=0; function ok(c,m){ if(c) pass++; else { fail++; console.log('  ✗ '+m); } }
function freshBrief(){
  let b = SB.emptyBrief();
  b.meta.lastDerivedAt='2026-01-01'; b.meta.reviewCount=12; b.meta.classified=true;
  b.lines.pains = SB.normalizeBrief({lines:{pains:[{value:'ice runs out on trips', count:5, classified:true, about:'alternative'}]}}).lines.pains;
  return b;
}
let raw = SB.emptyRaw(); raw.reviews=[{id:'r1',full:'great ice'}]; raw.description='Portable nugget ice maker. Makes 33 lbs a day.';
function walk(el,a,d){ if(!el||d>12) return; (el._children||[]).forEach(function(c){ if(c.textContent||c.value) a.push(c.textContent||c.value); walk(c,a,d+1); }); }
function screenText(){ byId['genScripts'] = byId['genScripts'] || mkEl('genScripts'); let t=[]; walk(byId['genScripts'], t, 0); return t.join(' | '); }
function status(){ return (byId['genStatus'] && byId['genStatus'].textContent) || ''; }

async function run(mode){
  MODE = mode;
  if (byId['genScripts']) { byId['genScripts']._children = []; }
  if (byId['genStatus']) { byId['genStatus'].textContent = ''; }
  PS.fill({id:'p1', name:'Ice maker', updated_at:'2026-01-01', brief:freshBrief(), raw});
  PS.generateScripts();
  for (let k=0;k<300;k++) await Promise.resolve();
  return { text: screenText(), status: status() };
}

(async () => {
  // 1. ALL TERMINAL -- the liability fix. Nothing renderable, so the screen shows NOTHING and the banned draft
  //    text ("50 percent") never reaches #genScripts. This is the hole the old fallback left open.
  const t = await run('terminal');
  ok(t.text.indexOf('50 percent') < 0, 'all-terminal batch: the guard-banned figure never reaches the screen (the old fallback rendered it raw)');
  ok(t.text.indexOf('You pour without a thought') < 0 && t.text.indexOf('You stand there waiting') < 0, 'all-terminal batch: no script draft text is rendered at all (only the status line remains)');
  ok(/hard rule/.test(t.status) && /none can be shown safely/.test(t.status), 'all-terminal batch: the status says every script hit a hard rule and none can be shown: "' + t.status.slice(0,90) + '"');

  // 2. ALL TASTE -- a rough draft the owner can read before posting is better than a blank. The best-effort draft
  //    IS rendered, and the status frames it as rough, naming the taste flag.
  const s = await run('taste');
  ok(s.text.indexOf('Cold drinks should not be this hard') >= 0, 'all-taste batch: the best-effort draft is rendered (not a blank)');
  ok(/rough draft/.test(s.status) && /read them before posting/.test(s.status), 'all-taste batch: the status frames the output as rough drafts to read first: "' + s.status.slice(0,90) + '"');

  // 3. RECOVERY -- first pass is terminal, but the rewrites come back terminal-free (taste). The terminal-free
  //    rewrite is what shows; the terminal first-pass draft ("50 percent") is never surfaced.
  const r = await run('recover');
  ok(r.text.indexOf('50 percent') < 0, 'recovery batch: the terminal FIRST-PASS draft is never shown, even though it was the original');
  ok(r.text.indexOf('The reviews rave about how good it is') >= 0, 'recovery batch: the best TERMINAL-FREE rewrite is what reaches the screen');
  ok(/rough draft/.test(r.status), 'recovery batch: shown as a rough draft, since the surviving version still trips a taste guard');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

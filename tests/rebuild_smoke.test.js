// Regression test for the destructive rebuild bug: "Rebuild from scratch" used to clear the live brief
// BEFORE the new derivation succeeded, so a truncated/failed rebuild left the owner with nothing while the
// error claimed "nothing was saved". This drives the REAL rebuild path with a failing model call and asserts
// the original brief is still on screen afterwards.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../app.html', 'utf8');
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);

const sbCode = blocks.find(b => b.includes('window.SaxeBrief ='));
const win = {}; new Function('window', sbCode)(win);
const SB = win.SaxeBrief;

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
win.confirm = function(){ return true; };   // approve the rebuild prompt

// A TRUNCATED JSON reply, exactly the failure mode: the model output is cut off so parseJson returns null.
let fetchCalls = 0;
const fetchStub = function(){
  fetchCalls++;
  const payload = JSON.stringify({ content: [{ type:'text', text: '{"lines":{"who":{"value":"cut off here' }] });
  return Promise.resolve({ status: 200, text: function(){ return Promise.resolve(payload); } });
};

const psCode = blocks.find(b => b.includes('window.ProductScreen ='));
const params = ['window','document','currentUser','sb','currentProductId','currentProductName','currentProduct',
  'loadProductById','buildSelect','transcribeTikTokLink','claudeHeaders','showToast','fetch','console'];
const chain = { select(){ return chain; }, eq(){ return chain; }, update(){ return chain; }, insert(){ return chain; },
  order(){ return { then(res){ res({ data: [], error: null }); } }; },
  single(){ return { then(res){ res({ data:{ id:'p1' }, error:null }); } }; },
  then(res){ res({ data:{ id:'p1' }, error:null }); } };
const sbMock = { from(){ return chain; } };
new Function(...params, psCode)(
  win, document, {id:'u1'}, sbMock,
  'p1', 'Ice maker', {}, function(){}, function(){}, function(){ return Promise.resolve({}); }, function(){ return {}; }, function(){},
  fetchStub, console
);
const PS = win.ProductScreen;

let pass = 0, fail = 0; function ok(c,m){ if(c) pass++; else { fail++; console.log('  ✗ ' + m); } }
ok(typeof PS.rebuildFromScratch === 'function', 'rebuildFromScratch is exported for testing');

// An existing, derived brief with a distinctive pain, plus reviews to re-read.
let brief = SB.emptyBrief();
brief.meta.lastDerivedAt = '2026-01-01T00:00:00Z';
brief.meta.reviewCount = 3;
brief.meta.classified = true;
brief.lines.pains = SB.normalizeBrief({lines:{pains:[{value:'the battery drains fast on this one', hits:['r1'], count:2, classified:true}]}}).lines.pains;
let raw = SB.emptyRaw(); raw.reviews = [{ id:'r1', full:'the battery drains fast' }, { id:'r2', full:'love the nugget ice' }];
const product = { id:'p1', name:'Ice maker', updated_at:'2026-01-01T00:00:00Z', brief:brief, raw:raw };

function briefText(){ function walk(el, acc, d){ if(!el||d>12) return; (el._children||[]).forEach(function(c){ if(c.textContent) acc.push(c.textContent); walk(c, acc, d+1); }); } var t=[]; walk(byId['briefBelow'], t, 0); return t.join(' | '); }

let fillErr = null; try { PS.fill(product); } catch(e){ fillErr = e; }
ok(!fillErr, 'fill(product) does not throw' + (fillErr ? ' (' + fillErr.message + ')' : ''));
ok(briefText().indexOf('the battery drains fast on this one') >= 0, 'the original brief renders before the rebuild');

(async () => {
  let rbErr = null; try { PS.rebuildFromScratch(); } catch(e){ rbErr = e; }
  ok(!rbErr, 'rebuildFromScratch() does not throw synchronously' + (rbErr ? ' (' + rbErr.message + ')' : ''));
  for (let k = 0; k < 80; k++) await Promise.resolve();

  ok(fetchCalls >= 1, 'the rebuild reached the model call');
  // THE FIX: the failed rebuild must leave the original brief intact, not an empty screen.
  ok(briefText().indexOf('the battery drains fast on this one') >= 0, 'after a FAILED rebuild, the original brief is still on screen (not cleared)');
  const status = (byId['briefStatus'] && byId['briefStatus'].textContent) || '';
  ok(status.indexOf('untouched') >= 0 || status.toLowerCase().indexOf('failed') >= 0, 'the error is shown and honestly says the brief is untouched: "' + status.slice(0, 70) + '"');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

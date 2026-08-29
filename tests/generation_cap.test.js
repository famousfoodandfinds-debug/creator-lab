// Monthly generation cap -- drives the REAL Netlify handler with a mocked Supabase (auth + script_generations)
// and a mocked Anthropic. A "generation" is one batch (one press of Generate). The cap counts distinct batch
// ids per member per UTC month at MONTHLY_BATCH_LIMIT = 150.
process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.SUPABASE_SERVICE_KEY = "test-service-key";
const path = require('path');
const { handler } = require(path.join(__dirname, '..', 'netlify', 'functions', 'claude.js'));

const MONTH = new Date().toISOString().slice(0, 7);   // same UTC 'YYYY-MM' the handler uses
let rows = [];            // in-memory script_generations: {user_id, generation_id, month}
let anthropicCalls = 0;
let failRead = false;     // simulate Supabase read down (fail-open test)

function mk(status, obj){ return { ok: status >= 200 && status < 300, status, json: async () => obj, text: async () => JSON.stringify(obj) }; }
global.fetch = async function(url, opts){
  opts = opts || {}; const method = (opts.method || "GET").toUpperCase();
  if (url.indexOf("/auth/v1/user") >= 0) return mk(200, { id: "user-1" });
  if (url.indexOf("/rest/v1/script_generations") >= 0 && method === "GET"){
    if (failRead) return mk(500, {});
    const u = (url.match(/user_id=eq\.([^&]+)/) || [])[1];
    const m = decodeURIComponent((url.match(/month=eq\.([^&]+)/) || [])[1] || "");
    return mk(200, rows.filter(r => r.user_id === u && r.month === m).map(r => ({ generation_id: r.generation_id })));
  }
  if (url.indexOf("/rest/v1/script_generations") >= 0 && method === "POST"){
    const b = JSON.parse(opts.body);
    if (!rows.some(r => r.user_id === b.user_id && r.generation_id === b.generation_id)) rows.push(b); // PK ignore-dupes
    return mk(201, {});
  }
  if (url.indexOf("/rest/v1/model_usage") >= 0) return mk(201, {});
  if (url.indexOf("api.anthropic.com") >= 0){ anthropicCalls++; return mk(200, { content:[{type:"text",text:"[]"}], usage:{input_tokens:10,output_tokens:5} }); }
  return mk(404, {});
};
function call(bodyObj){ return handler({ httpMethod:"POST", headers:{ authorization:"Bearer tok" }, body: JSON.stringify(bodyObj) }); }
function seed(n){ rows = []; for (let i=0;i<n;i++) rows.push({ user_id:"user-1", generation_id:"seed-"+i, month:MONTH }); }
function distinct(){ return new Set(rows.filter(r=>r.user_id==="user-1"&&r.month===MONTH).map(r=>r.generation_id)).size; }

let pass=0, fail=0; function ok(c,m){ if(c) pass++; else { fail++; console.log('  ✗ '+m); } }

(async () => {
  // A -- one batch counts once; its retries ride free on the same id.
  rows = []; anthropicCalls = 0; failRead = false;
  let r = await call({ call_name:"script_batch", generation_id:"g1", model:"m", messages:[{role:"user",content:"x"}] });
  ok(r.statusCode === 200, 'A: first batch call is forwarded (200)');
  ok(distinct() === 1, 'A: exactly one batch recorded');
  await call({ call_name:"script_batch", generation_id:"g1", model:"m", messages:[{role:"user",content:"retry"}] }); // a guard retry, same id
  await call({ call_name:"script_batch", generation_id:"g1", model:"m", messages:[{role:"user",content:"regen"}] }); // a single-script regen, same id
  ok(distinct() === 1, 'A: retries + a single-script regen on the same id add NO new batch (they ride free)');
  ok(anthropicCalls === 3, 'A: all three sub-calls still reached Anthropic');

  // B -- a brand-new batch is blocked at the limit; nothing recorded, Anthropic never hit.
  seed(150); anthropicCalls = 0;
  r = await call({ call_name:"script_batch", generation_id:"g-new", model:"m", messages:[{role:"user",content:"x"}] });
  ok(r.statusCode === 429, 'B: a new batch at the limit is blocked (429)');
  const body = JSON.parse(r.body);
  ok(body.error === "monthly_limit_reached" && body.limit === 150, 'B: 429 names the reason and the limit');
  ok(/library and Planner stay open/.test(body.message) && !/upgrade|buy|pay|\$/.test(body.message), 'B: message points to the library, no upsell');
  ok(anthropicCalls === 0 && distinct() === 150, 'B: the blocked batch never reached Anthropic and was not recorded');

  // C -- at the limit, an ALREADY-counted id (a retry of an in-flight batch) still rides free.
  seed(150); rows.push({ user_id:"user-1", generation_id:"g-live", month:MONTH }); anthropicCalls = 0; // 151 incl. g-live
  r = await call({ call_name:"script_batch", generation_id:"g-live", model:"m", messages:[{role:"user",content:"retry"}] });
  ok(r.statusCode === 200 && anthropicCalls === 1, 'C: a retry of a batch already on file is not blocked, even past the limit');

  // D -- the count-only endpoint reports usage and never touches Anthropic.
  seed(120); anthropicCalls = 0;
  r = await call({ count_only:true });
  const c = JSON.parse(r.body);
  ok(r.statusCode === 200 && c.ok === true, 'D: count-only returns 200 ok');
  ok(c.used === 120 && c.limit === 150 && c.remaining === 30, 'D: count-only reports used/limit/remaining in batches');
  ok(anthropicCalls === 0, 'D: count-only never calls Anthropic');

  // E -- research calls (no generation_id / not a script batch) are never counted or blocked, even at the cap.
  seed(150); anthropicCalls = 0;
  r = await call({ model:"m", messages:[{role:"user",content:"derive"}] });                 // derivation: untagged
  ok(r.statusCode === 200 && anthropicCalls === 1 && distinct() === 150, 'E: an untagged (derivation/classification) call is forwarded and never counted, even at the limit');
  r = await call({ call_name:"buyer_card", generation_id:"bc1", model:"m", messages:[{role:"user",content:"setup"}] }); // setup call with an id but not a script batch
  ok(r.statusCode === 200 && distinct() === 150, 'E: a setup call (non-script call_name) is not counted');

  // F -- fail open: a Supabase read error lets a brand-new batch through rather than wrongly blocking.
  seed(150); failRead = true; anthropicCalls = 0;
  r = await call({ call_name:"script_batch", generation_id:"g-failopen", model:"m", messages:[{role:"user",content:"x"}] });
  ok(r.statusCode === 200 && anthropicCalls === 1, 'F: a cap-check error fails OPEN (forwarded, not blocked)');
  failRead = false;

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

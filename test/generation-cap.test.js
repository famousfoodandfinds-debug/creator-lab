// Server-side test for the monthly finished-script cap in netlify/functions/claude.js.
// Mocks Supabase (auth + script_generations table) and Anthropic, then drives the REAL
// handler. Verifies: one script (many sub-calls, one generation_id) counts once; a new
// script is blocked at 300; at the limit non-generation calls still pass; fail-open.

process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.SUPABASE_SERVICE_KEY = "test-service-key";

const fnPath = require("path").join(__dirname, "..", "netlify", "functions", "claude.js");
const fn = require(fnPath);

const MONTH = new Date().toISOString().slice(0, 7);

// In-memory script_generations store: Map generation_id -> month (single test user).
let store;
let failCap = false;      // when true, cap DB reads throw (simulate Supabase down)
let anthropicCalls = 0;

function makeRes({ ok = true, status = 200, json = {}, contentRange = null }) {
  return {
    ok, status,
    headers: { get: (h) => (h.toLowerCase() === "content-range" ? contentRange : null) },
    json: async () => json,
    text: async () => JSON.stringify(json)
  };
}

global.fetch = async (url, opts) => {
  url = String(url);
  const method = (opts && opts.method) || "GET";

  if (url.includes("/auth/v1/user")) {
    return makeRes({ ok: true, json: { id: "user-123" } });
  }

  if (url.includes("/rest/v1/script_generations")) {
    if (failCap) throw new Error("Supabase unreachable (simulated)");
    if (method === "POST") {
      const row = JSON.parse(opts.body);
      store.set(row.generation_id, row.month);        // idempotent (Map by generation_id)
      return makeRes({ ok: true, status: 201, json: {} });
    }
    // GET: "seen" query has generation_id=eq.; "count" query has month=eq. (no generation_id)
    if (url.includes("generation_id=eq.")) {
      const m = url.match(/generation_id=eq\.([^&]+)/);
      const gid = decodeURIComponent(m[1]);
      return makeRes({ ok: true, json: store.has(gid) ? [{ generation_id: gid }] : [] });
    }
    // count query -> total distinct ids this month via content-range header
    let n = 0; store.forEach((mo) => { if (mo === MONTH) n++; });
    return makeRes({ ok: true, json: [], contentRange: `0-0/${n}` });
  }

  if (url.includes("api.anthropic.com/v1/messages")) {
    anthropicCalls++;
    return makeRes({ ok: true, status: 200, json: { content: [{ type: "text", text: "{}" }], usage: {} } });
  }
  if (url.includes("/rest/v1/model_usage")) return makeRes({ ok: true, json: {} });
  throw new Error("unexpected fetch: " + url);
};

function event(bodyObj) {
  return { httpMethod: "POST", headers: { authorization: "Bearer tok" }, body: JSON.stringify(bodyObj) };
}
async function call(bodyObj) {
  const r = await fn.handler(event(bodyObj));
  let parsed = {}; try { parsed = JSON.parse(r.body); } catch (e) {}
  return { status: r.statusCode, body: parsed };
}

let pass = 0, fail = 0;
function assert(name, cond, extra) { if (cond) { pass++; console.log("  PASS " + name); } else { fail++; console.log("  FAIL " + name + (extra ? " -> " + extra : "")); } }

(async () => {
  // ---- A. One script = one count (6 sub-calls share genA) --------------------------------
  console.log("A. One script's sub-calls count ONCE:");
  store = new Map(); anthropicCalls = 0;
  const subCalls = ["understanding", "hook", "body", "cta", "caption", "screen_text"];
  let allOk = true;
  for (const cn of subCalls) {
    const r = await call({ generation_id: "genA", call_name: cn, model: "m" });
    if (r.status !== 200) allOk = false;
  }
  assert("all 6 sub-calls forwarded (200)", allOk);
  assert("stored exactly 1 row for the script", store.size === 1, "size=" + store.size);
  assert("that row is genA", store.has("genA"));
  assert("all 6 reached Anthropic (none blocked)", anthropicCalls === 6, "anthropicCalls=" + anthropicCalls);

  // ---- B. New script blocked at the limit ------------------------------------------------
  console.log("B. At 300, a NEW script is blocked:");
  store = new Map();
  for (let i = 0; i < 300; i++) store.set("seed-" + i, MONTH);   // 300 distinct scripts this month
  anthropicCalls = 0;
  const blocked = await call({ generation_id: "genNew", call_name: "hook", model: "m" });
  assert("new script returns 429", blocked.status === 429, "status=" + blocked.status);
  assert("error is monthly_limit_reached", blocked.body.error === "monthly_limit_reached");
  assert("limit reported as 300", blocked.body.limit === 300);
  assert("message points to library, no upsell", /library/.test(blocked.body.message) && !/upgrade|buy|pay/i.test(blocked.body.message));
  assert("blocked call never hit Anthropic", anthropicCalls === 0, "anthropicCalls=" + anthropicCalls);
  assert("blocked new id was NOT recorded", !store.has("genNew"));

  // ---- C. At the limit, non-generate calls still pass (Planner / library / setup) --------
  console.log("C. At 300, everything EXCEPT a new script still works:");
  // store still holds 300
  const noGenId = await call({ model: "m", messages: [] });                       // Planner / regenerate / carousel / utility
  assert("call with NO generation_id passes (200)", noGenId.status === 200, "status=" + noGenId.status);
  const setup = await call({ generation_id: "genSetup", call_name: "buyer_card", model: "m" });   // setup call
  assert("setup call_name (buyer_card) passes (200)", setup.status === 200, "status=" + setup.status);
  assert("setup did not consume a script slot", !store.has("genSetup"));
  const ride = await call({ generation_id: "seed-0", call_name: "body", model: "m" });   // sub-call of an already-counted script
  assert("already-counted script id rides free (200)", ride.status === 200, "status=" + ride.status);

  // ---- D. Fail open on DB error ----------------------------------------------------------
  console.log("D. Cap DB error -> fail OPEN (never wrongly blocks):");
  store = new Map(); for (let i = 0; i < 300; i++) store.set("seed-" + i, MONTH);
  failCap = true; anthropicCalls = 0;
  const failOpen = await call({ generation_id: "genX", call_name: "hook", model: "m" });
  assert("script forwarded despite DB error (200)", failOpen.status === 200, "status=" + failOpen.status);
  assert("it reached Anthropic", anthropicCalls === 1);
  failCap = false;

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();

// Monthly GENERATION cap. A "generation" is one batch of scripts (the creator presses Generate once and gets
// four angles). The old cap counted every model API call in `rate_limits` and blocked at 30/day -- one batch
// fires several calls, so the real limit was a handful of batches a day and impossible to price. This counts
// distinct batches per member per calendar month instead.
//
// How a batch is counted: every model call for one batch carries the SAME `generation_id` and `call_name`
// "script_batch". The FIRST call for a new id records one row; every later call for that same id (guard
// retries, a single-script regeneration) finds the row already there and rides free. So starting a NEW batch
// is the only thing that consumes a slot -- iterating on what you already generated never does.
//
// What is NEVER counted: any call without a `generation_id` or whose `call_name` is not "script_batch" --
// derivation, classification, review OCR, the Planner, the carousel, description-cleaning and buyer discovery.
// Research spend does not eat a creator's script allowance.
// batches per member per UTC calendar month. Env override (MONTHLY_BATCH_LIMIT) exists so the limit can be set
// LOW on a preview deploy to test the wall without burning 150 batches; production leaves it unset -> 150.
const MONTHLY_BATCH_LIMIT = Number(process.env.MONTHLY_BATCH_LIMIT) || 150;
const SCRIPT_CALL_NAMES = new Set(["script_batch"]); // the definition of "a script batch"; add here if the batch gains a new call

// RUNAWAY-COST BACKSTOP. A per-user DAILY ceiling on model calls across EVERY surface (generation, derivation,
// OCR, Planner, carousel, and anything added later). It is NOT a product limit -- it sits far above the hardest
// real day of work; its only job is to bound a stuck client or a scripted loop so one member can't spend without
// limit. Env-overridable so it can be tuned without a deploy. See fetchTodayCallCount for how it is measured.
const DAILY_CALL_LIMIT = Number(process.env.DAILY_CALL_LIMIT) || 1500;
const DAILY_LIMIT_MESSAGE =
  "You've reached today's usage limit for your account. Everything you've already made is saved. " +
  "This limit resets tomorrow. If you think you're seeing this by mistake, email hello@saxe.app.";

const SUPABASE_URL = "https://ysacpditbxcrairmypsp.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzYWNwZGl0YnhjcmFpcm15cHNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjU4MjYsImV4cCI6MjA4OTM0MTgyNn0.U8W_KpDkYCT-jVBbXneAP1q_W9ChfhTi69DD0SS6G3o";
// Service-role key (already present in the Netlify env; used by the other webhook functions). Used here to
// read/write `script_generations`, which is service-role only and never exposed to the browser.
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function svcHeaders() {
  return {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json"
  };
}
function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
// UTC 'YYYY-MM'. This is the reset key: it rolls over on the 1st automatically, regardless of month length.
function monthKey() { return new Date().toISOString().slice(0, 7); }

// Every distinct batch id this member has recorded in the given month. Length == batches used. Throws on a
// read failure so the caller can decide to FAIL OPEN (a DB blip must never wrongly block a paying member).
async function fetchMonthBatchIds(userId, month) {
  if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY is not set for this function/deploy context");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/script_generations?select=generation_id&user_id=eq.${userId}&month=eq.${encodeURIComponent(month)}`,
    { headers: svcHeaders() }
  );
  if (!res.ok) {
    // Include the PostgREST body (truncated) so the real cause is visible: 401 invalid key, 404 relation does
    // not exist, permission denied, etc. -- instead of a bare status that leaves the failure a mystery.
    let detail = ""; try { detail = String(await res.text() || "").replace(/\s+/g, " ").slice(0, 300); } catch (e) {}
    throw new Error("script_generations read failed: " + res.status + (detail ? " " + detail : ""));
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows.map((r) => r.generation_id) : [];
}
// Count every model call this member has made since UTC midnight -- one model_usage row is written per forwarded
// call, so a COUNT of today's rows is the day's call total. Uses a HEAD-style count (Range 0-0 + count=exact) so
// it returns just the number, never thousands of rows. Throws on a read failure so the caller can FAIL OPEN.
// NOTE: relies on model_usage.created_at (Supabase default now()); if that column is absent this throws and the
// ceiling simply fails open (never blocks) until it exists -- verify it is present for the backstop to engage.
async function fetchTodayCallCount(userId) {
  if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY is not set for this function/deploy context");
  const dayStart = new Date().toISOString().slice(0, 10) + "T00:00:00Z"; // UTC midnight today
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/model_usage?select=user_id&user_id=eq.${userId}&created_at=gte.${encodeURIComponent(dayStart)}`,
    { headers: Object.assign(svcHeaders(), { "Prefer": "count=exact", "Range": "0-0" }) }
  );
  if (!res.ok) {
    let detail = ""; try { detail = String(await res.text() || "").replace(/\s+/g, " ").slice(0, 300); } catch (e) {}
    throw new Error("model_usage count failed: " + res.status + (detail ? " " + detail : ""));
  }
  const cr = res.headers.get("content-range") || "";       // e.g. "0-0/532" or "*/0"
  const total = parseInt(cr.slice(cr.indexOf("/") + 1), 10);
  if (!isFinite(total)) throw new Error("no count in content-range: '" + cr + "'");
  return total;
}
// Record a new batch. PK (user_id, generation_id) makes a repeat insert of the same batch a no-op, so a retry
// that raced the first insert can never double-count.
async function recordBatch(userId, generationId, month) {
  await fetch(`${SUPABASE_URL}/rest/v1/script_generations`, {
    method: "POST",
    headers: Object.assign(svcHeaders(), { "Prefer": "return=minimal,resolution=ignore-duplicates" }),
    body: JSON.stringify({ user_id: userId, generation_id: generationId, month })
  });
}

// Insert one model_usage row. Awaited with a hard timeout so a slow/unreachable Supabase can never stall a
// member's generation. ALL failures are swallowed: cost logging must NEVER break generation.
async function logModelUsage(row) {
  try {
    if (!SUPABASE_SERVICE_KEY) return; // not configured -> silently skip
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/model_usage`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify(row),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // swallow -- a logging error is never allowed to fail a member's script
  }
}

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(500, { error: "API key not configured" });
  }

  // Authenticate: require a valid Supabase session JWT, verified server-side. The x-user-id header is not
  // trusted on its own; the user id is taken from the verified token, so a forged header cannot burn credits.
  const authHeader = event.headers["authorization"] || event.headers["Authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return json(401, { error: "Not authenticated" });
  }
  let userId;
  try {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${token}` }
    });
    if (!authRes.ok) return json(401, { error: "Not authenticated" });
    const authUser = await authRes.json();
    userId = authUser && authUser.id;
    if (!userId) return json(401, { error: "Not authenticated" });
  } catch (err) {
    // Auth verification is fail-CLOSED by design: an unverifiable token is rejected.
    return json(401, { error: "Not authenticated" });
  }

  // Parse the body once, up front, so the cap can read the batch tags before the request is forwarded.
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return json(400, { error: "Invalid request body" });
  }

  const callName = (typeof body.call_name === "string" && body.call_name) ? body.call_name : "other";
  const generationId = (typeof body.generation_id === "string" && body.generation_id) ? body.generation_id : null;
  const month = monthKey();

  // ---- count-only endpoint: the app asks how many batches remain, so it can show the counter and warnings.
  // Never forwards to Anthropic. FAILS OPEN: on a read error it returns ok:false and the app simply hides the
  // counter rather than showing a wrong number or blocking anything.
  if (body.count_only === true) {
    try {
      const used = (await fetchMonthBatchIds(userId, month)).length;
      return json(200, { ok: true, used, limit: MONTHLY_BATCH_LIMIT, remaining: Math.max(0, MONTHLY_BATCH_LIMIT - used), month });
    } catch (err) {
      // The count check failed. It fails open (no counter shown, nothing blocked), but the reason must NOT be
      // silent -- log it, and return it (no secrets in it, just a status + PostgREST message) so it is visible
      // in the browser Network tab too. This is exactly the "no counter + nothing enforced" symptom.
      console.error("count_only failed (cap will fail OPEN):", err && err.message);
      return json(200, { ok: false, limit: MONTHLY_BATCH_LIMIT, reason: String((err && err.message) || "unknown").slice(0, 300) });
    }
  }

  // ---- RUNAWAY-COST BACKSTOP: the per-user DAILY ceiling, applied to EVERY forwarded call (not just script
  // batches). It sits far above any real day of work, so a normal heavy member never sees it; it exists only to
  // bound a stuck client or a scripted loop. FAILS OPEN: a DB blip never wrongly blocks a paying member.
  try {
    const usedToday = await fetchTodayCallCount(userId);
    if (usedToday >= DAILY_CALL_LIMIT) {
      // error-as-OBJECT (type + message) so every client surface renders error.message as a soft, friendly line
      // (carousel, OCR, derivation, planner) and the generate path can branch on error.type. Not a crash.
      return json(429, { error: { type: "daily_limit_reached", message: DAILY_LIMIT_MESSAGE }, daily_limit: DAILY_CALL_LIMIT });
    }
  } catch (err) {
    console.error("Daily ceiling check failed (failing open):", err && err.message);
  }

  // ---- the monthly BATCH cap. Only a real script batch (has a generation_id AND call_name "script_batch") is
  // gated. A new batch id at the limit is blocked; an id already on file (a retry or single-script regen) rides
  // free; everything untagged (derivation, classification, Planner, carousel, ...) is never touched here.
  const isScriptBatch = generationId && SCRIPT_CALL_NAMES.has(callName);
  if (isScriptBatch) {
    try {
      const ids = await fetchMonthBatchIds(userId, month);
      const alreadyCounted = ids.indexOf(generationId) >= 0;
      if (!alreadyCounted) {
        if (ids.length >= MONTHLY_BATCH_LIMIT) {
          // Generate-ONLY block: 429 here stops a brand-new batch, but the library and Planner are direct
          // Supabase reads / untagged calls that never reach this branch, so they stay fully open.
          return json(429, {
            error: "monthly_limit_reached",
            message: "You've used all " + MONTHLY_BATCH_LIMIT + " generations this month. They reset on the 1st -- your library and Planner stay open in the meantime.",
            used: ids.length,
            limit: MONTHLY_BATCH_LIMIT
          });
        }
        await recordBatch(userId, generationId, month); // count this new batch
      }
    } catch (err) {
      // FAIL OPEN: any cap-check error lets the request through. A DB blip never wrongly blocks a paying member.
      console.error("Monthly cap check failed (failing open):", err && err.message);
    }
  }

  // ---- forward to Anthropic. Strip the non-API metadata so Anthropic never sees these fields.
  try {
    const modelUsed = body.model || null;
    delete body.call_name;
    delete body.generation_id;
    delete body.count_only;

    const headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // Enables the 1-hour cache TTL used by the batch prompt; without it caching falls back to 5 minutes.
      "anthropic-beta": "extended-cache-ttl-2025-04-11"
    };

    // Optional: enable the TokScript MCP connector for this single request only. The key is read only here.
    let tokscriptDebug = null;
    if (body.useTokscript === true) {
      delete body.useTokscript;
      const tokscriptKey = process.env.TOKSCRIPT_API_KEY || "";
      const authMode = String(body.tokscriptAuthMode || process.env.TOKSCRIPT_AUTH_MODE || "bearer").toLowerCase();
      const authParam = String(body.tokscriptAuthParam || process.env.TOKSCRIPT_AUTH_PARAM || "key");
      delete body.tokscriptAuthMode;
      delete body.tokscriptAuthParam;

      const BASE_URL = "https://api.tokscript.com/mcp";
      const server = { type: "url", url: BASE_URL, name: "tokscript" };
      let bearerPresent = false, headerName = null, keyInUrl = false;
      if (authMode === "query") {
        server.url = BASE_URL + (BASE_URL.indexOf("?") > -1 ? "&" : "?") + encodeURIComponent(authParam) + "=" + encodeURIComponent(tokscriptKey);
        keyInUrl = true;
      } else if (authMode === "path") {
        server.url = BASE_URL.replace(/\/+$/, "") + "/" + encodeURIComponent(tokscriptKey);
        keyInUrl = true;
      } else {
        server.authorization_token = tokscriptKey;
        bearerPresent = true;
        headerName = "Authorization";
      }
      body.mcp_servers = [server];
      headers["anthropic-beta"] = "mcp-client-2025-04-04";
      tokscriptDebug = { authMode, headerName, bearerPresent, keyInUrl, keyLength: tokscriptKey.length, baseUrl: BASE_URL, queryParam: keyInUrl ? authParam : null };
      console.log("TokScript MCP auth config: " + JSON.stringify(tokscriptDebug));
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    });
    const data = await response.json();

    // Record what this call cost. Token counts + labels only -- never prompt or output text.
    const usage = (data && data.usage) || {};
    await logModelUsage({
      user_id: userId,
      call_name: callName,
      model: modelUsed,
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      cache_read_tokens: (usage.cache_read_input_tokens != null) ? usage.cache_read_input_tokens : null,
      cache_write_tokens: (usage.cache_creation_input_tokens != null) ? usage.cache_creation_input_tokens : null,
      generation_id: generationId,
      success: response.ok && !(data && data.error)
    });

    if (tokscriptDebug && data && typeof data === "object" && !Array.isArray(data)) {
      data.tokscriptDebug = tokscriptDebug;
    }
    return { statusCode: response.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
  } catch (err) {
    return json(500, { error: err.message });
  }
};

// STREAMING sibling of claude.js. Same auth, same monthly-batch cap, same usage logging -- carried over verbatim
// -- but it forwards to Anthropic with stream:true and returns a STREAMED response, so bytes flow to the browser
// and the inactivity/idle timeout never fires. Netlify SYNCHRONOUS functions cap at ~26s (often 10s); STREAMING
// functions get 60s, which is what a slower model (Sonnet) needs. This endpoint exists ONLY so Minimal-on-Sonnet
// can finish; nothing else calls it, and the buffered /api/claude and the whole Current/Lean path are untouched.
//
// v2 function (ESM export default, Web Request/Response) so no dependency is needed for streaming. The cap check
// runs BEFORE forwarding (a streamed batch still counts once), and usage is parsed out of the SSE and logged when
// the stream ends (Sonnet's cost still lands in model_usage).

const MONTHLY_BATCH_LIMIT = Number(process.env.MONTHLY_BATCH_LIMIT) || 150;
const SCRIPT_CALL_NAMES = new Set(["script_batch"]);

const SUPABASE_URL = "https://ysacpditbxcrairmypsp.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzYWNwZGl0YnhjcmFpcm15cHNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjU4MjYsImV4cCI6MjA4OTM0MTgyNn0.U8W_KpDkYCT-jVBbXneAP1q_W9ChfhTi69DD0SS6G3o";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function svcHeaders() {
  return { "apikey": SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" };
}
function jsonResponse(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
function monthKey() { return new Date().toISOString().slice(0, 7); }

// ---- cap helpers, verbatim from claude.js -------------------------------------------------------------------
async function fetchMonthBatchIds(userId, month) {
  if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY is not set for this function/deploy context");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/script_generations?select=generation_id&user_id=eq.${userId}&month=eq.${encodeURIComponent(month)}`,
    { headers: svcHeaders() }
  );
  if (!res.ok) {
    let detail = ""; try { detail = String(await res.text() || "").replace(/\s+/g, " ").slice(0, 300); } catch (e) {}
    throw new Error("script_generations read failed: " + res.status + (detail ? " " + detail : ""));
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows.map((r) => r.generation_id) : [];
}
async function recordBatch(userId, generationId, month) {
  await fetch(`${SUPABASE_URL}/rest/v1/script_generations`, {
    method: "POST",
    headers: Object.assign(svcHeaders(), { "Prefer": "return=minimal,resolution=ignore-duplicates" }),
    body: JSON.stringify({ user_id: userId, generation_id: generationId, month })
  });
}
// ---- usage logging, verbatim from claude.js (never allowed to fail a member's script) -----------------------
async function logModelUsage(row) {
  try {
    if (!SUPABASE_SERVICE_KEY) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/model_usage`, {
        method: "POST",
        headers: { "apikey": SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
        body: JSON.stringify(row),
        signal: controller.signal
      });
    } finally { clearTimeout(timer); }
  } catch (err) { /* swallow -- a logging error is never allowed to fail a member's script */ }
}

export default async (req) => {
  if (req.method !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return jsonResponse(500, { error: "API key not configured" });

  // Auth: verify the Supabase session JWT server-side, exactly as claude.js does. Fail-CLOSED.
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return jsonResponse(401, { error: "Not authenticated" });
  let userId;
  try {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${token}` } });
    if (!authRes.ok) return jsonResponse(401, { error: "Not authenticated" });
    const authUser = await authRes.json();
    userId = authUser && authUser.id;
    if (!userId) return jsonResponse(401, { error: "Not authenticated" });
  } catch (err) {
    return jsonResponse(401, { error: "Not authenticated" });
  }

  let body;
  try { body = await req.json(); } catch (err) { return jsonResponse(400, { error: "Invalid request body" }); }

  const callName = (typeof body.call_name === "string" && body.call_name) ? body.call_name : "other";
  const generationId = (typeof body.generation_id === "string" && body.generation_id) ? body.generation_id : null;
  const month = monthKey();

  // ---- the monthly BATCH cap, verbatim from claude.js. A streamed batch counts once (a retry rides free).
  const isScriptBatch = generationId && SCRIPT_CALL_NAMES.has(callName);
  if (isScriptBatch) {
    try {
      const ids = await fetchMonthBatchIds(userId, month);
      const alreadyCounted = ids.indexOf(generationId) >= 0;
      if (!alreadyCounted) {
        if (ids.length >= MONTHLY_BATCH_LIMIT) {
          return jsonResponse(429, {
            error: "monthly_limit_reached",
            message: "You've used all " + MONTHLY_BATCH_LIMIT + " generations this month. They reset on the 1st -- your library and Planner stay open in the meantime.",
            used: ids.length, limit: MONTHLY_BATCH_LIMIT
          });
        }
        await recordBatch(userId, generationId, month);
      }
    } catch (err) {
      console.error("Monthly cap check failed (failing open):", err && err.message);
    }
  }

  // ---- forward to Anthropic WITH streaming. Strip the non-API metadata; keep the extended-cache-ttl beta.
  const modelUsed = body.model || null;
  delete body.call_name; delete body.generation_id; delete body.count_only;
  body.stream = true;

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "extended-cache-ttl-2025-04-11"
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    return jsonResponse(502, { error: (err && err.message) ? err.message : "upstream request failed" });
  }

  // An error BEFORE the stream (auth, 400, 529 overload): return it as JSON, same shape claude.js returns, so the
  // client's error handling is identical.
  if (!upstream.ok || !upstream.body) {
    let txt = ""; try { txt = await upstream.text(); } catch (e) {}
    return new Response(txt || JSON.stringify({ error: "upstream error" }), { status: upstream.status || 502, headers: { "Content-Type": "application/json" } });
  }

  // Pass the SSE straight through to the browser (bytes keep flowing -> no idle timeout), while TAPPING it to pull
  // usage out for logging. Anthropic sends input_tokens in message_start and cumulative output_tokens in
  // message_delta; log the final numbers when the stream ends so Sonnet's cost still lands in model_usage.
  let inTok = 0, outTok = 0, cacheRead = null, cacheWrite = null, buf = "";
  const dec = new TextDecoder();
  const tap = new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk);                 // forward to the client unchanged
      buf += dec.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (line.indexOf("data:") !== 0) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "message_start" && ev.message && ev.message.usage) {
            const u = ev.message.usage;
            inTok = u.input_tokens || 0;
            outTok = u.output_tokens || 0;
            if (u.cache_read_input_tokens != null) cacheRead = u.cache_read_input_tokens;
            if (u.cache_creation_input_tokens != null) cacheWrite = u.cache_creation_input_tokens;
          } else if (ev.type === "message_delta" && ev.usage && ev.usage.output_tokens != null) {
            outTok = ev.usage.output_tokens;
          }
        } catch (e) { /* ignore a partial/non-JSON data line */ }
      }
    },
    async flush() {
      // The client already has every byte; hold the function just long enough to record the cost (bounded to 2.5s).
      await logModelUsage({
        user_id: userId, call_name: callName, model: modelUsed,
        input_tokens: inTok, output_tokens: outTok,
        cache_read_tokens: cacheRead, cache_write_tokens: cacheWrite,
        generation_id: generationId, success: true
      });
    }
  });

  return new Response(upstream.body.pipeThrough(tap), {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" }
  });
};

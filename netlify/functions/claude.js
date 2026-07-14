const DAILY_LIMIT = 30;
const SUPABASE_URL = "https://ysacpditbxcrairmypsp.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzYWNwZGl0YnhjcmFpcm15cHNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjU4MjYsImV4cCI6MjA4OTM0MTgyNn0.U8W_KpDkYCT-jVBbXneAP1q_W9ChfhTi69DD0SS6G3o";
// Service-role key (already present in the Netlify env; used by the other webhook
// functions). Used ONLY here to write model_usage rows, which are service-role-write
// only and never exposed to the browser.
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Insert one model_usage row. Fire-and-forget in spirit but awaited with a hard timeout
// so a slow/unreachable Supabase can never stall a member's generation. ALL failures are
// swallowed: logging must NEVER break generation.
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
    return { statusCode: 500, body: JSON.stringify({ error: "API key not configured" }) };
  }

  // Authenticate: require a valid Supabase session JWT, verified server-side.
  // The x-user-id header is no longer trusted on its own; the user id is taken from
  // the verified token, so a forged or rotated header cannot burn API credits.
  const authHeader = event.headers["authorization"] || event.headers["Authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
  }
  let userId;
  try {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${token}` }
    });
    if (!authRes.ok) {
      return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
    }
    const authUser = await authRes.json();
    userId = authUser && authUser.id;
    if (!userId) {
      return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
    }
  } catch (err) {
    // Auth verification is fail-closed by design: if the token cannot be verified, reject.
    return { statusCode: 401, body: JSON.stringify({ error: "Not authenticated" }) };
  }

  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split("T")[0];

  // Check and increment rate limit in Supabase
  try {
    // Get current count for today
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/rate_limits?user_id=eq.${userId}&date=eq.${today}`,
      {
        headers: {
          "apikey": SUPABASE_ANON,
          "Authorization": `Bearer ${SUPABASE_ANON}`,
          "Content-Type": "application/json"
        }
      }
    );
    const rows = await checkRes.json();
    const currentCount = rows.length > 0 ? rows[0].count : 0;

    // Block if over limit
    if (currentCount >= DAILY_LIMIT) {
      return {
        statusCode: 429,
        body: JSON.stringify({
          error: "daily_limit_reached",
          message: "You have reached your 30 generations for today. Your limit resets at midnight.",
          count: currentCount,
          limit: DAILY_LIMIT
        })
      };
    }

    // Upsert incremented count
    await fetch(`${SUPABASE_URL}/rest/v1/rate_limits`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON,
        "Authorization": `Bearer ${SUPABASE_ANON}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        user_id: userId,
        date: today,
        count: currentCount + 1
      })
    });

  } catch (err) {
    // If rate limit check fails, allow the request through rather than blocking users
    console.error("Rate limit check failed:", err.message);
  }

  // Forward request to Anthropic
  try {
    const body = JSON.parse(event.body);

    // Usage-logging metadata travels in the body from the client. Pull it out and STRIP
    // it before forwarding, so Anthropic never sees these non-API fields. Unlabeled calls
    // are logged as "other" so no model spend is ever silently uncosted.
    const callName = (typeof body.call_name === "string" && body.call_name) ? body.call_name : "other";
    const generationId = (typeof body.generation_id === "string" && body.generation_id) ? body.generation_id : null;
    const modelUsed = body.model || null;
    delete body.call_name;
    delete body.generation_id;

    const headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    };

    // Safe diagnostic about the TokScript auth shape, surfaced in the response so
    // the test panel can display it. NEVER contains the key value, only its length.
    let tokscriptDebug = null;

    // Optional: enable the TokScript MCP connector for this single request only.
    // The TokScript key is read ONLY here on the backend from the environment.
    if (body.useTokscript === true) {
      delete body.useTokscript;

      // Configurable auth shape so we can test what TokScript's MCP server expects.
      // Anthropic's mcp_servers only supports authorization_token, which is ALWAYS
      // sent to the MCP server as "Authorization: Bearer <token>" -- there is no
      // custom-header option. To send the token a different way, embed it in the URL.
      //   bearer (default): authorization_token -> "Authorization: Bearer <token>"
      //   query:            token added as a URL query parameter, NO Authorization header
      //   path:             token appended to the URL path, NO Authorization header
      // Mode and param name can come from the request body or from env (body wins),
      // so alternatives can be tried without changing this code.
      const tokscriptKey = process.env.TOKSCRIPT_API_KEY || "";
      const authMode = String(body.tokscriptAuthMode || process.env.TOKSCRIPT_AUTH_MODE || "bearer").toLowerCase();
      const authParam = String(body.tokscriptAuthParam || process.env.TOKSCRIPT_AUTH_PARAM || "key");
      delete body.tokscriptAuthMode;
      delete body.tokscriptAuthParam;

      const BASE_URL = "https://api.tokscript.com/mcp";
      const server = { type: "url", url: BASE_URL, name: "tokscript" };
      let bearerPresent = false;
      let headerName = null;
      let keyInUrl = false;

      if (authMode === "query") {
        server.url = BASE_URL + (BASE_URL.indexOf("?") > -1 ? "&" : "?") + encodeURIComponent(authParam) + "=" + encodeURIComponent(tokscriptKey);
        keyInUrl = true;
      } else if (authMode === "path") {
        server.url = BASE_URL.replace(/\/+$/, "") + "/" + encodeURIComponent(tokscriptKey);
        keyInUrl = true;
      } else {
        // bearer (default) -- unchanged from the original behavior
        server.authorization_token = tokscriptKey;
        bearerPresent = true;
        headerName = "Authorization";
      }

      body.mcp_servers = [server];
      // Anthropic MCP connector beta header. If this exact value is outdated,
      // it may need adjustment.
      headers["anthropic-beta"] = "mcp-client-2025-04-04";

      // Safe diagnostic shared by the log line and the response. NEVER contains the
      // key value, nor any URL that contains it -- only the shape and the key length.
      tokscriptDebug = {
        authMode: authMode,
        headerName: headerName,          // "Authorization" in bearer mode, null otherwise
        bearerPresent: bearerPresent,    // true only when "Authorization: Bearer <token>" is sent
        keyInUrl: keyInUrl,              // true in query/path mode (the key-bearing URL is never logged)
        keyLength: tokscriptKey.length,  // length only, never the value
        baseUrl: BASE_URL,               // key-free base URL, safe to log
        queryParam: keyInUrl ? authParam : null // the param/segment name only, never the value
      };

      // Log the outbound auth config for diagnosis. NEVER log the key itself, nor any
      // URL that contains it -- only the shape, the header name, and the key length.
      console.log("TokScript MCP auth config: " + JSON.stringify(tokscriptDebug));
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    });

    const data = await response.json();

    // Record what this call cost. Token counts + labels only -- never prompt or output
    // text. Wrapped so a logging failure can never fail the generation.
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

    // Merge the safe TokScript diagnostic into the response so the test panel can
    // display it (auth mode + key length, never the key value).
    if (tokscriptDebug && data && typeof data === "object" && !Array.isArray(data)) {
      data.tokscriptDebug = tokscriptDebug;
    }
    return {
      statusCode: response.status,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};

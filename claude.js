const DAILY_LIMIT = 30;
const SUPABASE_URL = "https://ysacpditbxcrairmypsp.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzYWNwZGl0YnhjcmFpcm15cHNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjU4MjYsImV4cCI6MjA4OTM0MTgyNn0.U8W_KpDkYCT-jVBbXneAP1q_W9ChfhTi69DD0SS6G3o";

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "API key not configured" }) };
  }

  // Get user ID from request headers (sent by the app)
  const userId = event.headers["x-user-id"];
  if (!userId) {
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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
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

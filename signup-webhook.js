// Netlify function: signup-webhook
// Called by Zapier when a new Stan purchase is made
// Adds the buyer's email to paid_users table in Supabase

exports.handler = async function(event, context) {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return { statusCode: 500, body: "Missing environment variables" };
    }

    // Parse the incoming request body
    let body;
    try {
      body = JSON.parse(event.body);
    } catch(e) {
      return { statusCode: 400, body: "Invalid JSON" };
    }

    // Get email from the request -- Zapier will send it as { email: "..." }
    const email = body.email ? body.email.trim().toLowerCase() : null;

    if (!email) {
      return { statusCode: 400, body: "No email provided" };
    }

    // Insert into paid_users -- ON CONFLICT DO UPDATE sets active back to true
    // (handles case where someone cancelled and resubscribed)
    const response = await fetch(`${SUPABASE_URL}/rest/v1/paid_users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        email: email,
        active: true
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Supabase error:", error);
      return { statusCode: 500, body: "Failed to add user: " + error };
    }

    console.log("Added paid user:", email);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, email: email })
    };

  } catch(err) {
    console.error("Function error:", err);
    return { statusCode: 500, body: "Server error: " + err.message };
  }
};

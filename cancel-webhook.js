// Netlify function: cancel-webhook
// Called by Zapier when a Stan subscription is cancelled
// Sets active: false for the email in paid_users table

exports.handler = async function(event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return { statusCode: 500, body: "Missing environment variables" };
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch(e) {
      return { statusCode: 400, body: "Invalid JSON" };
    }

    const email = body.email ? body.email.trim().toLowerCase() : null;
    if (!email) {
      return { statusCode: 400, body: "No email provided" };
    }

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/paid_users?email=eq.${encodeURIComponent(email)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify({ active: false })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Supabase error:", error);
      return { statusCode: 500, body: "Failed to cancel user: " + error };
    }

    console.log("Cancelled paid user:", email);
    return { statusCode: 200, body: JSON.stringify({ success: true, email: email }) };

  } catch(err) {
    console.error("Function error:", err);
    return { statusCode: 500, body: "Server error: " + err.message };
  }
};

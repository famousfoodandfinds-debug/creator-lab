// Netlify serverless function: relays the carousel request to Anthropic
// Deploy at: netlify/functions/carousel-write.js
// Set an environment variable in Netlify named ANTHROPIC_API_KEY (your key).
// The browser calls /.netlify/functions/carousel-write , this adds the key server-side.

const SUPABASE_URL = "https://ysacpditbxcrairmypsp.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzYWNwZGl0YnhjcmFpcm15cHNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjU4MjYsImV4cCI6MjA4OTM0MTgyNn0.U8W_KpDkYCT-jVBbXneAP1q_W9ChfhTi69DD0SS6G3o";

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: { message: 'Method not allowed' } }) };
  }

  // Authenticate: require a valid Supabase session JWT, verified server-side. Fail-closed.
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: { message: 'Not authenticated' } }) };
  }
  try {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` }
    });
    if (!authRes.ok) {
      return { statusCode: 401, body: JSON.stringify({ error: { message: 'Not authenticated' } }) };
    }
    const authUser = await authRes.json();
    if (!authUser || !authUser.id) {
      return { statusCode: 401, body: JSON.stringify({ error: { message: 'Not authenticated' } }) };
    }
  } catch (err) {
    return { statusCode: 401, body: JSON.stringify({ error: { message: 'Not authenticated' } }) };
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: event.body, // forwards { model, max_tokens, system, messages } as-is
    });
    const text = await resp.text();
    return {
      statusCode: resp.status,
      headers: { 'content-type': 'application/json' },
      body: text,
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: { message: String(err) } }) };
  }
};

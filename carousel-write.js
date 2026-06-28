// Netlify serverless function: relays the carousel request to Anthropic
// Deploy at: netlify/functions/carousel-write.js
// Set an environment variable in Netlify named ANTHROPIC_API_KEY (your key).
// The browser calls /.netlify/functions/carousel-write , this adds the key server-side.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: { message: 'Method not allowed' } }) };
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

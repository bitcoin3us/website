// Netlify serverless function: adds an email to Resend and tags it with the
// Newsletter segment so new subscribers are easy to find and target.
//
// Environment variables required in Netlify:
//   RESEND_API_KEY              — API key from resend.com (shared with webhook functions)
//   RESEND_NEWSLETTER_SEGMENT_ID — segment ID from the Resend dashboard (Audiences → Segments)

var ALLOWED_ORIGIN = 'https://lightningpiggy.com';

function corsHeaders(event) {
  var origin = (event.headers || {}).origin || '';
  var allowed = (origin === ALLOWED_ORIGIN || origin.endsWith('.netlify.app')) ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  var apiKey = process.env.RESEND_API_KEY;
  var segmentId = process.env.RESEND_NEWSLETTER_SEGMENT_ID;

  if (!apiKey || !segmentId) {
    console.error('RESEND_API_KEY or RESEND_NEWSLETTER_SEGMENT_ID environment variable is not set');
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  // Parse request body
  var body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  var email = (body.email || '').trim().toLowerCase();

  if (!email) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Email is required.' }) };
  }

  if (email.length > 320) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Email address is too long.' }) };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Please enter a valid email address.' }) };
  }

  // Create contact in Resend and add to Newsletter segment
  try {
    var contactBody = {
      email: email,
      unsubscribed: false,
      segments: [segmentId]
    };

    var res = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(contactBody)
    });

    if (res.ok) {
      return {
        statusCode: 200,
        headers: corsHeaders(event),
        body: JSON.stringify({ success: true })
      };
    }

    // Handle specific Resend error codes
    var status = res.status;
    var errBody;
    try { errBody = await res.json(); } catch (e) { errBody = {}; }

    if (status === 429) {
      return { statusCode: 429, headers: corsHeaders(event), body: JSON.stringify({ error: 'Too many requests. Please try again in a moment.' }) };
    }

    if (status === 422) {
      return { statusCode: 422, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid email address.' }) };
    }

    console.error('Resend API error:', status, JSON.stringify(errBody));
    return { statusCode: 502, headers: corsHeaders(event), body: JSON.stringify({ error: 'Subscription failed. Please try again.' }) };

  } catch (err) {
    console.error('Resend API fetch error:', err.message);
    return { statusCode: 502, headers: corsHeaders(event), body: JSON.stringify({ error: 'Subscription failed. Please try again.' }) };
  }
};

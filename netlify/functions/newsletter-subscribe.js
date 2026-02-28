// Netlify serverless function: adds an email to the Resend newsletter audience,
// sends a welcome email to the subscriber, and notifies the site owner.
//
// Environment variables required in Netlify:
//   RESEND_API_KEY     — API key from resend.com (shared with webhook functions)
//   RESEND_AUDIENCE_ID — audience ID from the Resend dashboard

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

var NOTIFICATION_EMAIL = 'oink@lightningpiggy.com';
var FROM_EMAIL = 'Lightning Piggy <newsletter@lightningpiggy.com>';

var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Send welcome email to new subscriber
async function sendWelcomeEmail(apiKey, subscriberEmail) {
  var html = [
    '<div style="font-family:sans-serif;max-width:480px;">',
    '  <h2 style="color:#e91e8c;">Welcome to the herd! 🐷</h2>',
    '  <p>Thanks for subscribing to the Lightning Piggy newsletter.</p>',
    '  <p>You\'ll receive updates on new features, build guides, and project news — no spam, just oinks.</p>',
    '  <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">',
    '  <p style="color:#999;font-size:12px;">Lightning Piggy — The Bitcoin piggy bank for everyone</p>',
    '</div>'
  ].join('\n');

  try {
    var res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [subscriberEmail],
        subject: 'Welcome to Lightning Piggy! 🐷',
        html: html
      })
    });
    if (!res.ok) {
      var text = await res.text();
      console.error('Welcome email error:', res.status, text);
    }
  } catch (err) {
    console.error('Failed to send welcome email:', err.message);
  }
}

// Notify site owner of new subscriber
async function sendOwnerNotification(apiKey, subscriberEmail) {
  var html = [
    '<div style="font-family:sans-serif;max-width:480px;">',
    '  <h2 style="color:#e91e8c;">New Newsletter Subscriber!</h2>',
    '  <p style="font-size:18px;font-weight:bold;">' + subscriberEmail + '</p>',
    '  <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">',
    '  <p style="color:#999;font-size:12px;">Lightning Piggy Newsletter</p>',
    '</div>'
  ].join('\n');

  try {
    var res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [NOTIFICATION_EMAIL],
        subject: 'New subscriber: ' + subscriberEmail,
        html: html
      })
    });
    if (!res.ok) {
      var text = await res.text();
      console.error('Owner notification error:', res.status, text);
    }
  } catch (err) {
    console.error('Failed to send owner notification:', err.message);
  }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  var apiKey = process.env.RESEND_API_KEY;
  var audienceId = process.env.RESEND_AUDIENCE_ID || process.env.RESEND_NEWSLETTER_SEGMENT_ID;

  if (!apiKey || !audienceId) {
    console.error('RESEND_API_KEY or RESEND_AUDIENCE_ID environment variable is not set');
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

  // Add contact to Resend audience
  try {
    var res = await fetch('https://api.resend.com/audiences/' + audienceId + '/contacts', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        unsubscribed: false
      })
    });

    if (res.ok) {
      // Send emails in parallel (don't block the response if they fail)
      await Promise.allSettled([
        sendWelcomeEmail(apiKey, email),
        sendOwnerNotification(apiKey, email)
      ]);

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
    return { statusCode: 502, headers: corsHeaders(event), body: JSON.stringify({ error: 'Subscription failed. Please try again.', debug: errBody }) };

  } catch (err) {
    console.error('Resend API fetch error:', err.message);
    return { statusCode: 502, headers: corsHeaders(event), body: JSON.stringify({ error: 'Subscription failed. Please try again.' }) };
  }
};

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
var FROM_EMAIL = 'Lightning Piggy <newsletter@mail.lightningpiggy.com>';

var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Fetch with exponential backoff on 429 rate limits
// Retries up to 3 times with delays of 600ms, 1200ms, 2400ms
async function fetchWithRetry(url, options, maxRetries) {
  maxRetries = maxRetries || 3;
  var delay = 600;
  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    var res = await fetch(url, options);
    if (res.status !== 429 || attempt === maxRetries) return res;
    console.log('Rate limited, retrying in ' + delay + 'ms (attempt ' + (attempt + 1) + ')');
    await new Promise(function (r) { setTimeout(r, delay); });
    delay *= 2;
  }
  return res;
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// Send welcome email to new subscriber
async function sendWelcomeEmail(apiKey, subscriberEmail) {
  var html = [
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>',
    '<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f5f5;"><tr><td align="center" style="padding:24px 16px;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;">',
    '  <tr><td align="center" style="padding:0 0 24px 0;">',
    '    <a href="https://lightningpiggy.com" style="text-decoration:none;"><img src="https://lightningpiggy.com/images/email/lightningpiggy-logo.png" alt="Lightning Piggy" width="200" style="display:block;width:200px;max-width:200px;height:auto;"></a>',
    '  </td></tr>',
    '  <tr><td>',
    '    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#ffffff;border-radius:16px;overflow:hidden;">',
    '      <tr><td style="background-color:#EC008C;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>',
    '      <tr><td style="padding:40px 40px 24px 40px;">',
    '        <h1 style="margin:0;font-size:28px;font-weight:700;line-height:34px;color:#111827;">Welcome to the herd! 🐷</h1>',
    '      </td></tr>',
    '      <tr><td style="padding:0 40px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td style="border-bottom:1px solid #f0f0f0;height:1px;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>',
    '      <tr><td style="padding:24px 40px 32px 40px;font-size:16px;line-height:26px;color:#525252;">',
    '        <p style="margin:0 0 16px 0;">Thanks for subscribing to the Lightning Piggy newsletter.</p>',
    '        <p style="margin:0 0 16px 0;">You\'ll receive updates on new features, build guides, and project news — no spam, just oinks.</p>',
    '        <p style="margin:0;">In the meantime, explore what Lightning Piggy can do:</p>',
    '      </td></tr>',
    '      <tr><td style="padding:0 40px 40px 40px;" align="center">',
    '        <table role="presentation" cellpadding="0" cellspacing="0"><tr>',
    '          <td style="background-color:#EC008C;border-radius:50px;">',
    '            <a href="https://lightningpiggy.com/about" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:50px;">Learn More</a>',
    '          </td>',
    '        </tr></table>',
    '      </td></tr>',
    '    </table>',
    '  </td></tr>',
    '  <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>',
    '  <tr><td>',
    '    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#111827;border-radius:16px;overflow:hidden;">',
    '      <tr><td style="padding:32px 40px;">',
    '        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">',
    '          <tr><td align="center" style="padding-bottom:16px;"><img src="https://lightningpiggy.com/images/mascot.png" alt="Lightning Piggy" width="40" height="40" style="display:block;width:40px;height:40px;border-radius:8px;"></td></tr>',
    '          <tr><td align="center" style="padding-bottom:20px;font-size:13px;line-height:20px;color:#9ca3af;">Bitcoin savings for the next generation.</td></tr>',
    '        </table>',
    '        <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr>',
    '          <td style="padding:0 8px;"><a href="https://primal.net/lightningpiggy"><img src="https://lightningpiggy.com/images/email/icon-nostr.png" alt="Nostr" width="24" height="24" style="display:block;width:24px;height:24px;"></a></td>',
    '          <td style="padding:0 8px;"><a href="https://x.com/lightningpiggy"><img src="https://lightningpiggy.com/images/email/icon-x.png" alt="X" width="24" height="24" style="display:block;width:24px;height:24px;"></a></td>',
    '          <td style="padding:0 8px;"><a href="https://t.me/LightningPiggy"><img src="https://lightningpiggy.com/images/email/icon-telegram.png" alt="Telegram" width="24" height="24" style="display:block;width:24px;height:24px;"></a></td>',
    '          <td style="padding:0 8px;"><a href="https://github.com/LightningPiggy"><img src="https://lightningpiggy.com/images/email/icon-github.png" alt="GitHub" width="24" height="24" style="display:block;width:24px;height:24px;"></a></td>',
    '        </tr></table>',
    '        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:20px;">',
    '          <tr><td style="border-bottom:1px solid #1f2937;height:1px;font-size:0;line-height:0;">&nbsp;</td></tr>',
    '        </table>',
    '        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px;">',
    '          <tr><td align="center" style="font-size:11px;line-height:18px;color:#4b5563;">&copy; 2026 Lightning Piggy Foundation. Open source, built with love.</td></tr>',
    '        </table>',
    '      </td></tr>',
    '    </table>',
    '  </td></tr>',
    '</table>',
    '</td></tr></table>',
    '</body></html>'
  ].join('\n');

  try {
    var res = await fetchWithRetry('https://api.resend.com/emails', {
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
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head>',
    '<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f5f5;"><tr><td align="center" style="padding:24px 16px;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;">',
    '  <tr><td align="center" style="padding:0 0 24px 0;">',
    '    <img src="https://lightningpiggy.com/images/email/lightningpiggy-logo.png" alt="Lightning Piggy" width="200" style="display:block;width:200px;max-width:200px;height:auto;">',
    '  </td></tr>',
    '  <tr><td>',
    '    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#ffffff;border-radius:16px;overflow:hidden;">',
    '      <tr><td style="background-color:#FFDB00;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>',
    '      <tr><td style="padding:40px 40px 24px 40px;">',
    '        <h1 style="margin:0;font-size:24px;font-weight:700;color:#111827;">New Newsletter Subscriber</h1>',
    '      </td></tr>',
    '      <tr><td style="padding:0 40px;"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td style="border-bottom:1px solid #f0f0f0;height:1px;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>',
    '      <tr><td style="padding:24px 40px 40px 40px;font-size:16px;line-height:26px;color:#525252;">',
    '        <p style="margin:0 0 8px 0;font-size:14px;color:#9ca3af;">Email address:</p>',
    '        <p style="margin:0;font-size:18px;font-weight:600;color:#EC008C;">' + subscriberEmail + '</p>',
    '      </td></tr>',
    '    </table>',
    '  </td></tr>',
    '</table>',
    '</td></tr></table>',
    '</body></html>'
  ].join('\n');

  try {
    var res = await fetchWithRetry('https://api.resend.com/emails', {
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
      // Send emails sequentially with a gap to stay under 2 req/s rate limit.
      // Each function has its own retry with exponential backoff on 429.
      await sendWelcomeEmail(apiKey, email);
      await sleep(600);
      await sendOwnerNotification(apiKey, email);

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

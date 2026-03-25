// Netlify serverless function: creates a BTCPay invoice for NIP-05 handle purchase.
// Uses a separate BTCPay store dedicated to NIP-05 sales.
//
// Environment variables required:
//   BTCPAY_NIP05_API_KEY   — Greenfield API key for the NIP-05 store
//   BTCPAY_NIP05_STORE_ID  — BTCPay store ID for NIP-05 sales
//   GITHUB_TOKEN           — for double-checking handle availability

const BTCPAY_URL = 'https://btcpay.lightningpiggy.com';

const GITHUB_REPO = 'LightningPiggy/website';
const NOSTR_JSON_PATH = 'public/.well-known/nostr.json';

const HANDLE_REGEX = /^[a-z0-9][a-z0-9_-]{0,30}[a-z0-9]$|^[a-z0-9]$/;

const RESERVED_HANDLES = [
  'richard', 'jake', 'thomas',
  'admin', 'lightningpiggy', 'piggy', 'oink', 'support', 'info',
  'help', 'team', 'official', 'foundation', 'mod', 'moderator',
  'www', 'mail', 'ftp', 'api', 'root', 'postmaster', 'webmaster',
  'test', 'null', 'undefined', 'noreply', 'no-reply'
];

// Inline bech32 decoder (from validate-profile.js)
var BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Decode(str) {
  str = str.toLowerCase();
  var pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length) return null;

  var dataStr = str.slice(pos + 1);
  var data = [];
  for (var i = 0; i < dataStr.length; i++) {
    var idx = BECH32_CHARSET.indexOf(dataStr[i]);
    if (idx === -1) return null;
    data.push(idx);
  }

  var values = data.slice(0, -6);
  var acc = 0;
  var bits = 0;
  var bytes = [];
  for (var j = 0; j < values.length; j++) {
    acc = (acc << 5) | values[j];
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }

  return bytes;
}

function npubToHex(npub) {
  if (!npub || !npub.startsWith('npub1')) return null;
  var bytes = bech32Decode(npub);
  if (!bytes || bytes.length !== 32) return null;
  return bytes.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

async function isHandleTaken(handle) {
  var token = process.env.GITHUB_TOKEN;
  if (!token) return true; // fail closed — reject rather than take money for a potentially unavailable handle

  try {
    var res = await fetch(
      'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + NOSTR_JSON_PATH,
      {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'LightningPiggy-NIP05'
        }
      }
    );
    if (!res.ok) return true; // fail closed

    var fileData = await res.json();
    var content = Buffer.from(fileData.content, 'base64').toString('utf8');
    var nostrData = JSON.parse(content);
    return !!(nostrData.names && nostrData.names[handle]);
  } catch (err) {
    console.error('Availability check failed:', err);
    return true; // fail closed
  }
}

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

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  var apiKey = process.env.BTCPAY_NIP05_API_KEY;
  var storeId = process.env.BTCPAY_NIP05_STORE_ID;
  if (!apiKey || !storeId) {
    console.error('BTCPAY_NIP05_API_KEY or BTCPAY_NIP05_STORE_ID not set');
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  var body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  var handle = (body.handle || '').trim().toLowerCase();
  var npub = (body.npub || '').trim();
  var amount = parseFloat(body.amount);

  // Validate handle
  if (!handle || !HANDLE_REGEX.test(handle)) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid handle format. Use lowercase letters, numbers, hyphens, and underscores (1-32 characters).' }) };
  }

  if (RESERVED_HANDLES.includes(handle)) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'This handle is reserved and cannot be purchased.' }) };
  }

  // Validate npub
  if (!npub || !/^npub1[a-z0-9]{58}$/.test(npub)) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid npub format. It should start with npub1 and be 63 characters long.' }) };
  }

  var hex = npubToHex(npub);
  if (!hex) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Could not decode npub. Please check and try again.' }) };
  }

  // Validate amount
  if (!amount || amount < 5 || amount > 10000) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Amount must be between $5 and $10,000.' }) };
  }

  // Double-check availability
  if (await isHandleTaken(handle)) {
    return { statusCode: 409, headers: corsHeaders(event), body: JSON.stringify({ error: 'This handle has already been taken. Please choose a different one.' }) };
  }

  // Create BTCPay invoice
  var invoicePayload = {
    amount: String(amount),
    currency: 'USD',
    metadata: {
      nip05Handle: handle.slice(0, 50),
      nostrNpub: npub.slice(0, 200),
      nostrHex: hex
    }
  };

  try {
    var response = await fetch(
      BTCPAY_URL + '/api/v1/stores/' + storeId + '/invoices',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify(invoicePayload)
      }
    );

    var data = await response.text();

    if (!response.ok) {
      console.error('BTCPay API error:', response.status, data);
      return {
        statusCode: response.status,
        headers: corsHeaders(event),
        body: JSON.stringify({ error: 'Failed to create invoice' })
      };
    }

    var invoice = JSON.parse(data);
    return {
      statusCode: 200,
      headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(event)),
      body: JSON.stringify({
        checkoutLink: invoice.checkoutLink,
        id: invoice.id
      })
    };
  } catch (err) {
    console.error('Error calling BTCPay API:', err);
    return {
      statusCode: 502,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: 'Failed to reach BTCPay Server' })
    };
  }
};

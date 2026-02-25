// Netlify serverless function: checks whether a requested NIP-05 handle
// is available for purchase by reading the current nostr.json from GitHub.
//
// Environment variable required:
//   GITHUB_TOKEN — fine-grained PAT with contents:read on this repo

const GITHUB_REPO = 'LightningPiggy/website';
const NOSTR_JSON_PATH = 'public/.well-known/nostr.json';

const HANDLE_REGEX = /^[a-z0-9][a-z0-9_-]{0,30}[a-z0-9]$|^[a-z0-9]$/;

const RESERVED_HANDLES = [
  // Existing team members
  'richard', 'jake', 'thomas',
  // System / brand names
  'admin', 'lightningpiggy', 'piggy', 'oink', 'support', 'info',
  'help', 'team', 'official', 'foundation', 'mod', 'moderator',
  'www', 'mail', 'ftp', 'api', 'root', 'postmaster', 'webmaster',
  'test', 'null', 'undefined', 'noreply', 'no-reply'
];

async function fetchNostrJson() {
  var token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN not set');
  }

  var res = await fetch(
    'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + NOSTR_JSON_PATH,
    {
      headers: {
        'Authorization': 'token ' + token,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'LightningPiggy-NIP05'
      }
    }
  );

  if (!res.ok) {
    var text = await res.text();
    throw new Error('GitHub API error: ' + res.status + ' ' + text);
  }

  var fileData = await res.json();
  var content = Buffer.from(fileData.content, 'base64').toString('utf8');
  return JSON.parse(content);
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  var handle = (event.queryStringParameters.handle || '').trim().toLowerCase();

  // Validate format
  if (!handle || !HANDLE_REGEX.test(handle)) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: false, reason: 'invalid' })
    };
  }

  // Check reserved list
  if (RESERVED_HANDLES.includes(handle)) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: false, reason: 'reserved' })
    };
  }

  // Check against live nostr.json via GitHub API (no CDN cache)
  try {
    var nostrData = await fetchNostrJson();
    if (nostrData.names && nostrData.names[handle]) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: false, reason: 'taken' })
      };
    }
  } catch (err) {
    console.error('Failed to check handle availability:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not check availability. Please try again.' })
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ available: true })
  };
};

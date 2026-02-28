// Netlify serverless function: fetches historical BTC prices from mempool.space
// and samples at weekly intervals for DCA savings calculations.
//
// No environment variables required — mempool.space API is free and keyless.

var ALLOWED_ORIGIN = 'https://lightningpiggy.com';
var MEMPOOL_API = 'https://mempool.space/api/v1/historical-price';
var CACHE_TTL = 60 * 60 * 1000; // 1 hour
var ONE_WEEK = 7 * 24 * 60 * 60; // seconds

// Module-level cache (persists in warm Lambda instances)
var cachedResult = null;
var cachedAt = 0;

function corsHeaders(event) {
  var origin = (event.headers || {}).origin || '';
  var allowed = (origin === ALLOWED_ORIGIN || origin.endsWith('.netlify.app')) ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event), body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders(event), body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  var now = Date.now();

  // Serve from cache if fresh
  if (cachedResult && (now - cachedAt) < CACHE_TTL) {
    return {
      statusCode: 200,
      headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }, corsHeaders(event)),
      body: cachedResult
    };
  }

  try {
    // Fetch full historical prices (hourly data back to ~2010)
    var res = await fetch(MEMPOOL_API + '?currency=USD');
    if (!res.ok) {
      throw new Error('mempool.space API returned ' + res.status);
    }

    var data = await res.json();
    if (!data.prices || !data.prices.length) {
      throw new Error('No price data returned');
    }

    var prices = data.prices;

    // Current price is the first entry (most recent)
    var currentPrice = Math.round(prices[0].USD);

    // Sample one data point per week in chronological order (oldest first).
    // Prices array is newest-first, so iterate from the end.
    var weeks = [];
    var lastTime = 0;

    for (var i = prices.length - 1; i >= 0; i--) {
      if (prices[i].USD) {
        if (lastTime === 0 || prices[i].time >= lastTime + ONE_WEEK) {
          weeks.push({
            time: prices[i].time,
            price: Math.round(prices[i].USD)
          });
          lastTime = prices[i].time;
        }
      }
    }

    var result = JSON.stringify({
      currentPrice: currentPrice,
      weeks: weeks,
      cachedAt: new Date().toISOString()
    });

    // Update cache
    cachedResult = result;
    cachedAt = now;

    return {
      statusCode: 200,
      headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }, corsHeaders(event)),
      body: result
    };
  } catch (err) {
    console.error('BTC weekly prices error:', err);

    // Serve stale cache if available
    if (cachedResult) {
      return {
        statusCode: 200,
        headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }, corsHeaders(event)),
        body: cachedResult
      };
    }

    return {
      statusCode: 503,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: 'Unable to fetch BTC price data' })
    };
  }
};

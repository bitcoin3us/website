// Netlify serverless function: fetches current and historical BTC price from
// mempool.space and calculates USD purchasing power loss over the last 10 years.
//
// No environment variables required — mempool.space API is free and keyless.

var ALLOWED_ORIGIN = 'https://lightningpiggy.com';
var MEMPOOL_API = 'https://mempool.space/api/v1/historical-price';
var CACHE_TTL = 60 * 60 * 1000; // 1 hour

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
      body: JSON.stringify(cachedResult)
    };
  }

  try {
    // Calculate timestamp for 10 years ago
    var tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    var historicalTimestamp = Math.floor(tenYearsAgo.getTime() / 1000);

    // Fetch current and historical prices in parallel
    var results = await Promise.all([
      fetch(MEMPOOL_API + '?currency=USD'),
      fetch(MEMPOOL_API + '?currency=USD&timestamp=' + historicalTimestamp)
    ]);

    var currentRes = results[0];
    var historicalRes = results[1];

    if (!currentRes.ok || !historicalRes.ok) {
      throw new Error('mempool.space API returned ' + currentRes.status + '/' + historicalRes.status);
    }

    var currentData = await currentRes.json();
    var historicalData = await historicalRes.json();

    // Current price: first entry in the prices array (most recent)
    if (!currentData.prices || !currentData.prices.length || !currentData.prices[0].USD) {
      throw new Error('Unexpected current price response format');
    }
    var currentPrice = currentData.prices[0].USD;

    // Historical price: first entry in the prices array for that timestamp
    if (!historicalData.prices || !historicalData.prices.length || !historicalData.prices[0].USD) {
      throw new Error('Unexpected historical price response format');
    }
    var historicalPrice = historicalData.prices[0].USD;

    // Calculate purchasing power loss
    var percentage = ((1 - (historicalPrice / currentPrice)) * 100).toFixed(1);

    // Format the historical date for display
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var histDate = new Date(historicalData.prices[0].time * 1000);
    var historicalDateLabel = months[histDate.getMonth()] + ' ' + histDate.getFullYear();
    var nowDate = new Date();
    var currentDateLabel = months[nowDate.getMonth()] + ' ' + nowDate.getFullYear();

    var result = {
      percentage: parseFloat(percentage),
      currentPrice: Math.round(currentPrice),
      historicalPrice: Math.round(historicalPrice),
      historicalDateLabel: historicalDateLabel,
      currentDateLabel: currentDateLabel,
      cachedAt: new Date().toISOString()
    };

    // Update cache
    cachedResult = result;
    cachedAt = now;

    return {
      statusCode: 200,
      headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }, corsHeaders(event)),
      body: JSON.stringify(result)
    };
  } catch (err) {
    console.error('BTC purchasing power error:', err);

    // Serve stale cache if available
    if (cachedResult) {
      return {
        statusCode: 200,
        headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }, corsHeaders(event)),
        body: JSON.stringify(cachedResult)
      };
    }

    return {
      statusCode: 503,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: 'Unable to fetch BTC price data' })
    };
  }
};

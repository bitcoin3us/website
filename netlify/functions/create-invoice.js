// Netlify serverless function: proxies donation invoice creation to BTCPay Server
// Keeps the API key server-side so it's never exposed to the browser.
//
// Environment variable required in Netlify:
//   BTCPAY_API_KEY — API key with btcpay.store.cancreateinvoice permission

const BTCPAY_URL = 'https://btcpay.lightningpiggy.com';
const STORE_ID = 'BhQL81NnJJwzP1zoyfYBGcHcXhCmKZTfrHNTva3Wks4h';

exports.handler = async function (event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.BTCPAY_API_KEY;
  if (!apiKey) {
    console.error('BTCPAY_API_KEY environment variable is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  // Parse and validate the request body
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const amount = parseFloat(body.amount);
  if (!amount || amount <= 0 || amount > 10000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid amount. Must be between $1 and $10,000.' }) };
  }

  // Build the BTCPay invoice payload
  const invoicePayload = {
    amount: String(amount),
    currency: 'USD',
    metadata: {}
  };

  // Only include metadata fields if provided
  if (body.metadata) {
    if (body.metadata.nostrNpub && typeof body.metadata.nostrNpub === 'string') {
      invoicePayload.metadata.nostrNpub = body.metadata.nostrNpub.trim().slice(0, 200);
    }
    if (body.metadata.xHandle && typeof body.metadata.xHandle === 'string') {
      invoicePayload.metadata.xHandle = body.metadata.xHandle.trim().slice(0, 100);
    }
    // Pass through validated avatar URL (only from trusted CDN sources)
    if (body.metadata.avatarUrl && typeof body.metadata.avatarUrl === 'string') {
      const url = body.metadata.avatarUrl.trim();
      if (url.startsWith('https://primal.b-cdn.net/') || url.startsWith('https://unavatar.io/')) {
        invoicePayload.metadata.avatarUrl = url.slice(0, 500);
      }
    }
  }

  try {
    const response = await fetch(
      `${BTCPAY_URL}/api/v1/stores/${STORE_ID}/invoices`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${apiKey}`
        },
        body: JSON.stringify(invoicePayload)
      }
    );

    const data = await response.text();

    if (!response.ok) {
      console.error('BTCPay API error:', response.status, data);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'Failed to create invoice' })
      };
    }

    // Parse and return only the fields the client needs
    const invoice = JSON.parse(data);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkoutLink: invoice.checkoutLink,
        id: invoice.id
      })
    };
  } catch (err) {
    console.error('Error calling BTCPay API:', err);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to reach BTCPay Server' })
    };
  }
};

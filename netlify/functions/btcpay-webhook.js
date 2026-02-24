// Netlify serverless function: receives BTCPay Server webhook on invoice settlement
// and sends an email notification with donation details via SMTP.
//
// Environment variables required in Netlify:
//   BTCPAY_WEBHOOK_SECRET — webhook secret configured in BTCPay Server
//   SMTP_HOST             — SMTP server hostname
//   SMTP_PORT             — SMTP port (587 for STARTTLS, 465 for SSL)
//   SMTP_USER             — SMTP username
//   SMTP_PASS             — SMTP password
//   SMTP_FROM             — sender email address (e.g. donations@lightningpiggy.com)

const crypto = require('crypto');
const nodemailer = require('nodemailer');

const BTCPAY_URL = 'https://btcpay.lightningpiggy.com';
const NOTIFICATION_EMAIL = 'oink@lightningpiggy.com';

function verifySignature(payload, secret, signatureHeader) {
  if (!signatureHeader) return false;
  // BTCPay sends: "sha256=HMAC_HEX"
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

function buildEmailText(invoice) {
  const amount = invoice.amount || 'N/A';
  const currency = invoice.currency || 'USD';
  const invoiceId = invoice.invoiceId || invoice.id || 'N/A';
  const metadata = invoice.metadata || {};

  let donorInfo = '';
  if (metadata.nostrNpub || metadata.xHandle) {
    donorInfo = 'Donor info:\n';
    if (metadata.nostrNpub) donorInfo += '  Nostr npub: ' + metadata.nostrNpub + '\n';
    if (metadata.xHandle) donorInfo += '  X handle: @' + metadata.xHandle.replace(/^@/, '') + '\n';
  } else {
    donorInfo = 'No donor info provided.\n';
  }

  return [
    'New donation received!',
    '',
    'Amount: $' + amount + ' ' + currency,
    'Invoice ID: ' + invoiceId,
    '',
    donorInfo,
    'View invoice: ' + BTCPAY_URL + '/invoices/' + invoiceId
  ].join('\n');
}

exports.handler = async function (event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Verify webhook secret is configured
  const webhookSecret = process.env.BTCPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('BTCPAY_WEBHOOK_SECRET environment variable is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  // Verify SMTP is configured
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('SMTP environment variables are not fully configured');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  // Validate webhook signature
  const rawBody = event.body || '';
  const signature = event.headers['btcpayserver-sig'] || event.headers['BTCPayServer-Sig'];

  if (!verifySignature(rawBody, webhookSecret, signature)) {
    console.error('Invalid webhook signature');
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  // Parse the webhook payload
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  // Only process invoice settled events
  const eventType = payload.type || '';
  if (eventType !== 'InvoiceSettled' && eventType !== 'InvoicePaymentSettled') {
    // Acknowledge but ignore other event types
    return { statusCode: 200, body: JSON.stringify({ status: 'ignored', eventType: eventType }) };
  }

  // Build and send email
  const emailText = buildEmailText(payload);
  const amount = payload.amount || '?';
  const currency = payload.currency || 'USD';

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: NOTIFICATION_EMAIL,
      subject: '\uD83D\uDCB0 New Lightning Piggy Donation \u2014 $' + amount + ' ' + currency,
      text: emailText
    });

    console.log('Donation notification email sent for invoice:', payload.invoiceId || payload.id);
    return { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };
  } catch (err) {
    console.error('Failed to send notification email:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send notification' }) };
  }
};

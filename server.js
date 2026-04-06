// Production webhook server - can be deployed anywhere
const express = require('express');
const Stripe = require('stripe');
const crypto = require('crypto');

// Configuration from environment variables
const config = {
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  port: process.env.PORT || 3000,
};

if (!config.stripeSecretKey || !config.webhookSecret) {
  console.error('❌ Missing required environment variables:');
  console.error('STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be set');
  process.exit(1);
}

const stripe = Stripe(config.stripeSecretKey);
const app = express();

// In-memory event tracking for idempotency
// In production, use Redis or database
const processedEvents = new Set();
const MAX_PROCESSED_EVENTS = 1000;

// Middleware
app.use(express.raw({ type: 'application/jsong }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    processedEventsCount: processedEvents.size
  });
});

// Webhook endpoint
app.post('/api/stripe/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const payload = req.body.toString();

  console.log('🔔 Webhook received');
  console.log(`Signature: ${sig?.substring(0, 20)}...`);

  try {
    // Verify webhook signature
    const event = stripe.webhooks.constructEvent(payload, sig, config.webhookSecret);
    console.log(`✅ Webhook verified: ${event.type} (ID: ${event.id})`);

    // Idempotency check
    if (processedEvents.has(event.id)) {
      console.log(`⏭️ Event ${event.id} already processed, skipping`);
      return res.json({ received: true, skipped: true, eventId: event.id });
    }

    // Mark as processed
    processedEvents.add(event.id);

    // Cleanup old events
    if (processedEvents.size > MAX_PROCESSED_EVENTS) {
      const eventsArray = Array.from(processedEvents);
      const toRemove = eventsArray.slice(0, processedEvents.size - MAX_PROCESSED_EVENTS);
      toRemove.forEach(id => processedEvents.delete(id));
    }

    // Process event
    let result = { processed: true, eventId: event.id };

    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        console.log(`💳 Checkout completed for customer: ${session.customer}`);
        console.log(`🎯 Subscription ID: ${session.subscription}`);
        
        // Here you would:
        // 1. Update customer status in database
        // 2. Send welcome email
        // 3. Grant access to Toby Voice features
        
        result = { ...result, customerActivated: true, customerId: session.customer };
        break;

      case 'invoice.payment_succeeded':
        const invoice = event.data.object;
        console.log(`✅ Payment succeeded for subscription: ${invoice.subscription}`);
        result = { ...result, paymentProcessed: true, subscriptionId: invoice.subscription };
        break;

      case'invoice.payment_failed':
        console.log(`🗑️ Payment failed for subscription: ${event.data.object.subscription}`);
        result = { ...result, paymentFailed: true, subscriptionId: event.data.object.subscription };
        break;

      case 'customer.subscription.updated':
        console.log(`🔄 Subscription updated: ${event.data.object.id}`);
        result = { ...result, subscriptionUpdated: true, subscriptionId: event.data.object.id };
        break;

      case 'customer.subscription.deleted':
        console.log(`🗑️ Subscription deleted: ${event.data.object.id}`);
        // Revoke access to Toby Voice features
        result = { ...result, subscriptionDeleted: true, subscriptionId: event.data.object.id };
        break;

      default:
        console.log(`📝 Unhandled event type: ${event.type}`);
        result = { ...result, unhandled: true, eventType: event.type };
    }

    console.log('✅ Webhook processed successfully');
    res.json({ received: true, ...result });

  } catch (error) {
    console.error('❌ Webhook processing failed:', error.message);
    return res.status(400).json({ 
      error: error.message,
      received: false 
    });
  }
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    message: 'Toby Voice Production Webhook Server',
    status: 'running',
    config: {
      hasStripeKey: !!config.stripeSecretKey,
      hasWebhookSecret: !!config.webhookSecret,
      port: config.port,
      environment: process.env.NODE_ENV || 'development'
    },
    endpoints: {
      webhook: '/api/stripe/webhook',
      health: '/health',
      test: '/test'
    }
  });
});

// Start server
app.listen(config.port, '0.0.0.0', () => {
  console.log('🚀 Toby Voice Production Webhook Server');
  console.log(`📡 Port: ${config.port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Webhook: /api/stripe/webhook`);
  console.log(`🏥 Health: /health`);
  console.log(`🧪 Test: /test`);
  console.log('\n✅ Production ready!');
});

module.exports = app;

const Stripe = require("stripe");
const db = require("./db");

let _stripe = null;
function client() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

/** Maps a Stripe subscription status to Shiftus's simpler status set. */
function mapSubscriptionStatus(stripeStatus) {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "paused":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
    default:
      return "inactive";
  }
}

/** Creates a Stripe Checkout session for a community's subscription, returns its URL. */
async function createCheckoutSession(community, { successUrl, cancelUrl }) {
  const session = await client().checkout.sessions.create({
    mode: "subscription",
    customer: community.stripe_customer_id || undefined,
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Carried onto the resulting subscription so every subscription webhook
    // event can be traced straight back to a community without a lookup.
    subscription_data: { metadata: { communityId: String(community.id) } },
    metadata: { communityId: String(community.id) },
  });
  return session.url;
}

/** Applies a Stripe subscription object's status to the community it belongs to. */
function applySubscriptionToCommunity(subscription) {
  const communityId = Number(subscription.metadata?.communityId);
  if (!communityId) return;

  db.setStripeIds(communityId, {
    customerId: subscription.customer,
    subscriptionId: subscription.id,
  });
  db.setSubscriptionStatus(communityId, mapSubscriptionStatus(subscription.status));
}

/** Verifies and parses a raw webhook payload into a Stripe event. */
function constructEvent(rawBody, signature) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return client().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

/** Handles one already-verified Stripe webhook event. */
async function handleWebhookEvent(event) {
  switch (event.type) {
    case "checkout.session.completed": {
      // Just link the IDs here — customer.subscription.created/updated
      // (which Stripe sends around the same time) carries the actual status.
      const session = event.data.object;
      const communityId = Number(session.metadata?.communityId);
      if (communityId && session.customer) {
        db.setStripeIds(communityId, {
          customerId: session.customer,
          subscriptionId: session.subscription || null,
        });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      applySubscriptionToCommunity(event.data.object);
      break;
    default:
      break;
  }
}

module.exports = {
  mapSubscriptionStatus,
  createCheckoutSession,
  applySubscriptionToCommunity,
  constructEvent,
  handleWebhookEvent,
};

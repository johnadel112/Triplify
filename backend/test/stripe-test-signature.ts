import Stripe from 'stripe';

// Local cryptographic fixture only; never a real Stripe account credential.
export const webhookTestSecret = 'whsec_triplify_local_test_fixture';
export function signedEvent(event: unknown) {
  const payload = JSON.stringify(event);
  const signature = new Stripe('sk_test_local_fixture').webhooks.generateTestHeaderString({
    payload, secret: webhookTestSecret,
  });
  return { payload, signature };
}

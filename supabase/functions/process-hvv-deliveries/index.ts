import { createAdminClient } from '../_shared/supabase.ts';
import { processHvvDelivery } from '../_shared/hvv-delivery.ts';

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

Deno.serve(async (req) => {
  const secret = Deno.env.get('HVV_WORKER_SECRET');
  if (req.method !== 'POST' || !secret || req.headers.get('x-worker-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }
  // A short batch; durable leases + cron recover from runtime termination.
  const client = createAdminClient();
  EdgeRuntime.waitUntil((async () => {
    try {
      for (let i=0; i<4; i++) {
        if (!await processHvvDelivery(client)) break;
      }
    } catch {
      console.error('Delivery worker failed; jobs remain recoverable');
    }
  })());
  return Response.json({ ok: true }, { status: 202 });
});

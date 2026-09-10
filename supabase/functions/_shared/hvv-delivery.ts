import { hvvCredentialsFromEnv, submitGameToHvv, refreshTournamentGamesFromHvv } from './hvv.ts';
import type { createAdminClient } from './supabase.ts';

export async function processHvvDelivery(client: ReturnType<typeof createAdminClient>) {
  const { data, error } = await client.rpc('claim_hvv_delivery');
  if (error) throw error;
  if (!data) return false;
  const { job, game } = data;
  let failure: string | null = null;
  try {
    const credentials = hvvCredentialsFromEnv();
    if (job.phase === 'score') {
      await submitGameToHvv(game, credentials);
      const { data: advanced, error: advanceError } = await client.rpc('advance_hvv_delivery', { p_game_id: game.id, p_lease: job.lease_token });
      if (advanceError) throw advanceError;
      if (!advanced) return false;
    }
    await refreshTournamentGamesFromHvv(client, game.tournament_id, credentials);
  } catch (error) {
    failure = error instanceof Error ? error.message : 'HVV-Uebertragung fehlgeschlagen';
  }
  const { error: finishError } = await client.rpc('finish_hvv_delivery', { p_game_id: game.id, p_lease: job.lease_token, p_error: failure });
  if (finishError) throw finishError;
  return true;
}

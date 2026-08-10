import { createId, dataMode, getSupabase, readStore, tournamentSelect, writeStore } from "./dataApiCore";
import type { Game, Tournament } from "./types";

export async function listTournaments(): Promise<Tournament[]> {
  if (dataMode === "local") {
    return readStore().tournaments;
  }

  const { data, error } = await getSupabase()
    .from("tournaments")
    .select(tournamentSelect)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getTournament(tournamentId?: string): Promise<Tournament> {
  if (dataMode === "local") {
    const store = readStore();
    return store.tournaments.find((item) => item.id === tournamentId) ?? store.tournaments[0];
  }

  const data = tournamentId ? await getTournamentById(tournamentId) : await getPrimaryTournament();
  const { data: games, error: gamesError } = await getSupabase()
    .from("games")
    .select("court")
    .eq("tournament_id", data.id);

  if (gamesError) {
    throw new Error(gamesError.message);
  }

  const gameCourts = games.map((game) => game.court).filter(Boolean) as string[];
  const courts = [...new Set([...(data.courts ?? []), ...gameCourts])];
  return { ...data, courts };
}

export async function getPublicTournament(tournamentId?: string): Promise<Tournament> {
  if (dataMode === "local") {
    return getTournament(tournamentId);
  }

  let query = getSupabase()
    .from("public_tournaments")
    .select(tournamentSelect);
  query = tournamentId
    ? query.eq("id", tournamentId)
    : query.order("created_at", { ascending: true }).limit(1);

  const { data, error } = await query.single();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function createTournament(params: Omit<Tournament, "id">): Promise<Tournament> {
  if (dataMode === "local") {
    const store = readStore();
    const tournament: Tournament = { id: createId("local-tournament"), ...params };
    writeStore({ ...store, tournaments: [...store.tournaments, tournament] });
    return tournament;
  }

  const { data, error } = await getSupabase()
    .from("tournaments")
    .insert({
      name: params.name,
      hvv_edit_url: params.hvv_edit_url,
      hvv_public_url: params.hvv_public_url,
      hvv_turnier_id: params.hvv_turnier_id ?? null,
      hvv_veranstaltung_id: params.hvv_veranstaltung_id ?? null,
      hvv_type: params.hvv_type ?? null,
      hvv_gender: params.hvv_gender ?? null,
      tournament_date: params.tournament_date ?? null,
      location: params.location ?? null,
      token_base_url: params.token_base_url,
      courts: params.courts,
      court_streams: params.court_streams,
    })
    .select(tournamentSelect)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function saveTournament(tournament: Tournament): Promise<Tournament> {
  if (dataMode === "local") {
    const store = readStore();
    writeStore({
      ...store,
      tournaments: store.tournaments.map((item) => item.id === tournament.id ? tournament : item),
    });
    return tournament;
  }

  const { data, error } = await getSupabase()
    .from("tournaments")
    .update({
      name: tournament.name,
      hvv_edit_url: tournament.hvv_edit_url,
      hvv_public_url: tournament.hvv_public_url,
      hvv_turnier_id: tournament.hvv_turnier_id ?? null,
      hvv_veranstaltung_id: tournament.hvv_veranstaltung_id ?? null,
      hvv_type: tournament.hvv_type ?? null,
      hvv_gender: tournament.hvv_gender ?? null,
      tournament_date: tournament.tournament_date ?? null,
      location: tournament.location ?? null,
      token_base_url: tournament.token_base_url,
      courts: tournament.courts,
      court_streams: tournament.court_streams,
    })
    .eq("id", tournament.id)
    .select(tournamentSelect)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteTournament(tournamentId: string): Promise<void> {
  if (dataMode === "local") {
    const store = readStore();
    writeStore({
      ...store,
      tournaments: store.tournaments.filter((tournament) => tournament.id !== tournamentId),
      games: store.games.filter((game) => game.tournament_id !== tournamentId),
      links: store.links.filter((link) => link.tournament_id !== tournamentId),
      admins: store.admins.map((admin) => ({
        ...admin,
        tournament_ids: admin.tournament_ids.filter((id) => id !== tournamentId),
      })),
    });
    return;
  }

  const { error } = await getSupabase()
    .from("tournaments")
    .delete()
    .eq("id", tournamentId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getPrimaryTournament(): Promise<Tournament> {
  const { data, error } = await getSupabase()
    .from("tournaments")
    .select(tournamentSelect)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getTournamentById(tournamentId: string): Promise<Tournament> {
  const { data, error } = await getSupabase()
    .from("tournaments")
    .select(tournamentSelect)
    .eq("id", tournamentId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

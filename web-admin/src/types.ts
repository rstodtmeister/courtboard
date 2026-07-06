export type Game = {
  id: string;
  tournament_id: string;
  number: string;
  game_date: string | null;
  court: string | null;
  team_a: string | null;
  team_b: string | null;
  team_a_players?: string[];
  team_b_players?: string[];
  referee: string | null;
  result: string | null;
  winner_team: string | null;
  edit_url?: string | null;
  edit_method?: string | null;
  edit_data?: string | null;
  game_rating: string | null;
  set1_team_a: string | null;
  set1_team_b: string | null;
  set2_team_a: string | null;
  set2_team_b: string | null;
  set3_team_a: string | null;
  set3_team_b: string | null;
  printed: boolean;
  dirty: boolean;
  completed: boolean;
  point_history?: string | null;
  score_locked_by_device?: string | null;
  score_locked_at?: string | null;
};

export type Tournament = {
  id: string;
  name: string;
  hvv_edit_url: string;
  hvv_public_url: string | null;
  token_base_url: string | null;
  courts: string[];
};

export type ScoreLinkResponse = {
  id: string;
  token: string;
};

export type ScoreLink = {
  id: string;
  tournament_id: string;
  game_id: string | null;
  court: string | null;
  token: string | null;
  expires_at: string | null;
  used_at: string | null;
  disabled_at: string | null;
  created_at: string;
  locked_game_id?: string | null;
  locked_by_device?: string | null;
};

export type ScoreEntryData = {
  link: {
    id: string;
    tournament_id?: string;
    game_id: string | null;
    court: string | null;
    expires_at: string | null;
    used_at: string | null;
  };
  games: Game[];
  allTeams?: string[];
};

export type AppSession = {
  user: {
    email: string;
  };
};

export type GameDraft = Pick<
  Game,
  | "court"
  | "referee"
  | "team_a"
  | "team_b"
  | "result"
  | "winner_team"
  | "game_rating"
  | "set1_team_a"
  | "set1_team_b"
  | "set2_team_a"
  | "set2_team_b"
  | "set3_team_a"
  | "set3_team_b"
  | "printed"
  | "completed"
  | "point_history"
>;

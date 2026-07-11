import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, createUserClient } from "../_shared/supabase.ts";

type HvvCredentials = {
  username?: string;
  password?: string;
};

type SyncGamesRequest = {
  tournamentId?: string;
  overwriteCourts?: boolean;
  overwriteReferees?: boolean;
  hvvCredentials?: HvvCredentials;
};

type ImportedGame = {
  tournament_id: string;
  number: string;
  game_date: string;
  court: string;
  team_a: string;
  team_b: string;
  referee: string;
  result: string;
  winner_team: string;
  edit_url: string;
  edit_method: string;
  edit_data: string;
  game_rating: string;
  set1_team_a: string;
  set1_team_b: string;
  set2_team_a: string;
  set2_team_b: string;
  set3_team_a: string;
  set3_team_b: string;
  printed: boolean;
  dirty: boolean;
  completed: boolean;
};

type HvvTournamentMetadata = {
  name: string;
  hvv_turnier_id: string;
  hvv_veranstaltung_id: string;
  hvv_type: string;
  hvv_gender: string;
  tournament_date: string;
  location: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const userClient = createUserClient(req);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  const adminClient = createAdminClient();
  const { data: adminUser, error: adminError } = await adminClient
    .from("admin_users")
    .select("user_id,role")
    .eq("user_id", userData.user.id)
    .eq("password_setup_required", false)
    .maybeSingle();

  if (adminError || !adminUser) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  const body = await req.json() as SyncGamesRequest;
  if (!body.tournamentId) {
    return jsonResponse({ error: "tournamentId is required" }, 400);
  }

  if (adminUser.role !== "superadmin") {
    const { data: assignment, error: assignmentError } = await adminClient
      .from("tournament_admins")
      .select("tournament_id")
      .eq("tournament_id", body.tournamentId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (assignmentError || !assignment) {
      return jsonResponse({ error: "Not authorized for this tournament" }, 403);
    }
  }

  const { data: tournament, error: tournamentError } = await adminClient
    .from("tournaments")
    .select("id,name,hvv_edit_url,hvv_public_url,hvv_turnier_id,hvv_veranstaltung_id")
    .eq("id", body.tournamentId)
    .single();

  if (tournamentError || !tournament) {
    return jsonResponse({ error: tournamentError?.message ?? "Tournament not found" }, 404);
  }

  const source = tournament.hvv_edit_url || tournament.hvv_public_url || "";
  if (!source) {
    return jsonResponse({ error: "Keine HVV-URL fuer dieses Turnier eingetragen." }, 400);
  }

  try {
    const page = await loadHvvPage(source, body.hvvCredentials ?? {}, {
      name: tournament.name,
      hvvTurnierId: tournament.hvv_turnier_id ?? "",
      hvvVeranstaltungId: tournament.hvv_veranstaltung_id ?? "",
    });
    const importedGames = parseBeachGames(page.html, page.url, tournament.id);

    if (page.metadata) {
      const { error: updateTournamentError } = await adminClient
        .from("tournaments")
        .update({
          name: page.metadata.name || tournament.name,
          hvv_turnier_id: page.metadata.hvv_turnier_id || null,
          hvv_veranstaltung_id: page.metadata.hvv_veranstaltung_id || null,
          hvv_type: page.metadata.hvv_type || null,
          hvv_gender: page.metadata.hvv_gender || null,
          tournament_date: page.metadata.tournament_date || null,
          location: page.metadata.location || null,
          hvv_public_url: page.metadata.hvv_veranstaltung_id
            ? new URL(`beach_beach_veranstaltung_spiele!browse.action?veranstaltungid=${page.metadata.hvv_veranstaltung_id}`, page.url).toString()
            : tournament.hvv_public_url,
        })
        .eq("id", tournament.id);

      if (updateTournamentError) {
        return jsonResponse({ error: updateTournamentError.message }, 500);
      }
    }

    const { error: linksDeleteError } = await adminClient
      .from("score_entry_links")
      .delete()
      .eq("tournament_id", tournament.id);

    if (linksDeleteError) {
      return jsonResponse({ error: linksDeleteError.message }, 500);
    }

    const { error: gamesDeleteError } = await adminClient
      .from("games")
      .delete()
      .eq("tournament_id", tournament.id);

    if (gamesDeleteError) {
      return jsonResponse({ error: gamesDeleteError.message }, 500);
    }

    if (importedGames.length > 0) {
      const { error: insertError } = await adminClient
        .from("games")
        .insert(importedGames);

      if (insertError) {
        return jsonResponse({ error: insertError.message }, 500);
      }
    }

    return jsonResponse({
      imported: importedGames.length,
      source,
      message: `Spiele von HVV neu geladen: ${page.title || source}`,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function loadHvvPage(
  source: string,
  credentials: HvvCredentials,
  tournamentHint: { name: string; hvvTurnierId: string; hvvVeranstaltungId: string },
) {
  const cookies = new Map<string, string>();
  const initialUrl = hvvInitialUrl(source);
  const first = await fetchWithSession(initialUrl, credentials, cookies);
  let html = await first.response.text();
  let url = first.response.url || initialUrl;

  if (hasCredentials(credentials) && isLoginPage(html)) {
    const login = loginRequest(html, url, credentials);
    const loginResponse = await fetchWithSession(login.url, credentials, cookies, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: login.body,
    });
    await loginResponse.response.arrayBuffer();

    const second = await fetchWithSession(initialUrl, credentials, cookies);
    html = await second.response.text();
    url = second.response.url || initialUrl;
  }

  if (isLoginPage(html)) {
    throw new Error("Anmeldung fehlgeschlagen oder Loginformular erneut angezeigt.");
  }

  let metadata: HvvTournamentMetadata | null = null;
  if (isTournamentOverview(html, url)) {
    const schedulePage = await resolveSchedulePageFromTournamentOverview(html, url, tournamentHint, credentials, cookies);
    metadata = schedulePage.metadata;
    html = schedulePage.html;
    url = schedulePage.url;
  } else if (isTournamentDetail(html, url)) {
    const schedulePage = await resolveSchedulePageFromTournamentDetail(html, url, credentials, cookies);
    metadata = schedulePage.metadata;
    html = schedulePage.html;
    url = schedulePage.url;
  }

  return { html, url, title: textContent(matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i)), metadata };
}

function hvvInitialUrl(source: string) {
  const url = new URL(source);
  if (/beach_beach_[^/]*!(?:browse|input|execute)(?:\.action)?/i.test(url.pathname)) {
    return url.toString();
  }

  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  url.search = "";
  url.hash = "";
  return new URL("beach_beach_turniere!browse.action", url).toString();
}

async function resolveSchedulePageFromTournamentOverview(
  html: string,
  overviewUrl: string,
  tournamentHint: { name: string; hvvTurnierId: string; hvvVeranstaltungId: string },
  credentials: HvvCredentials,
  cookies: Map<string, string>,
) {
  if (!tournamentHint.name.trim() && !tournamentHint.hvvTurnierId && !tournamentHint.hvvVeranstaltungId) {
    throw new Error("Zum Laden aus der HVV-Turnieruebersicht muss das Turnier einmal ueber eine HVV-Turnierdetail-URL geladen oder eindeutig benannt sein.");
  }

  const rows = tournamentOverviewRows(html);
  for (const row of rows) {
    const rowTurnierId = attr(matchFirst(row, /<input\b[^>]*name=["']ausg["'][^>]*>/i), "value");
    const eventUrl = eventUrlFromTournamentRow(row, overviewUrl);
    if (!eventUrl) {
      continue;
    }
    const rowEventId = eventIdFromUrl(eventUrl);
    if (tournamentHint.hvvTurnierId && rowTurnierId !== tournamentHint.hvvTurnierId) {
      continue;
    }
    if (tournamentHint.hvvVeranstaltungId && rowEventId !== tournamentHint.hvvVeranstaltungId) {
      continue;
    }

    const eventPage = await fetchWithSession(eventUrl, credentials, cookies);
    const eventHtml = await eventPage.response.text();
    const eventPageUrl = eventPage.response.url || eventUrl;
    const metadata = metadataFromEventPage(eventHtml, eventPageUrl, row, rowTurnierId);

    if (!tournamentHint.hvvTurnierId && !tournamentHint.hvvVeranstaltungId && normalizeToken(metadata.name) !== normalizeToken(tournamentHint.name)) {
      continue;
    }

    const eventId = metadata.hvv_veranstaltung_id;
    if (!eventId) {
      throw new Error(`HVV-Veranstaltung fuer "${tournamentHint.name}" gefunden, aber ohne Veranstaltung-ID.`);
    }

    const scheduleUrl = new URL(`beach_beach_veranstaltung_spiele!browse.action?veranstaltungid=${eventId}`, eventPageUrl).toString();
    const schedulePage = await fetchWithSession(scheduleUrl, credentials, cookies);
    return {
      html: await schedulePage.response.text(),
      url: schedulePage.response.url || scheduleUrl,
      metadata,
    };
  }

  throw new Error(`In der HVV-Turnieruebersicht wurde kein passendes Turnier gefunden.`);
}

async function resolveSchedulePageFromTournamentDetail(
  html: string,
  detailUrl: string,
  credentials: HvvCredentials,
  cookies: Map<string, string>,
) {
  const metadata = metadataFromTournamentDetail(html, detailUrl);
  if (!metadata.hvv_veranstaltung_id) {
    throw new Error("Auf der HVV-Turnierdetailseite wurde keine Veranstaltung-ID gefunden.");
  }

  const scheduleUrl = new URL(`beach_beach_veranstaltung_spiele!browse.action?veranstaltungid=${metadata.hvv_veranstaltung_id}`, detailUrl).toString();
  const schedulePage = await fetchWithSession(scheduleUrl, credentials, cookies);
  return {
    html: await schedulePage.response.text(),
    url: schedulePage.response.url || scheduleUrl,
    metadata,
  };
}

function isTournamentOverview(html: string, url: string) {
  return /id=["']turnierliste["']/i.test(html) || /beach_beach_turniere!browse/i.test(url);
}

function isTournamentDetail(html: string, url: string) {
  return /turnier_turnierid/i.test(html) || /beach_beach_turnier!browse/i.test(url);
}

function tournamentOverviewRows(html: string) {
  return [...html.matchAll(/<tr\b[^>]*class=["'](?:oddrow|evenrow)["'][^>]*>[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
}

function eventUrlFromTournamentRow(row: string, baseUrl: string) {
  const link = matchFirst(row, /<a\b[^>]*href=["'][^"']*beach_beach_veranstaltung!browse[^"']*veranstaltungid=\d+[^"']*["'][^>]*>[\s\S]*?<\/a>/i);
  const href = attr(link, "href").trim();
  return href ? new URL(href, baseUrl).toString() : "";
}

function eventIdFromUrl(url: string) {
  try {
    return new URL(url).searchParams.get("veranstaltungid") ?? "";
  } catch {
    return "";
  }
}

function labelTextById(html: string, id: string) {
  const escaped = escapeRegex(id);
  return textContent(matchFirst(html, new RegExp(`<label\\b[^>]*id=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/label>`, "i")));
}

function metadataFromTournamentDetail(html: string, pageUrl: string): HvvTournamentMetadata {
  const eventId = eventIdFromUrl(pageUrl) || attr(matchFirst(html, /<input\b[^>]*name=["']veranstaltungid["'][^>]*>/i), "value");
  const turnierId = new URL(pageUrl).searchParams.get("turnierid") ||
    labelTextById(html, "turnier_turnierid") ||
    fieldValueByFor(html, "turnier_turnierid");
  const name = labelTextById(html, "turnier_veranstaltung_bezeichnung") ||
    fieldValueByFor(html, "turnier_veranstaltung_bezeichnung") ||
    labelTextById(html, "veranstaltung_bezeichnung") ||
    fieldValueByFor(html, "veranstaltung_bezeichnung");

  return {
    name,
    hvv_turnier_id: turnierId,
    hvv_veranstaltung_id: eventId,
    hvv_type: fieldValueByFor(html, "turnier_typ_path") || fieldValueByFor(html, "turnier_subtyp"),
    hvv_gender: genderFromHtml(fieldCellByFor(html, "turnier_geschlecht")),
    tournament_date: fieldValueByFor(html, "turnier_hfvon") || firstDateFromText(textContent(matchFirst(html, /<div id=["']path["'][\s\S]*?<\/div>/i))),
    location: labelTextById(html, "turnier_veranstaltung_ort") ||
      fieldValueByFor(html, "turnier_veranstaltung_ort") ||
      labelTextById(html, "veranstaltung_ort") ||
      fieldValueByFor(html, "veranstaltung_ort"),
  };
}

function metadataFromEventPage(html: string, pageUrl: string, overviewRow: string, rowTurnierId: string): HvvTournamentMetadata {
  const tournamentRow = tournamentRowFromEventPage(html, rowTurnierId);
  const eventName = labelTextById(html, "veranstaltung_bezeichnung") ||
    fieldValueByFor(html, "veranstaltung_bezeichnung") ||
    labelTextById(html, "turnier_veranstaltung_bezeichnung") ||
    fieldValueByFor(html, "turnier_veranstaltung_bezeichnung") ||
    textContent(matchFirst(html, /<div[^>]*font-size:14px[\s\S]*?<\/div>/i));

  return {
    name: eventName,
    hvv_turnier_id: rowTurnierId,
    hvv_veranstaltung_id: eventIdFromUrl(pageUrl),
    hvv_type: textByColumn(tournamentRow, 1) || textByColumn(overviewRow, 2),
    hvv_gender: genderFromHtml(cellByColumn(tournamentRow, 3) || cellByColumn(overviewRow, 4)),
    tournament_date: textByColumn(tournamentRow, 0) || textByColumn(overviewRow, 3),
    location: fieldValueByFor(html, "veranstaltung_ort") || textByColumn(overviewRow, 5),
  };
}

function tournamentRowFromEventPage(html: string, turnierId: string) {
  if (!turnierId) {
    return "";
  }
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
    const row = rowMatch[0];
    if (new RegExp(`turnierid["']?\\s*[^>]*value=["']?${escapeRegex(turnierId)}\\b|turnierid=${escapeRegex(turnierId)}\\b`, "i").test(row)) {
      return row;
    }
  }
  return "";
}

function fieldValueByFor(html: string, forId: string) {
  return textContent(fieldCellByFor(html, forId));
}

function fieldCellByFor(html: string, forId: string) {
  const escaped = escapeRegex(forId);
  const row = matchFirst(html, new RegExp(`<tr\\b[^>]*>[\\s\\S]*?<label\\b[^>]*for=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/label>[\\s\\S]*?<\\/tr>`, "i"));
  const cells = [...row.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/gi)].map((match) => match[0]);
  return cells.length > 1 ? cells[1] : "";
}

function genderFromHtml(html: string) {
  const img = matchFirst(html, /<img\b[^>]*>/i);
  const normalized = normalizeToken(`${textContent(html)} ${attr(img, "src")} ${attr(img, "alt")} ${attr(img, "title")}`);
  if (normalized.includes("mixed")) {
    return "Mixed";
  }
  if (normalized.includes("female") || normalized.includes("weiblich") || normalized.includes("damen")) {
    return "weiblich";
  }
  if (normalized.includes("male") || normalized.includes("maennlich") || normalized.includes("herren")) {
    return "maennlich";
  }
  return textContent(html);
}

function firstDateFromText(value: string) {
  return value.match(/\b\d{2}\.\d{2}\.\d{4}\b/)?.[0] ?? "";
}

async function fetchWithSession(
  url: string,
  credentials: HvvCredentials,
  cookies: Map<string, string>,
  init: RequestInit = {},
) {
  let currentUrl = url;
  let currentInit = init;
  for (let redirectCount = 0; redirectCount < 8; redirectCount++) {
    const response = await fetchOnce(currentUrl, credentials, cookies, currentInit);
    if (!isRedirect(response.status)) {
      if (!response.ok) {
        throw new Error(`HVV-Abruf fehlgeschlagen (${response.status}).`);
      }
      return { response };
    }

    const location = response.headers.get("location");
    await response.arrayBuffer();
    if (!location) {
      throw new Error("HVV-Redirect ohne Ziel-URL.");
    }

    currentUrl = new URL(location, currentUrl).toString();
    currentInit = redirectInit(currentInit, response.status);
  }

  throw new Error("HVV-Abruf hat zu viele Weiterleitungen erzeugt.");
}

async function fetchOnce(
  url: string,
  credentials: HvvCredentials,
  cookies: Map<string, string>,
  init: RequestInit,
) {
  const headers = new Headers(init.headers);
  headers.set("User-Agent", "CourtBoard/1.0");
  if (hasCredentials(credentials)) {
    headers.set("Authorization", basicAuthHeader(credentials));
  }
  if (cookies.size > 0) {
    headers.set("Cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
  }

  const response = await fetch(url, { ...init, headers, redirect: "manual" });
  storeCookies(response.headers, cookies);
  return response;
}

function isRedirect(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function redirectInit(init: RequestInit, status: number): RequestInit {
  if (status === 307 || status === 308) {
    return init;
  }
  return { method: "GET" };
}

function storeCookies(headers: Headers, cookies: Map<string, string>) {
  const getSetCookie = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const values = getSetCookie ? getSetCookie.call(headers) : splitSetCookie(headers.get("set-cookie") ?? "");
  for (const value of values) {
    const pair = value.split(";", 1)[0] ?? "";
    const separator = pair.indexOf("=");
    if (separator > 0) {
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }
}

function splitSetCookie(value: string) {
  if (!value) {
    return [];
  }
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/);
}

function isLoginPage(html: string) {
  return /<form[^>]*(id|name)=["']core_login["'][^>]*>/i.test(html);
}

function loginRequest(html: string, pageUrl: string, credentials: HvvCredentials) {
  const form = matchFirst(html, /<form[^>]*(?:id|name)=["']core_login["'][^>]*>[\s\S]*?<\/form>/i);
  if (!form) {
    throw new Error("Loginformular wurde nicht gefunden.");
  }

  const action = attr(form, "action");
  if (!action) {
    throw new Error("Loginformular hat keine gueltige Ziel-URL.");
  }

  const params = new URLSearchParams();
  const inputs = form.matchAll(/<input\b[^>]*>/gi);
  let submitAdded = false;
  for (const inputMatch of inputs) {
    const input = inputMatch[0];
    const name = attr(input, "name");
    if (!name) {
      continue;
    }
    const type = attr(input, "type").toLowerCase();
    if (name === "username") {
      params.set(name, credentials.username ?? "");
    } else if (name === "password") {
      params.set(name, credentials.password ?? "");
    } else if (type === "submit") {
      if (!submitAdded) {
        params.set(name, attr(input, "value"));
        submitAdded = true;
      }
    } else {
      params.set(name, attr(input, "value"));
    }
  }

  return { url: new URL(action, pageUrl).toString(), body: params.toString() };
}

function parseBeachGames(html: string, baseUrl: string, tournamentId: string): ImportedGame[] {
  const rows = html.matchAll(/<tr\b[^>]*class=["'][^"']*\bbeachspielrow\b[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi);
  const games: ImportedGame[] = [];

  for (const rowMatch of rows) {
    const row = rowMatch[0];
    const date = textByColumn(row, 1);
    const court = textByDataContent(row, "court") || textByColumn(row, 3);
    const number = textByColumn(row, 6);
    const teamA = textByDataContent(row, "teamA") || textByColumn(row, 7);
    const teamB = textByDataContent(row, "teamB") || textByColumn(row, 8);
    const result = textByDataContent(row, "ergebnis") || textByDataContent(row, "result") ||
      textByDataContent(row, "score") || textByColumn(row, 9);
    const referee = textByDataContent(row, "schiri1") || textByColumn(row, 10);

    if (!teamA && !teamB && !referee) {
      continue;
    }

    const edit = editRequest(row, baseUrl);
    const scores = setScores(result);
    const winner = winnerTeam(row);
    games.push({
      tournament_id: tournamentId,
      number,
      game_date: date,
      court,
      team_a: teamA,
      team_b: teamB,
      referee,
      result,
      winner_team: winner === 0 ? "" : String(winner),
      edit_url: edit.url,
      edit_method: edit.method,
      edit_data: edit.data,
      game_rating: "",
      set1_team_a: scores[0],
      set1_team_b: scores[1],
      set2_team_a: scores[2],
      set2_team_b: scores[3],
      set3_team_a: scores[4],
      set3_team_b: scores[5],
      printed: false,
      dirty: false,
      completed: Boolean(result || winner),
    });
  }

  return games;
}

function editRequest(row: string, baseUrl: string) {
  const form = matchFirst(row, /<form\b[^>]*action=["'][^"']+["'][^>]*>[\s\S]*?<\/form>/i);
  if (form) {
    const action = attr(form, "action");
    const method = attr(form, "method") || "GET";
    return {
      url: new URL(action, baseUrl).toString(),
      method: method.toUpperCase(),
      data: encodeFormData(form),
    };
  }

  const links = [...row.matchAll(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi)].map((match) => match[0]);
  for (const link of links) {
    const linkText = clean(`${textContent(link)} ${attr(link, "title")} ${attr(link, "class")} ${attr(link, "href")}`).toLowerCase();
    if (linkText.includes("bearbeit") || linkText.includes("edit")) {
      return { url: new URL(attr(link, "href"), baseUrl).toString(), method: "GET", data: "" };
    }
  }

  if (links.length === 1) {
    return { url: new URL(attr(links[0], "href"), baseUrl).toString(), method: "GET", data: "" };
  }
  return { url: "", method: "GET", data: "" };
}

function encodeFormData(form: string) {
  const params = new URLSearchParams();
  for (const inputMatch of form.matchAll(/<input\b[^>]*>/gi)) {
    const input = inputMatch[0];
    const name = attr(input, "name");
    if (!name) {
      continue;
    }
    const type = attr(input, "type").toLowerCase();
    if (["button", "file", "image"].includes(type)) {
      continue;
    }
    if ((type === "checkbox" || type === "radio") && !/\schecked(?:\s|=|>)/i.test(input)) {
      continue;
    }
    params.set(name, attr(input, "value"));
  }
  return params.toString();
}

function textByColumn(row: string, index: number) {
  const cells = [...row.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/gi)].map((match) => match[0]);
  return index >= 0 && index < cells.length ? textContent(cells[index]) : "";
}

function textByDataContent(row: string, dataContent: string) {
  const escaped = escapeRegex(dataContent);
  const pattern = new RegExp(`<t[dh]\\b[^>]*data-content=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/t[dh]>`, "i");
  return textContent(matchFirst(row, pattern));
}

function winnerTeam(row: string) {
  if (isWinnerCell(cellByDataContent(row, "teamA") || cellByColumn(row, 7)) === isWinnerCell(cellByDataContent(row, "teamB") || cellByColumn(row, 8))) {
    return 0;
  }
  return isWinnerCell(cellByDataContent(row, "teamA") || cellByColumn(row, 7)) ? 1 : 2;
}

function cellByColumn(row: string, index: number) {
  const cells = [...row.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/gi)].map((match) => match[0]);
  return index >= 0 && index < cells.length ? cells[index] : "";
}

function cellByDataContent(row: string, dataContent: string) {
  const escaped = escapeRegex(dataContent);
  return matchFirst(row, new RegExp(`<t[dh]\\b[^>]*data-content=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/t[dh]>`, "i"));
}

function isWinnerCell(cell: string) {
  return /<(strong|b)\b/i.test(cell) ||
    /class=["'][^"']*(winner|gewinner|won|bold)[^"']*["']/i.test(cell) ||
    /font-weight\s*:\s*(bold|bolder|[789]00)/i.test(cell);
}

function setScores(result: string) {
  const scores = ["", "", "", "", "", ""];
  let index = 0;
  for (const match of result.matchAll(/(\d{1,2})\s*[:-]\s*(\d{1,2})/g)) {
    if (index >= scores.length) {
      break;
    }
    scores[index++] = match[1];
    scores[index++] = match[2];
  }
  return scores;
}

function attr(html: string, name: string) {
  const escaped = escapeRegex(name);
  const match = html.match(new RegExp(`\\b${escaped}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeEntities(match?.[2] ?? match?.[3] ?? match?.[4] ?? "");
}

function textContent(html: string | undefined) {
  return clean(decodeEntities((html ?? "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")));
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
    auml: "ä",
    Auml: "Ä",
    ouml: "ö",
    Ouml: "Ö",
    uuml: "ü",
    Uuml: "Ü",
    szlig: "ß",
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z]+);/g, (_entity, code: string) => {
    if (code.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return named[code] ?? `&${code};`;
  });
}

function normalizeToken(value: string) {
  return value.toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replaceAll(/[^a-z0-9]+/g, "");
}

function matchFirst(value: string, pattern: RegExp) {
  return value.match(pattern)?.[0] ?? "";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasCredentials(credentials: HvvCredentials) {
  return Boolean(credentials.username && credentials.password);
}

function basicAuthHeader(credentials: HvvCredentials) {
  return `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`;
}

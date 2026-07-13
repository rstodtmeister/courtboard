export type HvvCredentials = {
  username?: string;
  password?: string;
};

export type HvvGameUpdate = {
  edit_url?: string | null;
  edit_method?: string | null;
  edit_data?: string | null;
  court?: string | null;
  referee?: string | null;
  game_rating?: string | null;
  set1_team_a?: string | null;
  set1_team_b?: string | null;
  set2_team_a?: string | null;
  set2_team_b?: string | null;
  set3_team_a?: string | null;
  set3_team_b?: string | null;
};

type HvvScheduleGame = {
  number: string;
  round: string;
  game_date: string;
  team_a: string;
  team_b: string;
  edit_url: string;
  edit_method: string;
  edit_data: string;
};

export function hvvCredentialsFromEnv(): HvvCredentials {
  return {
    username: Deno.env.get("HVV_USERNAME") ?? "",
    password: Deno.env.get("HVV_PASSWORD") ?? "",
  };
}

export function hasHvvCredentials(credentials: HvvCredentials) {
  return Boolean(credentials.username && credentials.password);
}

export async function submitGameToHvv(game: HvvGameUpdate, credentials: HvvCredentials) {
  if (!hasHvvCredentials(credentials)) {
    throw new Error("HVV-Zugangsdaten fehlen.");
  }
  if (!game.edit_url) {
    throw new Error("Fuer das Spiel wurde kein Bearbeiten-Link gefunden.");
  }
  if (!game.edit_url.startsWith("http://") && !game.edit_url.startsWith("https://")) {
    throw new Error(`Bearbeiten-Link ist keine Web-URL: ${game.edit_url}`);
  }

  const cookies = new Map<string, string>();
  const editPage = await loadEditPage(game, credentials, cookies);
  const form = gameEditForm(editPage.html);
  if (!form) {
    throw new Error("Auf der Bearbeiten-Seite wurde kein Spiel-Formular gefunden.");
  }

  const formFields = formData(form.html);
  const resetResult = isNormalRating(game.game_rating) && !hasSetScores(game);
  let changedFields = 0;
  changedFields += replaceFormValue(form.html, formFields, game.court ?? "", ["court", "feld", "platz"]);
  changedFields += replaceFormValue(form.html, formFields, game.referee ?? "", ["schiri", "schieds", "referee"]);
  changedFields += replaceGameRating(form.html, formFields, game.game_rating ?? "");
  changedFields += replaceFormValue(form.html, formFields, scoreValue(game.set1_team_a, resetResult), ["s1pa", "satz1teama", "satz1a", "set1teama", "set1a"]);
  changedFields += replaceFormValue(form.html, formFields, scoreValue(game.set1_team_b, resetResult), ["s1pb", "satz1teamb", "satz1b", "set1teamb", "set1b"]);
  changedFields += replaceFormValue(form.html, formFields, scoreValue(game.set2_team_a, resetResult), ["s2pa", "satz2teama", "satz2a", "set2teama", "set2a"]);
  changedFields += replaceFormValue(form.html, formFields, scoreValue(game.set2_team_b, resetResult), ["s2pb", "satz2teamb", "satz2b", "set2teamb", "set2b"]);
  changedFields += replaceFormValue(form.html, formFields, scoreValue(game.set3_team_a, resetResult), ["s3pa", "satz3teama", "satz3a", "set3teama", "set3a"]);
  changedFields += replaceFormValue(form.html, formFields, scoreValue(game.set3_team_b, resetResult), ["s3pb", "satz3teamb", "satz3b", "set3teamb", "set3b"]);

  if (changedFields === 0) {
    throw new Error("Keine passenden Formularfelder fuer die HVV-Uebertragung gefunden.");
  }

  addSubmitButtonValue(form.html, formFields);
  const action = attr(form.openingTag, "action");
  const actionUrl = action ? new URL(action, editPage.url).toString() : editPage.url;
  const method = (attr(form.openingTag, "method") || "POST").toUpperCase();
  const response = await fetchWithSession(actionUrl, credentials, cookies, {
    method,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(formFields).toString(),
  });
  await response.text();
}

export async function refreshTournamentGamesFromHvv(
  adminClient: { from: (table: string) => any },
  tournamentId: string,
  credentials: HvvCredentials,
) {
  const { data: tournament, error } = await adminClient
    .from("tournaments")
    .select("name,hvv_edit_url,hvv_public_url")
    .eq("id", tournamentId)
    .single();

  if (error || !tournament) {
    throw new Error(error?.message ?? "Tournament not found");
  }

  const source = hvvSourceUrl(tournament.hvv_edit_url, tournament.hvv_public_url);
  if (!source) {
    return 0;
  }

  const page = await loadSchedulePage(source, credentials, tournament.name ?? "");
  const games = parseScheduleGames(page.html, page.url);
  let updated = 0;
  for (const game of games) {
    const { error: updateError } = await adminClient
      .from("games")
      .update({
        round: game.round,
        game_date: game.game_date,
        team_a: game.team_a,
        team_b: game.team_b,
        edit_url: game.edit_url,
        edit_method: game.edit_method,
        edit_data: game.edit_data,
      })
      .eq("tournament_id", tournamentId)
      .eq("number", game.number);

    if (updateError) {
      throw new Error(updateError.message);
    }
    updated++;
  }
  return updated;
}

async function loadSchedulePage(source: string, credentials: HvvCredentials, tournamentName: string) {
  const cookies = new Map<string, string>();
  const initialUrl = hvvInitialUrl(source);
  let response = await fetchWithSession(initialUrl, credentials, cookies);
  let html = await response.text();
  let url = response.url || initialUrl;

  if (hasHvvCredentials(credentials) && isLoginPage(html)) {
    const login = loginRequest(html, url, credentials);
    const loginResponse = await fetchWithSession(login.url, credentials, cookies, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: login.body,
    });
    await loginResponse.arrayBuffer();

    response = await fetchWithSession(initialUrl, credentials, cookies);
    html = await response.text();
    url = response.url || initialUrl;
  }

  if (isLoginPage(html)) {
    throw new Error("Anmeldung fehlgeschlagen oder Loginformular erneut angezeigt.");
  }

  if (isTournamentOverview(html, url)) {
    const schedulePage = await resolveSchedulePageFromTournamentOverview(html, url, tournamentName, credentials, cookies);
    html = schedulePage.html;
    url = schedulePage.url;
  } else if (isTournamentDetail(html, url)) {
    const schedulePage = await resolveSchedulePageFromTournamentDetail(html, url, credentials, cookies);
    html = schedulePage.html;
    url = schedulePage.url;
  } else if (isTournamentEvent(html, url)) {
    const schedulePage = await resolveSchedulePageFromTournamentEvent(html, url, credentials, cookies);
    html = schedulePage.html;
    url = schedulePage.url;
  }

  return { html, url };
}

function hvvSourceUrl(editUrl: string | null, publicUrl: string | null) {
  const publicSource = publicUrl?.trim() ?? "";
  if (publicSource && /beach_beach_veranstaltung_spiele!browse/i.test(publicSource)) {
    return publicSource;
  }
  return editUrl || publicSource;
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
  tournamentName: string,
  credentials: HvvCredentials,
  cookies: Map<string, string>,
) {
  if (!tournamentName.trim()) {
    throw new Error("Zum Laden aus der HVV-Turnieruebersicht muss das CourtBoard-Turnier einen Namen haben.");
  }

  for (const row of tournamentOverviewRows(html)) {
    const eventUrl = eventUrlFromTournamentRow(row, overviewUrl);
    if (!eventUrl) {
      continue;
    }

    const eventResponse = await fetchWithSession(eventUrl, credentials, cookies);
    const eventHtml = await eventResponse.text();
    const eventPageUrl = eventResponse.url || eventUrl;
    const eventName = labelTextById(eventHtml, "veranstaltung_bezeichnung") ||
      labelTextById(eventHtml, "turnier_veranstaltung_bezeichnung") ||
      textContent(matchFirst(eventHtml, /<div[^>]*font-size:14px[\s\S]*?<\/div>/i));

    if (normalizeToken(eventName) !== normalizeToken(tournamentName)) {
      continue;
    }

    const eventId = eventIdFromUrl(eventPageUrl) || eventIdFromUrl(eventUrl);
    if (!eventId) {
      throw new Error(`HVV-Veranstaltung fuer "${tournamentName}" gefunden, aber ohne Veranstaltung-ID.`);
    }

    const scheduleUrl = new URL(`beach_beach_veranstaltung_spiele!browse.action?veranstaltungid=${eventId}`, eventPageUrl).toString();
    const scheduleResponse = await fetchWithSession(scheduleUrl, credentials, cookies);
    return {
      html: await scheduleResponse.text(),
      url: scheduleResponse.url || scheduleUrl,
    };
  }

  throw new Error(`In der HVV-Turnieruebersicht wurde kein Turnier mit der Veranstaltungsbezeichnung "${tournamentName}" gefunden.`);
}

async function resolveSchedulePageFromTournamentDetail(
  html: string,
  detailUrl: string,
  credentials: HvvCredentials,
  cookies: Map<string, string>,
) {
  const eventId = eventIdFromUrl(detailUrl) || attr(matchFirst(html, /<input\b[^>]*name=["']veranstaltungid["'][^>]*>/i), "value");
  if (!eventId) {
    throw new Error("Auf der HVV-Turnierdetailseite wurde keine Veranstaltung-ID gefunden.");
  }

  const scheduleUrl = new URL(`beach_beach_veranstaltung_spiele!browse.action?veranstaltungid=${eventId}`, detailUrl).toString();
  const scheduleResponse = await fetchWithSession(scheduleUrl, credentials, cookies);
  return {
    html: await scheduleResponse.text(),
    url: scheduleResponse.url || scheduleUrl,
  };
}

async function resolveSchedulePageFromTournamentEvent(
  html: string,
  eventUrl: string,
  credentials: HvvCredentials,
  cookies: Map<string, string>,
) {
  const eventId = eventIdFromUrl(eventUrl) || attr(matchFirst(html, /<input\b[^>]*name=["']veranstaltungid["'][^>]*>/i), "value");
  if (!eventId) {
    throw new Error("Auf der HVV-Veranstaltungsseite wurde keine Veranstaltung-ID gefunden.");
  }

  const scheduleUrl = new URL(`beach_beach_veranstaltung_spiele!browse.action?veranstaltungid=${eventId}`, eventUrl).toString();
  const scheduleResponse = await fetchWithSession(scheduleUrl, credentials, cookies);
  return {
    html: await scheduleResponse.text(),
    url: scheduleResponse.url || scheduleUrl,
  };
}

async function loadEditPage(game: HvvGameUpdate, credentials: HvvCredentials, cookies: Map<string, string>) {
  let response = await executeEditRequest(game, credentials, cookies);
  let html = await response.text();
  let url = response.url || game.edit_url!;

  if (isLoginPage(html)) {
    const login = loginRequest(html, url, credentials);
    const loginResponse = await fetchWithSession(login.url, credentials, cookies, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: login.body,
    });
    await loginResponse.arrayBuffer();

    response = await executeEditRequest(game, credentials, cookies);
    html = await response.text();
    url = response.url || game.edit_url!;
  }

  if (isLoginPage(html)) {
    throw new Error("Anmeldung fehlgeschlagen oder Loginformular erneut angezeigt.");
  }

  return { html, url };
}

function executeEditRequest(game: HvvGameUpdate, credentials: HvvCredentials, cookies: Map<string, string>) {
  const method = game.edit_method?.toUpperCase() === "POST" ? "POST" : "GET";
  return fetchWithSession(game.edit_url!, credentials, cookies, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
    body: method === "POST" ? game.edit_data ?? "" : undefined,
  });
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
      return response;
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
  if (hasHvvCredentials(credentials)) {
    headers.set("Authorization", `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`);
  }
  if (cookies.size > 0) {
    headers.set("Cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
  }

  const response = await fetch(url, { ...init, headers, redirect: "manual" });
  storeCookies(response.headers, cookies);
  return response;
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
  return value ? value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/) : [];
}

function isRedirect(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function redirectInit(init: RequestInit, status: number): RequestInit {
  return status === 307 || status === 308 ? init : { method: "GET" };
}

function isLoginPage(html: string) {
  return /<form[^>]*(id|name)=["']core_login["'][^>]*>/i.test(html);
}

function loginRequest(html: string, pageUrl: string, credentials: HvvCredentials) {
  const form = loginForm(html);
  if (!form) {
    throw new Error("Loginformular wurde nicht gefunden.");
  }

  const action = attr(form, "action");
  if (!action) {
    throw new Error("Loginformular hat keine gueltige Ziel-URL.");
  }

  const params = new URLSearchParams();
  let submitAdded = false;
  for (const inputMatch of form.matchAll(/<input\b[^>]*>/gi)) {
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

function loginForm(html: string) {
  const forms = [...html.matchAll(/<form\b[^>]*(?:id|name)=["']core_login["'][^>]*>[\s\S]*?<\/form>/gi)]
    .map((match) => match[0]);
  return forms.find((form) => /name=["']global\.button\.login["']/i.test(form)) ||
    forms.find((form) => /name=["']password["']/i.test(form)) ||
    "";
}

function gameEditForm(html: string) {
  for (const formMatch of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)) {
    const form = formMatch[0];
    if (/name=["']spielid["']|name=["']court["']|name=["']wertungid["']|name=["']s1pa["']|name=["']s1pb["']/i.test(form)) {
      const openingTag = form.match(/<form\b[^>]*>/i)?.[0] ?? "";
      return { html: form, openingTag };
    }
  }
  return null;
}

function formData(form: string) {
  const data: Record<string, string> = {};
  for (const inputMatch of form.matchAll(/<input\b[^>]*>/gi)) {
    const input = inputMatch[0];
    const name = attr(input, "name");
    if (!name) {
      continue;
    }
    const type = attr(input, "type").toLowerCase();
    if (["submit", "button", "image", "file"].includes(type)) {
      continue;
    }
    if ((type === "checkbox" || type === "radio") && !/\schecked(?:\s|=|>)/i.test(input)) {
      continue;
    }
    data[name] = attr(input, "value");
  }
  for (const textareaMatch of form.matchAll(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi)) {
    const textarea = textareaMatch[0];
    const name = attr(textarea, "name");
    if (name) {
      data[name] = textContent(textarea);
    }
  }
  for (const selectMatch of form.matchAll(/<select\b[^>]*>[\s\S]*?<\/select>/gi)) {
    const select = selectMatch[0];
    const name = attr(select, "name");
    const selected = matchFirst(select, /<option\b[^>]*selected[^>]*>[\s\S]*?<\/option>/i) ||
      matchFirst(select, /<option\b[^>]*>[\s\S]*?<\/option>/i);
    if (name) {
      data[name] = selected ? attr(selected, "value") : "";
    }
  }
  return data;
}

function replaceFormValue(form: string, formFields: Record<string, string>, value: string, tokens: string[]) {
  if (!value) {
    return 0;
  }
  const field = findField(form, tokens);
  if (!field) {
    return 0;
  }
  formFields[field.name] = formValue(field.html, value);
  return 1;
}

function scoreValue(value: string | null | undefined, resetResult: boolean) {
  return resetResult && !value ? "0" : value ?? "";
}

function isNormalRating(value: string | null | undefined) {
  const normalized = normalizeToken(value ?? "");
  return !normalized || normalized === "normal";
}

function hasSetScores(game: HvvGameUpdate) {
  return Boolean(
    game.set1_team_a || game.set1_team_b ||
      game.set2_team_a || game.set2_team_b ||
      game.set3_team_a || game.set3_team_b,
  );
}

function replaceGameRating(form: string, formFields: Record<string, string>, value: string) {
  if (!value) {
    return 0;
  }
  const field = findField(form, ["wertungid", "spielwertung", "wertung"]);
  if (!field) {
    return 0;
  }
  formFields[field.name] = gameRatingValue(value) ?? formValue(field.html, value);
  return 1;
}

function gameRatingValue(value: string) {
  const ratings: Record<string, string> = {
    normal: "0",
    freilosb: "1",
    freilosa: "2",
    verletzunga: "3",
    verletzungb: "4",
    verletzungab: "5",
    aufgabea: "6",
    aufgabeb: "7",
    aufgabeab: "8",
    nichtangetretena: "9",
    nichtangetretenb: "10",
    nichtangetretenab: "11",
    verletzunganichtangetretenb: "12",
    nichtangetretenaverletzungb: "13",
  };
  return ratings[normalizeToken(value)];
}

function findField(form: string, tokens: string[]) {
  const fields = [
    ...[...form.matchAll(/<input\b[^>]*>/gi)].map((match) => match[0]),
    ...[...form.matchAll(/<select\b[^>]*>[\s\S]*?<\/select>/gi)].map((match) => match[0]),
    ...[...form.matchAll(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi)].map((match) => match[0]),
  ];
  for (const field of fields) {
    const name = attr(field, "name");
    const type = attr(field, "type").toLowerCase();
    if (!name || ["hidden", "submit", "button"].includes(type)) {
      continue;
    }
    if (tokens.some((token) => normalizeToken(name) === normalizeToken(token))) {
      return { html: field, name };
    }
  }
  for (const field of fields) {
    const name = attr(field, "name");
    const type = attr(field, "type").toLowerCase();
    if (!name || ["hidden", "submit", "button"].includes(type)) {
      continue;
    }
    const text = normalizeToken(`${name} ${attr(field, "id")} ${attr(field, "aria-label")} ${attr(field, "placeholder")} ${textContent(field)}`);
    if (tokens.some((token) => text.includes(normalizeToken(token)))) {
      return { html: field, name };
    }
  }
  return null;
}

function formValue(field: string, value: string) {
  if (!/^<select\b/i.test(field)) {
    return value;
  }
  for (const optionMatch of field.matchAll(/<option\b[^>]*>[\s\S]*?<\/option>/gi)) {
    const option = optionMatch[0];
    if (value === attr(option, "value") || normalizeToken(value) === normalizeToken(textContent(option))) {
      return attr(option, "value");
    }
  }
  return value;
}

function addSubmitButtonValue(form: string, formFields: Record<string, string>) {
  const submit = matchFirst(form, /<(button|input)\b[^>]*type=["']submit["'][^>]*name=["'][^"']+["'][^>]*>/i) ||
    matchFirst(form, /<(button|input)\b[^>]*name=["'][^"']+["'][^>]*type=["']submit["'][^>]*>/i);
  const name = attr(submit, "name");
  if (name) {
    formFields[name] = attr(submit, "value");
  }
}

function parseScheduleGames(html: string, baseUrl: string): HvvScheduleGame[] {
  const rows = html.matchAll(/<tr\b[^>]*class=["'][^"']*\bbeachspielrow\b[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi);
  const games: HvvScheduleGame[] = [];

  for (const rowMatch of rows) {
    const row = rowMatch[0];
    const number = textByColumn(row, 6);
    const teamA = textByDataContent(row, "teamA") || textByColumn(row, 7);
    const teamB = textByDataContent(row, "teamB") || textByColumn(row, 8);
    if (!number || (!teamA && !teamB)) {
      continue;
    }

    const edit = editRequest(row, baseUrl);
    games.push({
      number,
      round: textByDataContent(row, "runde") || textByDataContent(row, "round") || textByColumn(row, 5),
      game_date: textByColumn(row, 1),
      team_a: teamA,
      team_b: teamB,
      edit_url: edit.url,
      edit_method: edit.method,
      edit_data: edit.data,
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

function isTournamentOverview(html: string, url: string) {
  return /id=["']turnierliste["']/i.test(html) || /beach_beach_turniere!browse/i.test(url);
}

function isTournamentDetail(html: string, url: string) {
  return /turnier_turnierid/i.test(html) || /beach_beach_turnier!browse/i.test(url);
}

function isTournamentEvent(html: string, url: string) {
  return !/beach_beach_veranstaltung_spiele!browse/i.test(url) &&
    (/veranstaltung_bezeichnung/i.test(html) || /beach_beach_veranstaltung!browse/i.test(url));
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

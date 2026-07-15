import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, createUserClient } from "../_shared/supabase.ts";

type HvvCredentials = {
  username?: string;
  password?: string;
};

type ListHvvTournamentsRequest = {
  source?: string;
  hvvCredentials?: HvvCredentials;
};

type HvvTournamentOption = {
  name: string;
  hvv_turnier_id: string;
  hvv_veranstaltung_id: string;
  hvv_type: string;
  hvv_gender: string;
  tournament_date: string;
  location: string;
  detail_url: string;
  schedule_url: string;
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
    .select("user_id")
    .eq("user_id", userData.user.id)
    .eq("password_setup_required", false)
    .maybeSingle();

  if (adminError || !adminUser) {
    return jsonResponse({ error: "Not authorized" }, 403);
  }

  const body = await req.json() as ListHvvTournamentsRequest;
  const source = body.source?.trim();
  if (!source) {
    return jsonResponse({ error: "source is required" }, 400);
  }

  try {
    const page = await loadHvvPage(hvvInitialUrl(source), body.hvvCredentials ?? {});
    const options = await parseTournamentOptions(page.html, page.url, body.hvvCredentials ?? {}, page.cookies);
    return jsonResponse({ tournaments: options });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function loadHvvPage(source: string, credentials: HvvCredentials) {
  const cookies = new Map<string, string>();
  const first = await fetchWithSession(source, credentials, cookies);
  let html = await first.response.text();
  let url = first.response.url || source;

  if (hasCredentials(credentials) && isLoginPage(html)) {
    const login = loginRequest(html, url, credentials);
    const loginResponse = await fetchWithSession(login.url, credentials, cookies, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: login.body,
    });
    await loginResponse.response.arrayBuffer();

    const second = await fetchWithSession(source, credentials, cookies);
    html = await second.response.text();
    url = second.response.url || source;
  }

  if (isLoginPage(html)) {
    throw new Error("Anmeldung fehlgeschlagen oder Loginformular erneut angezeigt.");
  }

  return { html, url, cookies };
}

async function parseTournamentOptions(
  html: string,
  overviewUrl: string,
  credentials: HvvCredentials,
  cookies: Map<string, string>,
) {
  const rows = tournamentOverviewRows(html);
  const options: HvvTournamentOption[] = [];

  for (const row of rows) {
    const turnierId = attr(matchFirst(row, /<input\b[^>]*name=["']ausg["'][^>]*>/i), "value");
    const eventUrl = eventUrlFromTournamentRow(row, overviewUrl);
    const eventId = eventIdFromUrl(eventUrl);
    const detailUrl = detailUrlFromTournamentRow(row, overviewUrl);
    if (!turnierId || !eventId) {
      continue;
    }

    const eventName = await loadEventName(eventUrl, credentials, cookies);
    options.push({
      name: eventName || `${textByColumn(row, 3)} ${textByColumn(row, 5)} ${textByColumn(row, 2)}`.trim(),
      hvv_turnier_id: turnierId,
      hvv_veranstaltung_id: eventId,
      hvv_type: textByColumn(row, 2),
      hvv_gender: genderFromHtml(cellByColumn(row, 4)),
      tournament_date: textByColumn(row, 3),
      location: textByColumn(row, 5),
      detail_url: detailUrl || new URL(`beach_beach_turnier!browse?turnierid=${turnierId}`, overviewUrl).toString(),
      schedule_url: new URL(`beach_beach_veranstaltung_spiele!browse.action?veranstaltungid=${eventId}`, overviewUrl).toString(),
    });
  }

  const today = todayInTimeZone("Europe/Berlin");
  return options
    .filter((option) => !isExpiredTournament(option, today))
    .sort(compareTournamentOptionsByDate);
}

async function loadEventName(eventUrl: string, credentials: HvvCredentials, cookies: Map<string, string>) {
  if (!eventUrl) {
    return "";
  }
  const response = await fetchWithSession(eventUrl, credentials, cookies);
  const html = await response.response.text();
  return labelTextById(html, "veranstaltung_bezeichnung") ||
    labelTextById(html, "turnier_veranstaltung_bezeichnung") ||
    textContent(matchFirst(html, /<div[^>]*font-size:14px[\s\S]*?<\/div>/i));
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

function tournamentOverviewRows(html: string) {
  return [...html.matchAll(/<tr\b[^>]*class=["'](?:oddrow|evenrow)["'][^>]*>[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
}

function eventUrlFromTournamentRow(row: string, baseUrl: string) {
  const link = matchFirst(row, /<a\b[^>]*href=["'][^"']*beach_beach_veranstaltung!browse[^"']*veranstaltungid=\d+[^"']*["'][^>]*>[\s\S]*?<\/a>/i);
  const href = attr(link, "href").trim();
  return href ? new URL(href, baseUrl).toString() : "";
}

function detailUrlFromTournamentRow(row: string, baseUrl: string) {
  const link = matchFirst(row, /<a\b[^>]*href=["'][^"']*beach_beach_turnier!browse[^"']*turnierid=\d+[^"']*["'][^>]*>[\s\S]*?<\/a>/i);
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

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

function isExpiredTournament(option: HvvTournamentOption, today: CalendarDate) {
  const tournamentDates = parseTournamentDates(option.tournament_date, today.year);
  if (tournamentDates.length === 0) {
    return false;
  }

  const latestDate = tournamentDates.reduce((latest, date) =>
    dateKey(date) > dateKey(latest) ? date : latest
  );
  return dateKey(latestDate) < dateKey(today);
}

function compareTournamentOptionsByDate(left: HvvTournamentOption, right: HvvTournamentOption) {
  const leftDate = earliestTournamentDate(left.tournament_date);
  const rightDate = earliestTournamentDate(right.tournament_date);
  if (leftDate && rightDate) {
    return dateKey(leftDate) - dateKey(rightDate) || left.name.localeCompare(right.name, "de");
  }
  if (leftDate) {
    return -1;
  }
  if (rightDate) {
    return 1;
  }
  return left.name.localeCompare(right.name, "de");
}

function earliestTournamentDate(value: string) {
  const tournamentDates = parseTournamentDates(value, todayInTimeZone("Europe/Berlin").year);
  if (tournamentDates.length === 0) {
    return null;
  }
  return tournamentDates.reduce((earliest, date) =>
    dateKey(date) < dateKey(earliest) ? date : earliest
  );
}

function parseTournamentDates(value: string, fallbackYear: number) {
  const dates: CalendarDate[] = [];
  for (const match of value.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    if (isValidCalendarDate({ year, month, day })) {
      dates.push({ year, month, day });
    }
  }
  const germanMatches = [...value.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(?:(\d{4}|\d{2}))?(?!\d)/g)];
  for (let index = 0; index < germanMatches.length; index++) {
    const match = germanMatches[index];
    const day = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const yearText = match[3] ?? nextExplicitYear(germanMatches, index) ?? String(fallbackYear);
    const yearPart = Number.parseInt(yearText, 10);
    const year = yearText.length === 2 ? 2000 + yearPart : yearPart;
    if (isValidCalendarDate({ year, month, day })) {
      dates.push({ year, month, day });
    }
  }
  return dates;
}

function nextExplicitYear(matches: RegExpMatchArray[], startIndex: number) {
  for (let index = startIndex + 1; index < matches.length; index++) {
    if (matches[index][3]) {
      return matches[index][3];
    }
  }
  return "";
}

function isValidCalendarDate(date: CalendarDate) {
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) {
    return false;
  }
  const parsed = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return parsed.getUTCFullYear() === date.year &&
    parsed.getUTCMonth() === date.month - 1 &&
    parsed.getUTCDate() === date.day;
}

function todayInTimeZone(timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function dateKey(date: CalendarDate) {
  return date.year * 10000 + date.month * 100 + date.day;
}

function labelTextById(html: string, id: string) {
  const escaped = escapeRegex(id);
  return textContent(matchFirst(html, new RegExp(`<label\\b[^>]*id=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/label>`, "i")));
}

function textByColumn(row: string, index: number) {
  const cells = [...row.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/gi)].map((match) => match[0]);
  return index >= 0 && index < cells.length ? textContent(cells[index]) : "";
}

function cellByColumn(row: string, index: number) {
  const cells = [...row.matchAll(/<td\b[^>]*>[\s\S]*?<\/td>/gi)].map((match) => match[0]);
  return index >= 0 && index < cells.length ? cells[index] : "";
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

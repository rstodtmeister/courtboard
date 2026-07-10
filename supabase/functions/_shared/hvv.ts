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
  let changedFields = 0;
  changedFields += replaceFormValue(form.html, formFields, game.court ?? "", ["court", "feld", "platz"]);
  changedFields += replaceFormValue(form.html, formFields, game.referee ?? "", ["schiri", "schieds", "referee"]);
  changedFields += replaceGameRating(form.html, formFields, game.game_rating ?? "");
  changedFields += replaceFormValue(form.html, formFields, game.set1_team_a ?? "", ["s1pa", "satz1teama", "satz1a", "set1teama", "set1a"]);
  changedFields += replaceFormValue(form.html, formFields, game.set1_team_b ?? "", ["s1pb", "satz1teamb", "satz1b", "set1teamb", "set1b"]);
  changedFields += replaceFormValue(form.html, formFields, game.set2_team_a ?? "", ["s2pa", "satz2teama", "satz2a", "set2teama", "set2a"]);
  changedFields += replaceFormValue(form.html, formFields, game.set2_team_b ?? "", ["s2pb", "satz2teamb", "satz2b", "set2teamb", "set2b"]);
  changedFields += replaceFormValue(form.html, formFields, game.set3_team_a ?? "", ["s3pa", "satz3teama", "satz3a", "set3teama", "set3a"]);
  changedFields += replaceFormValue(form.html, formFields, game.set3_team_b ?? "", ["s3pb", "satz3teamb", "satz3b", "set3teamb", "set3b"]);

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
  const form = matchFirst(html, /<form[^>]*(?:id|name)=["']core_login["'][^>]*>[\s\S]*?<\/form>/i);
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

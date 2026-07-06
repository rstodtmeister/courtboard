# CourtBoard Web-Admin

Ziel: Die bestehende Desktop-Anwendung bleibt erhalten. Parallel entsteht eine gehostete Admin-Oberflaeche mit GitHub Pages und Supabase.

## Architektur

- GitHub Pages hostet die statische Admin-Web-App.
- Supabase Auth verwaltet Admin-Logins.
- Supabase Postgres speichert Turniere, Spiele, Druckstatus und Ergebnis-Erfassungslinks.
- Supabase Edge Functions uebernehmen alle Aktionen, die nicht in den Browser gehoeren:
  - HVV-Spielplan abrufen
  - Spiel bei HVV speichern
  - Ergebnislink erzeugen
  - Ergebnislink pruefen und Ergebnis speichern

HVV-Zugangsdaten und Supabase Secret Keys duerfen nie in der GitHub-Pages-App liegen.

## Schritt 1: Datenmodell

Die erste Migration liegt unter:

```text
supabase/migrations/20260629161000_initial_admin_schema.sql
```

Sie legt an:

- `admin_users`: Supabase-User, die Admin-Rechte haben
- `tournaments`: Turniere mit HVV-URLs
- `games`: Spiele inklusive Teams, Court, Wertung, Satzpunkten, Edit-Daten und Druckstatus
- `score_entry_links`: tokenbasierte Links fuer Anwender ohne Benutzerkonto

Row Level Security ist aktiviert. Normale eingeloggte User bekommen nur Zugriff, wenn sie in `admin_users` stehen. Anonyme Ergebnislinks sollen spaeter ausschliesslich ueber Edge Functions schreiben.

## Schritt 2: Supabase-Projekt initialisieren

Wenn die Supabase CLI installiert ist:

```bash
supabase init
supabase link --project-ref <project-ref>
supabase db push
```

Danach den ersten Admin-Benutzer in Supabase Auth anlegen und dessen User-ID in `admin_users` eintragen:

```sql
insert into public.admin_users (user_id)
values ('<auth-user-id>');
```

Lokal wurde die Supabase-Struktur bereits initialisiert. Fuer die lokale Entwicklung:

```bash
supabase start
supabase status
supabase functions serve --no-verify-jwt
```

Lokale Standard-URLs:

- Studio: `http://127.0.0.1:54323`
- API: `http://127.0.0.1:54321`
- Functions: `http://127.0.0.1:54321/functions/v1`

Die lokale Datenbank kann bei Bedarf komplett neu aufgebaut werden:

```bash
supabase db reset
```

## Schritt 3: Edge Functions

Geplante Functions:

- `sync-games`: HVV-Seite abrufen, Spiele parsen, `games` aktualisieren
- `save-game`: Spielwerte aus der Admin-UI entgegennehmen und an HVV speichern
- `create-score-link`: Admin erzeugt Link fuer ein Spiel oder einen Court
- `submit-score`: Anwender ohne Login speichert Ergebnis ueber Token

Bereits angelegt:

- `supabase/functions/create-score-link`
- `supabase/functions/submit-score`

Die bestehende Java-Logik aus `WebPageScraper.java` ist die Vorlage fuer `sync-games` und `save-game`.

## Schritt 4: Web-App

Angelegte Struktur:

```text
web-admin/
  src/
  package.json
  vite.config.ts
```

Lokaler Start:

```bash
cd web-admin
npm install
npm run dev
```

Die lokale App nutzt:

```text
web-admin/.env.local
```

Aktuell ist dort `VITE_DATA_MODE=local` gesetzt. Damit laeuft die Web-App ohne Supabase-Stack direkt im Browser und speichert Testdaten in `localStorage`.

Lokaler Offline-Modus:

- Admin-Login ist simuliert. Jede nicht-leere E-Mail/Passwort-Kombination reicht.
- Beispielspiele werden beim ersten Start automatisch angelegt.
- Die Spieleliste ist HVV-getrieben. Spiele koennen nicht manuell angelegt oder geloescht werden.
- Lokal gibt es einen `HVV laden`-Button, der die lokale Java-API nutzt.
- Court, Schiri, Ergebnis/Satzpunkte, PDF-Druckstatus, Spiel-Tokens und Court-Tokens werden lokal persistiert.
- Ergebnis und Sieger werden aus den Satzpunkten automatisch abgeleitet.
- Turnierdaten wie Name, HVV-URLs und Courts werden lokal konfiguriert.
- Eine Token-Uebersicht zeigt aktive, benutzte und deaktivierte Ergebnislinks.
- Token-Links funktionieren ebenfalls lokal ueber `?token=<token>`.
- Die zentrale Court-Anzeige ist lokal ueber `?view=courts` erreichbar und kann im Admin per Button geoeffnet werden.
- Die Court-Anzeige orientiert sich an der bisherigen generierten `court-display.html`: 4 Courts, aktuelles Spiel, zwei Folgespiele, offene Spiele und Ergebnisse.
- Fuer Handy-Tokens gibt es in der Turnier-Konfiguration eine `Token Basis-URL`, z. B. `http://192.168.178.35:5173`.
- Erzeugte Tokens zeigen Link und QR-Code. Der QR-Code fuehrt direkt zur Token-Erfassungsseite.

Spaeterer Supabase-Modus:

```text
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=<supabase-url>
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Die UI nutzt einen Datenadapter, daher bleibt die Oberflaeche gleich. Nur der Adapter spricht dann mit Supabase Auth, Tabellen und Edge Functions.

## Lokale Java-API

Der lokale HVV-Import nutzt die bestehende Java-Scraper-Logik aus `WebPageScraper`.

Start nach einem Maven-Build:

```bash
mvn -q -DskipTests package
java -jar target/CourtBoard-1.0-SNAPSHOT.jar --api 8787
```

Health-Check:

```bash
curl http://127.0.0.1:8787/api/health
```

Sync-Endpunkt:

```text
POST http://127.0.0.1:8787/api/games/sync
```

Request:

```json
{
  "url": "https://...",
  "username": "",
  "password": ""
}
```

Die Web-App liest die API-URL aus `VITE_LOCAL_API_URL`.

## Handy-Zugriff lokal

Der Vite-Dev-Server wird mit LAN-Bindung gestartet:

```bash
cd web-admin
npm run dev
```

Vite zeigt danach eine `Network`-Adresse an, z. B.:

```text
http://192.168.178.35:5173/
```

Diese Adresse in der Admin-Oberflaeche als `Token Basis-URL` speichern. Danach erzeugte Spiel- und Court-Tokens verwenden diese Adresse im QR-Code, sodass Schiris den Link direkt mit dem Handy scannen koennen.

Aktueller Stand:

- Login
- Spiele-Tabelle mit Inline-Bearbeitung
- Court, Teams, Schiri, Ergebnis, Sieger, Wertung und Satzpunkte bearbeiten
- PDF-Druckstatus pro Spiel markieren
- Ergebnislink pro Spiel erzeugen
- Ergebnislink pro Court erzeugen
- Token-Seite fuer Schiris ohne Login: `?token=<token>`
- Abmelden

Geplante naechste Views:

- Turnier-Konfiguration
- HVV-Sync-Button
- Speichern geaenderter Spiele zurueck nach HVV
- PDF-Druckansicht oder PDF-Erzeugung im Web

## Ergebnislinks

Admins koennen in der Spiele-Tabelle einen Token fuer ein einzelnes Spiel erzeugen. Zusaetzlich erzeugen die Court-Buttons einen Token, mit dem alle Spiele dieses Courts bearbeitet werden koennen.

Die Schiri-Seite ist dieselbe GitHub-Pages-App mit Token-Parameter:

```text
https://<pages-url>/?token=<token>
```

Die Seite laedt die erlaubten Spiele ueber `submit-score` per `GET` und speichert Ergebnisse ueber dieselbe Function per `POST`.

## Schritt 5: GitHub Pages

Die Web-App wird als statische Vite-App gebaut. GitHub Actions deployed `web-admin/dist` nach GitHub Pages.

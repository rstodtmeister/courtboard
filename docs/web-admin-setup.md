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

HVV-Zugangsdaten und Supabase Secret Keys duerfen nie dauerhaft in der GitHub-Pages-App liegen. Der HVV-Zugang wird im Web-Admin nur fuer die laufende Sitzung im Speicher gehalten, beim Abmelden geloescht und bei HVV-Aktionen an Backend/Edge Function uebergeben.

## Schritt 1: Datenmodell

Die erste Migration liegt unter:

```text
supabase/migrations/20260629161000_initial_admin_schema.sql
```

Sie legt an:

- `admin_users`: Supabase-User, die Admin- oder Superadmin-Rechte haben
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

Danach den ersten Superadmin-Benutzer in Supabase Auth anlegen, E-Mail bestaetigen und dessen User-ID in `admin_users` eintragen:

```sql
insert into public.admin_users (user_id, role, password_setup_required)
values ('<auth-user-id>', 'superadmin', false);
```

Nur Superadmins koennen in der Web-App weitere Admins einladen. Die Einladung laeuft per E-Mail ueber Supabase Auth; der neue Admin muss den Link bestaetigen und seinen Zugang einrichten. Lokale Supabase-Auth ist auf E-Mail-Bestaetigung konfiguriert.

Damit Einladungs-E-Mails nicht auf `localhost` zeigen, muss die Edge Function die oeffentliche Admin-URL kennen:

```bash
supabase secrets set ADMIN_APP_URL=https://<github-user>.github.io/<repo>/
supabase functions deploy manage-admins
```

Dieselbe URL muss in Supabase Auth als erlaubte Redirect URL eingetragen sein, inklusive Auth-Parameter fuer Einladung und Passwort-Reset:

```text
https://<github-user>.github.io/<repo>/?auth=confirmed
https://<github-user>.github.io/<repo>/?auth=recover
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
- `manage-admins`: Superadmin laedt weitere Admins per E-Mail ein
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
- Der HVV-Zugang wird beim ersten HVV-Laden abgefragt und nur temporaer fuer die laufende Browser-Sitzung gehalten.
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

Administrative Zugriffe verwenden getrennt davon ausschließlich die Loopback-URL aus:

```text
VITE_LOCAL_ADMIN_API_URL=http://127.0.0.1:8787
```

Die Java-API gibt dafür nur an lokale Browser einen zufälligen, flüchtigen Admin-Sitzungsschlüssel aus. Administrative Endpunkte akzeptieren keine fremden Web-Origins. Deshalb die Admin-Oberfläche lokal über `http://127.0.0.1:5173` oder `http://localhost:5173` öffnen. `VITE_LOCAL_API_URL` darf weiterhin auf die LAN-IP zeigen, damit öffentliche Court-Anzeigen und Ergebnislinks auf Handys funktionieren.

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

Speicheranfragen werden im Browser pro Spiel in Eingabereihenfolge ausgefuehrt.
Das umfasst Schiedsrichterauswahl, Live-Punkte, Korrekturen und den Spielabschluss.
Die Anfrage verwendet den Spielstand zum Zeitpunkt der Eingabe. Andere Spiele und
Courts haben eigene Warteschlangen und koennen gleichzeitig speichern. Fehler werden
an den jeweiligen Aufrufer gemeldet; spaetere Speicherungen laufen weiter, ohne alte
Spielstaende automatisch erneut zu senden. Die Warteschlange selbst liegt im Arbeitsspeicher
der Browserseite und ist kein geraeteuebergreifender oder dauerhafter Offline-Puffer.

Beim Satzabschluss sind weitere Eingaben bis zur Antwort gesperrt. Schlaegt das Speichern
fehl, bleibt der aktuelle Satz geoeffnet und kann erneut bestaetigt werden.
`cd web-admin && npm run test:score` prueft die Reihenfolge mit verzoegerten Antworten,
Fehlern und vier gleichzeitig genutzten Courts im lokalen und im Supabase-Datenadapter.

## Schritt 5: GitHub Pages

Die Web-App wird als statische Vite-App gebaut. GitHub Actions deployed `web-admin/dist` nach GitHub Pages.

## Eine Sitzung pro Superadmin (auch im Free-Tarif)

Die Migration `20260910120000_single_superadmin_session.sql` speichert die aktive
Supabase-Auth-Sitzung je Superadmin. Beim Anmelden uebernimmt die neueste Sitzung.
Normale Admins und tokenbasierte Ergebnislinks bleiben davon unberuehrt. Der lokale
Offline-Modus hat keine geraeteuebergreifende Authentifizierung und nutzt diese Regel nicht.

Die Datenbank prueft die Sitzung bei administrativen Zugriffen ueber RLS. Auch die
Admin-Pruefung der Edge Functions verwendet den Benutzer-JWT, bevor privilegierte
Operationen stattfinden. Bereits laufende Anfragen werden nicht rueckwirkend abgebrochen.
Alte Sitzungen koennen die aktive Sitzung durch Neuladen oder Token-Erneuerung nicht
zurueckholen, auch nicht nach dem Abmelden des neuen Geraets.

Im alten Browser erscheint beim naechsten Dashboard-Abgleich (normalerweise nach
spaetestens etwa zehn Sekunden plus Netzwerklaufzeit) oder beim Fensterfokus die
Abmeldemeldung. Hintergrund-Tabs/offline befindliche Geraete koennen sie spaeter anzeigen;
die serverseitige Sperre haengt nicht von diesem Abgleich ab. Automatisches und normales
Abmelden verwenden `scope: "local"`, damit die neue Sitzung auf dem anderen Geraet bestehen bleibt.

Zur Aktivierung im gehosteten Projekt sind **alle drei Schritte** erforderlich:

1. `supabase db push` (Migration einspielen; bestehende Superadmins behalten zunaechst ihre neueste Auth-Sitzung).
2. Die fuenf geaenderten Edge Functions bereitstellen:

   ```bash
   supabase functions deploy manage-admins
   supabase functions deploy sync-games
   supabase functions deploy save-game
   supabase functions deploy create-score-link
   supabase functions deploy list-hvv-tournaments
   ```

3. Die aktualisierte Web-App ueber den GitHub-Pages-Workflow bereitstellen und auf beiden Geraeten neu laden.

Migration, Functions und Web-App zusammen ausrollen: Alte Functions pruefen die Sitzung
noch nicht, und eine alte Web-App kann neue Sitzungen noch nicht registrieren.

Pruefung: Mit demselben Superadmin in zwei getrennten Browserprofilen anmelden. Nach
der zweiten Anmeldung muss das erste Profil abgemeldet werden; das zweite muss weiter
speichern koennen. Nach Abmelden des zweiten Profils darf Neuladen im ersten dessen alte
Sitzung nicht reaktivieren. Normale Admins duerfen weiterhin mehrere Sitzungen verwenden.

Der SQL-Regressionstest `supabase/tests/superadmin_sessions.sql` prueft Uebernahme,
RLS-Schreibschutz, die Rollenabfrage der Edge Functions und die Sperre alter Sitzungen
nach Abmeldung. Auf einer migrierten lokalen Testdatenbank mit
`psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/superadmin_sessions.sql`
ausfuehren; alle Testdaten werden zurueckgerollt.
Die Frontend-Regressionstests laufen mit `cd web-admin && npm run test:auth`
und sind auch in `npm run check` enthalten.

### Abfragen der öffentlichen Anzeigen

Court-Übersicht, Einzelcourt, Gruppenansicht und Stream-Overlay warten nach jedem
abgeschlossenen Abruf fünf Sekunden bis zum nächsten. Ausgeblendete Tabs starten
keine neuen Abrufe; beim Zurückwechseln wird sofort aktualisiert. Laufende Abrufe
werden nicht überlappt. Fehler werden beim nächsten Abruf erneut versucht.
Turnierdaten werden pro Anzeige eine Minute zwischengespeichert. Auszeit-Countdowns
laufen unabhängig davon sekündlich im Browser weiter.

Im Supabase-Betrieb laden Anzeigen reduzierte Spielfelder. Einzelcourt und Overlay
filtern bereits auf dem Server nach dem Court. Gruppentabellen laden keine
Punkteverläufe; die Übersicht lädt sie nur für offene Spiele mit angemeldetem
Schiedsgericht, die Einzelansicht für offene Spiele ihres Courts. Abgeschlossene
Spiele bleiben für Ergebnisse und Tabellen in der Übersicht enthalten.
Die lokale Java-API liefert weiterhin ihre vollständige öffentliche Spieleantwort;
Abfragepausen und Turniercache gelten auch dort.

`npm run test:display` prüft Abfragepausen, Wiederaufnahme, Fehlerwiederholung,
Überlappungsschutz und die reduzierte Supabase-Datenauswahl. Ein Lasttest mit
50 Zuschauern ist damit noch nicht durchgeführt.

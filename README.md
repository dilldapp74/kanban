# Mein Kanban

Ein schlankes, persönliches Kanban-Board für Aufgaben – läuft im Browser, lässt sich auf
Android und macOS wie eine App installieren und gleicht sich über [Supabase](https://supabase.com)
zwischen allen Geräten ab.

**Live:** https://dilldapp74.github.io/kanban/ (Anmeldung erforderlich, Registrierung ist geschlossen)

## Funktionen

- Vier Spalten: **Backlog → Offen → In Arbeit → Erledigt**
- Karten mit Titel, Notiz, Priorität (niedrig/mittel/hoch) und Fälligkeitsdatum
  („Heute“, „Morgen“, überfällige Aufgaben rot)
- Verschieben per Ziehen am Griff ⠿ – mit Maus und Finger
- Handy: feste Spaltenleiste oben zum Springen und als Ablageziel beim Ziehen;
  im Bearbeiten-Dialog wechselt ein Tipp die Spalte
- Suche über Titel und Notizen
- Abgleich zwischen Geräten in Echtzeit, funktioniert auch offline (Änderungen werden nachgeholt)
- Installierbar (PWA): Android „Zum Startbildschirm hinzufügen“, macOS Safari „Zum Dock hinzufügen“
- Helles und dunkles Design (folgt der Systemeinstellung)
- Backup als JSON-Datei herunterladen und wieder einspielen (Einstellungen ⚙)

## Technik

Bewusst einfach gehalten: **reines HTML, CSS und JavaScript** – kein Framework, kein Build-Schritt,
keine Abhängigkeiten außer der Supabase-Bibliothek (per CDN, feste Version).

| Datei | Zweck |
|---|---|
| `index.html` | Seitengerüst, Dialoge, Einstellungsmenü |
| `style.css` | Gestaltung inkl. Dunkelmodus und Handy-Layout |
| `app.js` | Board: Daten, Zeichnen, Bearbeiten, Ziehen & Ablegen, Backup |
| `sync.js` | Abgleich mit Supabase: Anmeldung, Hoch-/Herunterladen, Echtzeit |
| `config.js` | Supabase-URL und **öffentlicher** Schlüssel |
| `sw.js` | Service Worker: Offline-Start, „Netz zuerst, sonst Cache“ |
| `manifest.webmanifest`, `icons/` | App-Name, Symbole, Vollbild-Start |
| `supabase.sql` | Datenbank-Schema mit Zugriffsschutz |
| `ANLEITUNG.md` | Schritt-für-Schritt-Einrichtung (Supabase, GitHub Pages, Handy) |

Code-Kommentare und Bezeichner sind auf Deutsch.

### Datenmodell

Eine Tabelle `karten` (siehe `supabase.sql`):

| Feld | Bedeutung |
|---|---|
| `id` | Text-ID, wird im Browser erzeugt |
| `user_id` | Besitzer, setzt die Datenbank automatisch (`auth.uid()`) |
| `titel`, `notiz` | Inhalt |
| `prio` | `''`, `niedrig`, `mittel`, `hoch` |
| `faellig` | Datum `JJJJ-MM-TT` oder leer |
| `spalte` | `backlog`, `offen`, `arbeit`, `erledigt` |
| `position` | Reihenfolge innerhalb der Spalte (Kommazahl; beim Einsortieren wird der Mittelwert der Nachbarn genommen) |
| `geaendert` | Zeitstempel der letzten Änderung – entscheidet bei Konflikten |
| `geloescht` | Löschungen werden nur markiert, damit andere Geräte sie mitbekommen |

### Abgleich (sync.js)

- Alle Karten liegen zusätzlich im `localStorage` des Geräts → das Board funktioniert offline.
- Jede Änderung setzt `geaendert`, merkt die Karte als „ausstehend“ und lädt sie per `upsert` hoch.
  Fehlgeschlagenes wird beim nächsten Abgleich nachgeholt.
- Abgeglichen wird beim Start, beim Zurückkehren zur App, bei wiederhergestellter Verbindung
  und live über Supabase Realtime.
- Konflikte: pro Karte gewinnt die Fassung mit dem neueren `geaendert`.
- Ohne Eintrag in `config.js` läuft das Board rein lokal.

### Sicherheit

- Row Level Security: Jedes Konto liest und ändert nur seine eigenen Karten.
- In `config.js` steht nur der öffentliche Schlüssel (`publishable`/`anon`) – er ist für den Browser
  gedacht. Der geheime `service_role`-Schlüssel gehört **nie** in dieses Repo.
- Neue Registrierungen sind im Supabase-Projekt abgeschaltet.
- `migration-*.sql` (einmalige Datenübernahmen mit privaten Inhalten) ist per `.gitignore` ausgeschlossen.

## Lokal entwickeln

```bash
python3 -m http.server 8765
```

Dann http://localhost:8765 öffnen. (Direktes Öffnen von `index.html` per Doppelklick geht auch,
dann aber ohne Service Worker.)

Nach Änderungen an CSS/JS die Versionsnummer `?v=…` in `index.html` und `CACHE` in `sw.js`
hochzählen, damit installierte Apps die neue Fassung sofort laden.

## Veröffentlichen

Das Repo wird über **GitHub Pages** (Branch `main`, Ordner `/`) ausgeliefert – ein `git push`
genügt, nach ca. einer Minute ist die neue Version online.

## Eigene Instanz aufsetzen

1. Repo forken oder kopieren.
2. Eigenes Supabase-Projekt anlegen und `supabase.sql` im SQL-Editor ausführen.
3. URL und öffentlichen Schlüssel in `config.js` eintragen.
4. GitHub Pages einschalten und in Supabase die *Site URL* auf die Pages-Adresse setzen.

Details stehen in [`ANLEITUNG.md`](ANLEITUNG.md).

## Ideen für später

- Wiederkehrende Aufgaben
- Projekte/Schlagwörter und Filter
- Erinnerungen per Push-Nachricht
- KI-Assistent (z. B. Aufgaben aus Alltagssprache anlegen, Tagesplanung) über eine
  Supabase Edge Function – der API-Schlüssel muss dabei auf dem Server bleiben
- Bei deutlich mehr Umfang: Umstieg auf ein Framework (z. B. Svelte oder React)

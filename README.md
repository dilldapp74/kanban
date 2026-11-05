# Family Kanban

Ein schlankes Kanban-Board für die ganze Familie – läuft im Browser, lässt sich auf Android und
macOS wie eine App installieren und gleicht sich über [Supabase](https://supabase.com) zwischen
allen Geräten und Familienmitgliedern ab.

**Live:** https://dilldapp74.github.io/kanban/ (Anmeldung erforderlich, Registrierung ist geschlossen)

## Funktionen

- Vier Spalten: **Backlog → Offen → In Arbeit → Erledigt**
- Karten mit Titel, Notiz, Priorität (niedrig/mittel/hoch) und Fälligkeitsdatum
  („Heute“, „Morgen“, überfällige Aufgaben rot)
- **Familie:** mehrere Mitglieder, auch ohne eigenes Konto (z. B. Kinder); jede Aufgabe lässt sich
  mit einem Tipp auf die Anfangsbuchstaben einem Mitglied zuweisen
- Ansicht **„Meine“** (mir zugewiesen) oder **„Alle“**; alle Mitglieder dürfen alle Aufgaben ändern
- **Private Aufgaben** (🔒): gehören automatisch dem Ersteller, erscheinen nur unter „Meine“ und
  werden anderen Mitgliedern von der Datenbank gar nicht erst ausgeliefert
- **Diktieren** von Titel und Notiz (Spracherkennung des Browsers)
- **Push-Benachrichtigungen:** neue Zuweisung, Änderung an meinen Aufgaben, morgens die heute fälligen
- Verschieben per Ziehen am Griff ⠿ – auf dem Handy links und rechts an jeder Karte
- Handy: feste Spaltenleiste oben zum Springen und als Ablageziel beim Ziehen;
  die Knopfleiste der Dialoge bleibt unten über der Tastatur stehen (`interactive-widget=resizes-content`)
- Echtzeit-Abgleich, offline nutzbar (Änderungen werden nachgeholt)
- Installierbar (PWA): Android „Zum Startbildschirm hinzufügen“, macOS Safari „Zum Dock hinzufügen“
- Drei Farbschemata (**Rot & Schwarz**, **Blau**, **Pastell**) je hell und dunkel – Auswahl unter ⚙,
  gespeichert pro Gerät
- Backup als JSON-Datei (Einstellungen ⚙)

## Technik

Bewusst einfach gehalten: **reines HTML, CSS und JavaScript** – kein Framework, kein Build-Schritt,
keine Abhängigkeiten außer der Supabase-Bibliothek (per CDN, feste Version, mit Prüfsumme).

| Datei | Zweck |
|---|---|
| `index.html` | Seitengerüst, Dialoge, Einstellungsmenü |
| `style.css` | Gestaltung inkl. Farbschemata, Dunkelmodus und Handy-Layout |
| `thema.js` | setzt das gespeicherte Farbschema schon im `<head>` (kein Aufblitzen) |
| `app.js` | Board: Daten, Ansichten, Zeichnen, Bearbeiten, Ziehen & Ablegen, Diktieren, Backup |
| `sync.js` | Abgleich mit Supabase: Anmeldung, Passwort, Hoch-/Herunterladen, Echtzeit |
| `familie.js` | Mitglieder, Zuweisung, „Familie verwalten“, Benachrichtigungen (App-Seite) |
| `config.js` | Supabase-URL, **öffentlicher** Schlüssel, öffentlicher VAPID-Schlüssel |
| `sw.js` | Service Worker: Offline-Start („Netz zuerst, sonst Cache“), Push-Empfang |
| `manifest.webmanifest`, `icons/` | App-Name, Symbole, Vollbild-Start |
| `supabase.sql` | Datenbank-Schema mit Zugriffsschutz (wiederholbar ausführbar) |
| `supabase/functions/benachrichtigen/` | Edge Function, die die Push-Nachrichten verschickt |
| `ANLEITUNG.md` | Schritt-für-Schritt-Einrichtung |

Code-Kommentare und Bezeichner sind auf Deutsch.

### Datenmodell (siehe `supabase.sql`)

Eine Supabase-Datenbank ist **eine Familie**.

`mitglieder` – Familienmitglieder

| Feld | Bedeutung |
|---|---|
| `id` | UUID |
| `name`, `kuerzel`, `farbe` | Anzeige (Kürzel = Text der Zuweisungsknöpfe) |
| `email` | verknüpft das Mitglied beim ersten Anmelden mit seinem Konto (`mitglied_verknuepfen()`) |
| `user_id` | Konto des Mitglieds, leer = Mitglied ohne eigenes Konto |
| `benachrichtigungen` | `{ zuweisung, aenderung, morgens }` je `true`/`false` |
| `letzte_tagesmeldung` | verhindert doppelte Morgenmeldungen |

`karten` – Aufgaben

| Feld | Bedeutung |
|---|---|
| `id` | Text-ID, wird im Browser erzeugt |
| `user_id` | wer die Karte angelegt hat (setzt die Datenbank) |
| `zugewiesen` | Mitglied, dem die Aufgabe gehört (oder leer) |
| `privat` | nur für den Ersteller sichtbar; ein Trigger weist die Aufgabe dann immer dem Ersteller zu |
| `titel`, `notiz` | Inhalt |
| `prio` | `''`, `niedrig`, `mittel`, `hoch` |
| `faellig` | Datum `JJJJ-MM-TT` oder leer |
| `spalte` | `backlog`, `offen`, `arbeit`, `erledigt` |
| `position` | Reihenfolge innerhalb der Spalte (Kommazahl; Einsortieren = Mittelwert der Nachbarn) |
| `geaendert` | Zeitstempel der letzten Änderung – entscheidet bei Konflikten |
| `geloescht` | Löschungen werden nur markiert, damit andere Geräte sie mitbekommen |

`push_abos` – ein Eintrag je Gerät mit eingeschalteten Benachrichtigungen (nur über Funktionen erreichbar).

### Abgleich (sync.js)

- Alle Karten liegen zusätzlich im `localStorage` des Geräts → das Board funktioniert offline.
- Jede Änderung setzt `geaendert`, merkt die Karte als „ausstehend“ und lädt sie per `upsert` hoch.
  Fehlgeschlagenes wird beim nächsten Abgleich nachgeholt. Lehnt die Datenbank eine einzelne Karte
  ab (Prüfregel oder Zugriffsschutz), wird sie übersprungen statt den ganzen Abgleich zu blockieren.
- Beim vollständigen Abgleich werden lokale Karten entfernt, die der Server nicht mehr liefert
  (z. B. von jemand anderem privat gestellt). Supabase liefert standardmäßig höchstens 1000 Zeilen –
  bei mehr Karten muss der Abruf seitenweise erfolgen.
- Abgeglichen wird beim Start, beim Zurückkehren zur App, bei wiederhergestellter Verbindung
  und live über Supabase Realtime (Karten und Mitglieder).
- Konflikte: pro Karte gewinnt die Fassung mit dem neueren `geaendert`.
- Ohne Eintrag in `config.js` läuft das Board rein lokal (ohne Familienfunktionen).

### Benachrichtigungen

1. Auf dem Gerät: ⚙ → *Benachrichtigungen* → *Auf diesem Gerät aktivieren* (Web Push, VAPID).
   Das Abo wird über `push_abo_speichern()` gespeichert.
2. Nach dem Hochladen meldet die App zugewiesene bzw. geänderte Karten an die Edge Function
   `benachrichtigen`. Diese prüft Anmeldung und Familienzugehörigkeit, liest die Karte selbst
   aus der Datenbank und schickt die Nachricht an die Geräte der zugewiesenen Person
   (nicht an sich selbst, nur wenn deren Einstellung es erlaubt).
3. Morgens ruft ein Cron-Job (`pg_cron` + `pg_net`) die Funktion mit `{ "art": "morgens" }` auf –
   jede Person bekommt höchstens eine Meldung pro Tag.

Der private VAPID-Schlüssel liegt nur als Geheimnis `VAPID_PRIVATE_KEY` bei der Edge Function.

### Sicherheit

- Row Level Security: Nur verknüpfte Familienmitglieder (`ist_mitglied()`) lesen und ändern Karten
  und Mitglieder; private Karten nur ihr Ersteller. Sich selbst kann man nicht entfernen.
- Minimale Tabellenrechte: `anon` hat keine. `authenticated` darf Karten lesen, anlegen und ändern
  (Spaltenrechte: Ersteller `user_id` ist nicht änderbar), Mitglieder lesen/anlegen/ändern/entfernen
  (die Konto-Verknüpfung `user_id` nur über `mitglied_verknuepfen()`). Kein `DELETE` auf Karten,
  kein `TRUNCATE`, kein direkter Zugriff auf `push_abos`.
- Prüfregeln (`CHECK`) für Längen und erlaubte Werte. **Neue Spalten oder Prioritäten müssen dort
  mit ergänzt werden**, sonst lehnt die Datenbank sie ab.
- Content-Security-Policy (Meta-Tag in `index.html`): Skripte nur von der eigenen Seite und
  `cdn.jsdelivr.net`, Verbindungen nur zu `*.supabase.co`.
- Subresource Integrity für die Supabase-Bibliothek. Bei einem Versionswechsel neu berechnen:
  ```bash
  curl -s https://cdn.jsdelivr.net/npm/@supabase/supabase-js@VERSION/dist/umd/supabase.js \
    | openssl dgst -sha384 -binary | openssl base64 -A
  ```
  und in `index.html` (`integrity="sha384-…"`) sowie die URL in `sw.js` anpassen.
- In `config.js` stehen nur öffentliche Schlüssel. Der geheime `service_role`-Schlüssel und der
  private VAPID-Schlüssel gehören **nie** in dieses Repo.
- Neue Registrierungen sind abgeschaltet; Konten für Familienmitglieder legt der Admin im
  Supabase-Dashboard an.
- `migration-*.sql` (einmalige Datenübernahmen mit privaten Inhalten) ist per `.gitignore` ausgeschlossen.

## Lokal entwickeln

```bash
python3 -m http.server 8765
```

Dann http://localhost:8765 öffnen. Nach Änderungen an CSS/JS die Versionsnummer `?v=…` in
`index.html` und `CACHE` in `sw.js` hochzählen, damit installierte Apps die neue Fassung sofort laden.

## Veröffentlichen

Das Repo wird über **GitHub Pages** (Branch `main`, Ordner `/`) ausgeliefert – ein `git push`
genügt, nach ca. einer Minute ist die neue Version online. Änderungen an `supabase.sql` und an der
Edge Function werden im Supabase-Dashboard eingespielt (SQL-Editor bzw. Edge Functions → Editor).

## Eigene Instanz aufsetzen

Siehe [`ANLEITUNG.md`](ANLEITUNG.md).

## Ideen für später

- Wiederkehrende Aufgaben
- Projekte/Schlagwörter und Filter nach Person
- KI-Assistent (z. B. Aufgaben aus Alltagssprache anlegen, Tagesplanung) über eine
  Supabase Edge Function – der API-Schlüssel muss dabei auf dem Server bleiben
- Bei deutlich mehr Umfang: Umstieg auf ein Framework (z. B. Svelte oder React)

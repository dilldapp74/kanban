# Mein Kanban – Einrichtung des Abgleichs

Ohne Einrichtung läuft das Board sofort, speichert aber nur auf dem jeweiligen Gerät.
Mit den folgenden Schritten (ca. 15 Minuten) gleichen sich alle deine Geräte über Supabase ab.

## 1. Supabase-Projekt anlegen
1. Auf https://supabase.com kostenlos registrieren und **New project** anlegen
   (Name z. B. `kanban`, Region z. B. *Frankfurt*, Datenbank-Passwort sicher notieren).
2. Links **SQL Editor** öffnen, den kompletten Inhalt von `supabase.sql` einfügen und **Run** klicken.
   Das legt die Tabelle `karten` samt Zugriffsschutz an.

## 2. Zugangsdaten eintragen
1. Im Dashboard oben auf **Connect** klicken (oder *Project Settings → API Keys*).
2. **Project URL** und den **öffentlichen Schlüssel** (`anon public` bzw. `publishable`) kopieren.
3. In `config.js` eintragen:
   ```js
   const SUPABASE_URL = 'https://xxxx.supabase.co';
   const SUPABASE_KEY = 'eyJ…';   // bzw. 'sb_publishable_…'
   ```
   ⚠️ Niemals den `service_role`- bzw. `secret`-Schlüssel verwenden.

## 3. Online stellen (GitHub Pages, kostenlos)
Damit das Handy das Board per Adresse öffnen kann:
1. Auf https://github.com ein Konto anlegen und ein neues Repository erstellen (z. B. `kanban`, *Public*).
2. **Add file → Upload files**: alle Dateien aus diesem Ordner hochladen
   (`index.html`, `style.css`, `app.js`, `sync.js`, `config.js`).
   `supabase.sql` und diese Anleitung brauchst du dort nicht.
3. **Settings → Pages**: unter *Branch* `main` und `/ (root)` wählen, speichern.
4. Nach ca. einer Minute ist das Board unter `https://DEINNAME.github.io/kanban/` erreichbar.

Der öffentliche Schlüssel in `config.js` ist dann für jeden sichtbar – das ist so vorgesehen.
Deine Aufgaben schützt der Zugriffsschutz: Jedes Konto sieht nur seine eigenen Karten.

## 4. Anmeldung einstellen
In Supabase unter **Authentication**:
1. **URL Configuration → Site URL** auf deine GitHub-Pages-Adresse setzen
   (damit der Bestätigungslink aus der E-Mail zurück zum Board führt).
2. Im Board auf **Anmelden → Neu registrieren** klicken, E-Mail bestätigen, anmelden.
3. Empfohlen, sobald dein Konto existiert: Unter **Sign In / Providers** die Option
   **Allow new users to sign up** ausschalten – dann kann sich niemand sonst registrieren.

## 5. Auf dem Handy
1. Adresse in Chrome öffnen und anmelden.
2. Menü ⋮ → **Zum Startbildschirm hinzufügen** → **Installieren** – das Board startet dann wie eine App
   (eigenes Symbol, ohne Adressleiste, startet auch offline).

## Gut zu wissen
- **Offline:** Änderungen werden lokal gespeichert und automatisch hochgeladen, sobald wieder Internet da ist
  (Statuspunkt oben: grün = abgeglichen, gelb = wird nachgeholt). Das allererste Öffnen braucht Internet.
- **Konflikte:** Wurde dieselbe Karte auf zwei Geräten geändert, gewinnt die zuletzt gespeicherte Fassung.
  Unterschiedliche Karten werden problemlos zusammengeführt.
- **Erste Anmeldung auf einem Gerät:** Gibt es dort schon eigene Aufgaben, fragt das Board, ob sie ins Konto übernommen werden.
- **Abmelden** entfernt die Aufgaben vom Gerät; sie bleiben im Konto.
- **Sichern** erstellt weiterhin eine Backup-Datei – zusätzlich zur Datenbank eine gute Idee.
- Im kostenlosen Tarif pausiert Supabase Projekte nach ca. einer Woche ohne Nutzung;
  im Dashboard lassen sie sich mit einem Klick wieder starten.

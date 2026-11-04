# Family Kanban – Einrichtung

Ohne Einrichtung läuft das Board sofort, speichert aber nur auf dem jeweiligen Gerät.
Mit den folgenden Schritten (ca. 30 Minuten) nutzt die ganze Familie dieselben Aufgaben.

## 1. Supabase-Projekt anlegen
1. Auf https://supabase.com kostenlos registrieren und **New project** anlegen
   (Region z. B. *Frankfurt*, Datenbank-Passwort sicher notieren).
2. **Authentication → Users → Add user → Create new user**: dein eigenes Konto anlegen
   (E-Mail, Passwort, *Auto Confirm User* anhaken).
3. **SQL Editor**: den kompletten Inhalt von `supabase.sql` einfügen und **Run** klicken.
4. Danach im SQL Editor dich selbst als erstes Familienmitglied eintragen:
   ```sql
   insert into public.mitglieder (name, kuerzel, email) values ('Vorname', 'V', 'deine@email.de');
   ```
   Beim ersten Anmelden in der App wird das Mitglied automatisch mit deinem Konto verknüpft.

## 2. Zugangsdaten eintragen
1. Im Dashboard oben auf **Connect** klicken (oder *Project Settings → API Keys*).
2. **Project URL** und den **öffentlichen Schlüssel** (`publishable` bzw. `anon public`) in `config.js` eintragen.
   ⚠️ Niemals den `service_role`- bzw. `secret`-Schlüssel verwenden.

## 3. Online stellen (GitHub Pages, kostenlos)
1. Repository auf GitHub anlegen (*Public*) und alle Dateien dieses Ordners hochladen.
2. **Settings → Pages**: *Branch* `main`, `/ (root)`, speichern.
3. Nach ca. einer Minute ist das Board unter `https://DEINNAME.github.io/REPO/` erreichbar.
4. In Supabase unter **Authentication → URL Configuration → Site URL** diese Adresse eintragen.
5. Unter **Authentication → Sign In / Providers** die Option **Allow new users to sign up** ausschalten.

## 4. Familie einrichten
1. In der App anmelden → ⚙ → **Familie verwalten**: Mitglieder mit Vorname anlegen.
   Das Kürzel (Anfangsbuchstabe) wird vorgeschlagen; bei gleichen Anfangsbuchstaben die ersten zwei.
2. Wer die App **selbst nutzen** soll, bekommt beim Mitglied seine E-Mail eingetragen **und** im
   Supabase-Dashboard unter **Authentication → Users → Add user → Create new user** ein Konto mit
   derselben E-Mail (*Auto Confirm User* anhaken). Das Startpasswort teilst du persönlich mit –
   in der App lässt es sich unter ⚙ → **Passwort ändern** ersetzen.
3. Kinder ohne Handy brauchen kein Konto – ihnen lassen sich trotzdem Aufgaben zuweisen.

## 5. Benachrichtigungen (optional)
1. Ein VAPID-Schlüsselpaar erzeugen, z. B. mit `npx web-push generate-vapid-keys`.
   Den öffentlichen Schlüssel in `config.js` (`VAPID_PUBLIC_KEY`) und in
   `supabase/functions/benachrichtigen/index.ts` eintragen.
2. **Edge Functions → Deploy a new function → Via Editor**: Name `benachrichtigen`, Inhalt von
   `supabase/functions/benachrichtigen/index.ts` einfügen, deployen.
   In den Einstellungen der Funktion **Verify JWT** ausschalten (die Funktion prüft selbst).
3. **Edge Functions → Secrets**: Geheimnis `VAPID_PRIVATE_KEY` mit dem privaten Schlüssel anlegen.
4. Für die Morgenmeldung den Cron-Block am Ende von `supabase.sql` mit der eigenen Projekt-ID im
   SQL Editor ausführen.
5. In der App: ⚙ → **Benachrichtigungen** → **Auf diesem Gerät aktivieren** – auf jedem Gerät einzeln.

## 6. Auf Handy und Mac installieren
- **Android:** Adresse in Chrome öffnen, Menü ⋮ → **Zum Startbildschirm hinzufügen** → **Installieren**.
- **Mac:** Adresse in Safari öffnen, **Ablage → Zum Dock hinzufügen**.
- In der installierten App einmal anmelden.

## Gut zu wissen
- **Offline:** Änderungen werden lokal gespeichert und automatisch hochgeladen, sobald wieder Internet da ist
  (Statuspunkt oben: grün = abgeglichen, gelb = wird nachgeholt). Das allererste Öffnen braucht Internet.
- **Konflikte:** Wurde dieselbe Karte auf zwei Geräten geändert, gewinnt die zuletzt gespeicherte Fassung.
- **Abmelden** entfernt die Aufgaben vom Gerät und schaltet dort die Benachrichtigungen ab.
- **Diktieren** nutzt die Spracherkennung des Browsers (Chrome auf Android, Safari auf dem Mac).
- Im kostenlosen Tarif pausiert Supabase Projekte nach ca. einer Woche ohne Nutzung;
  im Dashboard lassen sie sich mit einem Klick wieder starten.

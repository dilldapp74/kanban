-- Datenbank für Family Kanban.
-- Im Supabase-Dashboard unter "SQL Editor" komplett einfügen und ausführen.
-- Das Skript ist wiederholbar: Es baut eine neue Datenbank auf oder bringt eine
-- bestehende auf den aktuellen Stand, ohne Daten zu löschen.
--
-- Eine Supabase-Datenbank = eine Familie. Wer in "mitglieder" mit seinem Konto
-- verknüpft ist, sieht und bearbeitet alle Aufgaben der Familie.

-- ---------- Familienmitglieder ----------

create table if not exists public.mitglieder (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  kuerzel             text not null,                     -- Anfangsbuchstabe(n) für die Knöpfe
  farbe               text not null default '#e11d48',
  email               text,                              -- verknüpft das Mitglied beim ersten Anmelden mit seinem Konto
  user_id             uuid unique references auth.users (id) on delete set null,
  benachrichtigungen  jsonb not null default '{"zuweisung": true, "morgens": true, "aenderung": true}',
  letzte_tagesmeldung date,                              -- verhindert doppelte Morgenmeldungen
  erstellt            timestamptz not null default now()
);

create unique index if not exists mitglieder_email_idx on public.mitglieder (lower(email));

alter table public.mitglieder drop constraint if exists mitglieder_name_laenge;
alter table public.mitglieder drop constraint if exists mitglieder_kuerzel_laenge;
alter table public.mitglieder drop constraint if exists mitglieder_farbe_format;
alter table public.mitglieder drop constraint if exists mitglieder_email_format;
alter table public.mitglieder
  add constraint mitglieder_name_laenge check (char_length(name) between 1 and 40),
  add constraint mitglieder_kuerzel_laenge check (char_length(kuerzel) between 1 and 3),
  add constraint mitglieder_farbe_format check (farbe ~ '^#[0-9a-fA-F]{6}$'),
  add constraint mitglieder_email_format check (email is null or (char_length(email) <= 200 and email like '%_@_%'));

-- Gehört das angemeldete Konto zur Familie?
create or replace function public.ist_mitglied() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.mitglieder where user_id = (select auth.uid()));
$$;

-- Beim Anmelden: Konto über die E-Mail-Adresse mit seinem Mitglied verknüpfen
create or replace function public.mitglied_verknuepfen() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  m uuid;
begin
  select id into m from public.mitglieder where user_id = auth.uid();
  if m is not null then
    return m;
  end if;
  update public.mitglieder set user_id = auth.uid()
    where user_id is null and lower(email) = lower(auth.jwt() ->> 'email')
    returning id into m;
  return m;
end $$;

-- ---------- Karten ----------

create table if not exists public.karten (
  id         text primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade, -- wer die Karte angelegt hat
  titel      text not null,
  notiz      text not null default '',
  prio       text not null default '',
  faellig    text not null default '',          -- Datum als 'JJJJ-MM-TT' oder leer
  spalte     text not null,
  position   double precision not null default 0, -- Reihenfolge innerhalb der Spalte
  geaendert  timestamptz not null default now(),  -- für "neueste Änderung gewinnt"
  geloescht  boolean not null default false       -- gelöschte Karten bleiben markiert, damit andere Geräte es erfahren
);

alter table public.karten add column if not exists zugewiesen uuid references public.mitglieder (id) on delete set null;
-- Private Aufgaben sieht und ändert nur, wer sie angelegt hat (siehe Zugriffsschutz unten)
alter table public.karten add column if not exists privat boolean not null default false;

-- Private Aufgaben gehören immer ihrem Ersteller – auch wenn ein Gerät etwas anderes schickt
create or replace function public.privat_zuordnen() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.privat then
    new.zugewiesen := (select id from public.mitglieder where user_id = new.user_id);
  end if;
  return new;
end $$;

drop trigger if exists privat_zuordnen on public.karten;
create trigger privat_zuordnen before insert or update on public.karten
  for each row execute function public.privat_zuordnen();

create index if not exists karten_user_id_idx on public.karten (user_id);
create index if not exists karten_zugewiesen_idx on public.karten (zugewiesen);

-- Prüfregeln: Die Datenbank nimmt nur gültige Werte an (gleiche Grenzen wie in der App)
alter table public.karten drop constraint if exists karten_id_laenge;
alter table public.karten drop constraint if exists karten_titel_laenge;
alter table public.karten drop constraint if exists karten_notiz_laenge;
alter table public.karten drop constraint if exists karten_prio_wert;
alter table public.karten drop constraint if exists karten_faellig_format;
alter table public.karten drop constraint if exists karten_spalte_wert;
alter table public.karten
  add constraint karten_id_laenge check (char_length(id) between 1 and 64),
  add constraint karten_titel_laenge check (char_length(titel) between 1 and 200),
  add constraint karten_notiz_laenge check (char_length(notiz) <= 5000),
  add constraint karten_prio_wert check (prio in ('', 'niedrig', 'mittel', 'hoch')),
  add constraint karten_faellig_format check (faellig = '' or faellig ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  add constraint karten_spalte_wert check (spalte in ('backlog', 'offen', 'arbeit', 'erledigt'));

-- Wird ein Mitglied entfernt, werden seine Aufgaben frei – mit neuem Zeitstempel,
-- damit alle Geräte die Änderung übernehmen
create or replace function public.mitglied_entfernt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.karten set zugewiesen = null, geaendert = now() where zugewiesen = old.id;
  return old;
end $$;

drop trigger if exists mitglied_entfernt on public.mitglieder;
create trigger mitglied_entfernt before delete on public.mitglieder
  for each row execute function public.mitglied_entfernt();

-- ---------- Push-Benachrichtigungen ----------

-- Ein Eintrag je Gerät, auf dem Benachrichtigungen aktiviert sind.
-- Kein direkter Zugriff aus der App – nur über die Funktionen unten bzw. die Edge Function.
create table if not exists public.push_abos (
  endpoint  text primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  p256dh    text not null,
  auth      text not null,
  erstellt  timestamptz not null default now()
);

create or replace function public.push_abo_speichern(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.ist_mitglied() then
    raise exception 'Nur Familienmitglieder können Benachrichtigungen aktivieren';
  end if;
  if char_length(p_endpoint) > 1000 or char_length(p_p256dh) > 200 or char_length(p_auth) > 100
     or p_endpoint not like 'https://%' then
    raise exception 'Ungültiges Abo';
  end if;
  insert into public.push_abos (endpoint, user_id, p256dh, auth)
    values (p_endpoint, auth.uid(), p_p256dh, p_auth)
    on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.push_abo_loeschen(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_abos where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

-- ---------- Zugriffsschutz ----------

alter table public.mitglieder enable row level security;
alter table public.karten enable row level security;
alter table public.push_abos enable row level security;   -- ohne Regeln: kein direkter Zugriff

-- Alte Regeln aus der Ein-Personen-Version entfernen
drop policy if exists "Eigene Karten lesen" on public.karten;
drop policy if exists "Eigene Karten anlegen" on public.karten;
drop policy if exists "Eigene Karten ändern" on public.karten;

drop policy if exists "Familie liest Karten" on public.karten;
create policy "Familie liest Karten" on public.karten
  for select to authenticated using ((select public.ist_mitglied()) and (not privat or user_id = (select auth.uid())));

drop policy if exists "Familie legt Karten an" on public.karten;
create policy "Familie legt Karten an" on public.karten
  for insert to authenticated with check ((select public.ist_mitglied()) and user_id = (select auth.uid()));

drop policy if exists "Familie ändert Karten" on public.karten;
create policy "Familie ändert Karten" on public.karten
  for update to authenticated
  using ((select public.ist_mitglied()) and (not privat or user_id = (select auth.uid())))
  with check ((select public.ist_mitglied()) and (not privat or user_id = (select auth.uid())));

drop policy if exists "Familie sieht Mitglieder" on public.mitglieder;
create policy "Familie sieht Mitglieder" on public.mitglieder
  for select to authenticated using ((select public.ist_mitglied()));

drop policy if exists "Familie legt Mitglieder an" on public.mitglieder;
create policy "Familie legt Mitglieder an" on public.mitglieder
  for insert to authenticated with check ((select public.ist_mitglied()));

drop policy if exists "Familie ändert Mitglieder" on public.mitglieder;
create policy "Familie ändert Mitglieder" on public.mitglieder
  for update to authenticated using ((select public.ist_mitglied())) with check ((select public.ist_mitglied()));

drop policy if exists "Familie entfernt Mitglieder" on public.mitglieder;
create policy "Familie entfernt Mitglieder" on public.mitglieder
  for delete to authenticated using ((select public.ist_mitglied()) and user_id is distinct from (select auth.uid()));

-- Nur die nötigen Rechte. (Supabase vergibt sonst standardmäßig alle Rechte inkl. DELETE und TRUNCATE.)
-- Spaltenrechte: Ersteller (user_id) und Konto-Verknüpfung (user_id) kann die App nicht verändern.
revoke all on table public.karten, public.mitglieder, public.push_abos from anon, authenticated;
grant select, insert on table public.karten to authenticated;
grant update (id, titel, notiz, prio, faellig, spalte, position, geaendert, geloescht, zugewiesen, privat)
  on table public.karten to authenticated;
grant select, delete on table public.mitglieder to authenticated;
grant insert (name, kuerzel, farbe, email) on table public.mitglieder to authenticated;
grant update (name, kuerzel, farbe, email, benachrichtigungen) on table public.mitglieder to authenticated;

revoke all on function public.ist_mitglied(), public.mitglied_verknuepfen(),
  public.push_abo_speichern(text, text, text), public.push_abo_loeschen(text),
  public.mitglied_entfernt(), public.privat_zuordnen() from public, anon;
grant execute on function public.ist_mitglied(), public.mitglied_verknuepfen(),
  public.push_abo_speichern(text, text, text), public.push_abo_loeschen(text) to authenticated;

-- ---------- Echtzeit: Änderungen sofort an alle Geräte ----------

do $$
begin
  alter publication supabase_realtime add table public.karten;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.mitglieder;
exception when duplicate_object then null;
end $$;

-- ---------- Erstes Mitglied (einmalig, eigene Daten eintragen) ----------
-- Ohne mindestens ein verknüpftes Mitglied sieht niemand Aufgaben. Danach lassen
-- sich weitere Mitglieder in der App unter ⚙ → "Familie verwalten" anlegen.
--
-- insert into public.mitglieder (name, kuerzel, email)
--   values ('Vorname', 'V', 'deine@email.de');

-- ---------- Morgenmeldung (nach dem Anlegen der Edge Function "benachrichtigen") ----------
-- PROJEKT-ID durch die eigene ersetzen. 6 Uhr UTC = 7 Uhr Winterzeit / 8 Uhr Sommerzeit.
--
-- create extension if not exists pg_cron with schema pg_catalog;
-- create extension if not exists pg_net with schema extensions;
-- select cron.schedule('tagesmeldung', '0 6 * * *', $job$
--   select net.http_post(
--     url := 'https://PROJEKT-ID.supabase.co/functions/v1/benachrichtigen',
--     body := '{"art": "morgens"}'::jsonb,
--     headers := '{"Content-Type": "application/json"}'::jsonb
--   )
-- $job$);

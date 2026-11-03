-- Datenbank für das Kanban-Board.
-- Einmal im Supabase-Dashboard unter "SQL Editor" einfügen und ausführen.

create table if not exists public.karten (
  id         text primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titel      text not null,
  notiz      text not null default '',
  prio       text not null default '',
  faellig    text not null default '',          -- Datum als 'JJJJ-MM-TT' oder leer
  spalte     text not null,
  position   double precision not null default 0, -- Reihenfolge innerhalb der Spalte
  geaendert  timestamptz not null default now(),  -- für "neueste Änderung gewinnt"
  geloescht  boolean not null default false       -- gelöschte Karten bleiben markiert, damit andere Geräte es erfahren
);

create index if not exists karten_user_id_idx on public.karten (user_id);

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

-- Zugriffsschutz: Jede Person sieht und ändert nur ihre eigenen Karten
alter table public.karten enable row level security;

drop policy if exists "Eigene Karten lesen" on public.karten;
create policy "Eigene Karten lesen" on public.karten
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Eigene Karten anlegen" on public.karten;
create policy "Eigene Karten anlegen" on public.karten
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Eigene Karten ändern" on public.karten;
create policy "Eigene Karten ändern" on public.karten
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Nur die nötigen Rechte: Nicht angemeldete gar nichts, Angemeldete lesen/anlegen/ändern.
-- (Supabase vergibt sonst standardmäßig alle Rechte inkl. DELETE und TRUNCATE.)
revoke all on table public.karten from anon;
revoke all on table public.karten from authenticated;
grant select, insert, update on table public.karten to authenticated;

-- Echtzeit: andere Geräte bekommen Änderungen sofort mit
do $$
begin
  alter publication supabase_realtime add table public.karten;
exception when duplicate_object then null;
end $$;

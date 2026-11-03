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

grant select, insert, update on public.karten to authenticated;

-- Echtzeit: andere Geräte bekommen Änderungen sofort mit
do $$
begin
  alter publication supabase_realtime add table public.karten;
exception when duplicate_object then null;
end $$;

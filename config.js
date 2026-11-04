// Zugangsdaten deines Supabase-Projekts
// (Supabase-Dashboard → Project Settings → API bzw. "API Keys").
//
// Der öffentliche Schlüssel ("anon public" oder "publishable") darf hier stehen:
// Er ist für den Browser gedacht. Geschützt werden die Daten durch die
// Zugriffsregeln aus supabase.sql. Den "service_role"/"secret"-Schlüssel
// NIEMALS hier eintragen!
//
//NEXT_PUBLIC_SUPABASE_URL=https://niwyndovxqsgxxlsxvrs.supabase.co
//NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_nMdVy5IVFa7OjEsfR9U5EQ_7YUEuw9L
//
// Beide Felder leer lassen = das Board speichert nur auf diesem Gerät.

const SUPABASE_URL = 'https://niwyndovxqsgxxlsxvrs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nMdVy5IVFa7OjEsfR9U5EQ_7YUEuw9L';

// Öffentlicher Schlüssel für Push-Benachrichtigungen (VAPID). Der passende private
// Schlüssel liegt nur als Geheimnis "VAPID_PRIVATE_KEY" bei der Supabase Edge Function.
// Leer lassen = keine Benachrichtigungen.
const VAPID_PUBLIC_KEY = 'BFJoFS7Y6D-SqOYR-KDmyEK-z5A2lgyn5kDA2HRsx72FqEi76OljLHw3okJSbXdDapRNP1kiTNvAvuFeuAIZOnc';

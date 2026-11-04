// Supabase Edge Function "benachrichtigen" – verschickt Push-Nachrichten.
//
// Aufrufe:
//   { art: "zuweisung" | "aenderung", karte_id }  aus der App (mit Anmelde-Token)
//   { art: "morgens" }                              täglich per Cron (siehe supabase.sql)
//
// Einstellungen im Dashboard: "Verify JWT" AUS (die Funktion prüft das Token selbst),
// Geheimnis VAPID_PRIVATE_KEY setzen. SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY
// stellt Supabase automatisch bereit.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.110.0";

// Öffentlicher Schlüssel – derselbe wie VAPID_PUBLIC_KEY in config.js
const VAPID_PUBLIC_KEY = "BFJoFS7Y6D-SqOYR-KDmyEK-z5A2lgyn5kDA2HRsx72FqEi76OljLHw3okJSbXdDapRNP1kiTNvAvuFeuAIZOnc";
const APP_URL = "https://dilldapp74.github.io/kanban/";

webpush.setVapidDetails(APP_URL, VAPID_PUBLIC_KEY, Deno.env.get("VAPID_PRIVATE_KEY")!);

// Mit dem Service-Schlüssel: liest alle Daten, deshalb prüft die Funktion jede Anfrage selbst
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SPALTEN: Record<string, string> = {
  backlog: "Backlog", offen: "Offen", arbeit: "In Arbeit", erledigt: "Erledigt",
};

function antwort(text: string, status = 200) {
  return new Response(text, { status, headers: CORS });
}

// Nachricht an alle Geräte einer Person; abgelaufene Abos werden entfernt
async function sendeAn(userId: string, titel: string, text: string, tag: string) {
  const { data: abos } = await admin.from("push_abos").select("endpoint, p256dh, auth").eq("user_id", userId);
  for (const abo of abos ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } },
        JSON.stringify({ titel, text, tag }),
        { TTL: 60 * 60 * 12 },
      );
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_abos").delete().eq("endpoint", abo.endpoint);
      else console.error("Push fehlgeschlagen:", code, e);
    }
  }
}

// Zuweisung oder Änderung einer Karte melden
async function karteMelden(req: Request, art: string, karteId: string) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return antwort("nicht angemeldet", 401);

  const { data: absender } = await admin.from("mitglieder").select("id, name").eq("user_id", user.id).maybeSingle();
  if (!absender) return antwort("kein Familienmitglied", 403);

  const { data: karte } = await admin.from("karten")
    .select("titel, spalte, zugewiesen, geloescht").eq("id", karteId).maybeSingle();
  if (!karte || karte.geloescht || !karte.zugewiesen || karte.zugewiesen === absender.id) return antwort("nichts zu tun");

  const { data: ziel } = await admin.from("mitglieder")
    .select("user_id, benachrichtigungen").eq("id", karte.zugewiesen).maybeSingle();
  if (!ziel?.user_id) return antwort("Person nutzt die App nicht");
  const einstellungen = ziel.benachrichtigungen ?? {};

  if (art === "zuweisung" && einstellungen.zuweisung !== false) {
    await sendeAn(ziel.user_id, `${absender.name} hat dir eine Aufgabe gegeben`, karte.titel, "karte-" + karteId);
  } else if (art === "aenderung" && einstellungen.aenderung !== false) {
    await sendeAn(ziel.user_id, `${absender.name} hat deine Aufgabe geändert`,
      `${karte.titel} · ${SPALTEN[karte.spalte] ?? karte.spalte}`, "karte-" + karteId);
  }
  return antwort("ok");
}

// Morgens: jedem einmal am Tag seine heute fälligen und überfälligen Aufgaben
async function morgenMeldung() {
  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()); // JJJJ-MM-TT
  const { data: personen } = await admin.from("mitglieder")
    .select("id, user_id, benachrichtigungen, letzte_tagesmeldung").not("user_id", "is", null);

  for (const p of personen ?? []) {
    if (p.letzte_tagesmeldung === heute || p.benachrichtigungen?.morgens === false) continue;
    // Zuerst als erledigt vermerken – so gibt es auch bei doppeltem Aufruf nur eine Meldung
    await admin.from("mitglieder").update({ letzte_tagesmeldung: heute }).eq("id", p.id);

    const { data: karten } = await admin.from("karten").select("titel, faellig")
      .eq("zugewiesen", p.id).eq("geloescht", false).neq("spalte", "erledigt")
      .neq("faellig", "").lte("faellig", heute).order("faellig");
    if (!karten?.length) continue;

    const ueberfaellig = karten.filter((k) => k.faellig < heute).length;
    const titel = karten.length === 1 ? "1 Aufgabe für heute" : `${karten.length} Aufgaben für heute`;
    let text = karten.slice(0, 3).map((k) => k.titel).join(" · ");
    if (karten.length > 3) text += ` · und ${karten.length - 3} weitere`;
    if (ueberfaellig) text = `${ueberfaellig} überfällig – ` + text;
    await sendeAn(p.user_id, titel, text, "morgens");
  }
  return antwort("ok");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return antwort("ok");
  if (req.method !== "POST") return antwort("nur POST", 405);
  let body: { art?: string; karte_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return antwort("ungültige Anfrage", 400);
  }
  if (body.art === "morgens") return await morgenMeldung();
  if ((body.art === "zuweisung" || body.art === "aenderung") && typeof body.karte_id === "string") {
    return await karteMelden(req, body.art, body.karte_id);
  }
  return antwort("unbekannte Art", 400);
});

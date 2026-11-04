// ---------- Abgleich mit Supabase ----------
//
// Prinzip: Die Karten liegen immer auch lokal im Browser (funktioniert offline).
// Jede Änderung wird hochgeladen; was nicht klappt, bleibt in "ausstehend"
// und wird beim nächsten Abgleich nachgeholt. Haben zwei Geräte dieselbe Karte
// geändert, gewinnt die Fassung mit dem neueren Zeitstempel.
// Alle Familienmitglieder sehen dieselben Karten (siehe supabase.sql).

let sb = null;      // Supabase-Client (null = nur lokal)
let nutzer = null;  // angemeldeter Nutzer
let kanal = null;   // Echtzeit-Verbindung für Änderungen anderer Geräte

const statusAnzeige = document.getElementById('status');
const kontoKnopf = document.getElementById('kontoKnopf');
const kontoInfo = document.getElementById('kontoInfo');
const passwortKnopf = document.getElementById('passwortKnopf');

function syncStarten() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    statusSetzen('lokal');
    return;
  }
  if (!window.supabase) {
    // Bibliothek nicht geladen (z. B. offline beim Öffnen)
    statusSetzen('fehler');
    return;
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  kontoKnopf.hidden = false;
  statusSetzen('abgemeldet');

  sb.auth.onAuthStateChange((ereignis, sitzung) => {
    const neuerNutzer = sitzung ? sitzung.user : null;
    if ((neuerNutzer && neuerNutzer.id) === (nutzer && nutzer.id)) return;
    nutzer = neuerNutzer;
    // Supabase empfiehlt, hier nicht direkt weitere Anfragen zu stellen
    setTimeout(nutzer ? angemeldet : abgemeldet, 0);
  });

  // Beim Zurückkehren zur App und bei wiederhergestellter Verbindung abgleichen
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') abgleichen();
  });
  window.addEventListener('online', abgleichen);
}

function statusSetzen(zustand) {
  const texte = {
    lokal: 'Nur lokal',
    abgemeldet: 'Abgemeldet',
    laeuft: 'Gleiche ab…',
    ok: 'Abgeglichen',
    fehler: 'Offline',
    keineFamilie: 'Keine Familie'
  };
  const erklaerungen = {
    fehler: 'Keine Verbindung – Änderungen werden nachgeholt',
    keineFamilie: 'Dein Konto ist noch keinem Familienmitglied zugeordnet. Ein Mitglied mit deiner E-Mail muss unter „Familie verwalten“ angelegt werden.'
  };
  statusAnzeige.textContent = texte[zustand];
  statusAnzeige.className = 'status ' + zustand;
  statusAnzeige.title = erklaerungen[zustand] || (nutzer ? 'Angemeldet als ' + nutzer.email : texte[zustand]);
  kontoInfo.textContent = nutzer ? 'Angemeldet als ' + nutzer.email : (sb ? 'Nicht angemeldet' : 'Nur auf diesem Gerät');
}

// Auf dem Handy ist der Status nur ein Punkt – antippen zeigt die Erklärung
statusAnzeige.addEventListener('click', () => hinweisZeigen(statusAnzeige.title));

// Abgeglichen – oder angemeldet, aber (noch) nicht in der Familie
function statusNachAbgleich() {
  statusSetzen(meinMitglied ? 'ok' : 'keineFamilie');
}

async function angemeldet() {
  kontoKnopf.textContent = 'Abmelden';
  passwortKnopf.hidden = false;

  // Erste Anmeldung auf diesem Gerät: Was passiert mit den lokalen Karten?
  if (daten.nutzerId !== nutzer.id) {
    const lokale = daten.karten.filter(k => !k.geloescht);
    if (daten.unberuehrt || !lokale.length) {
      daten = leereDaten();
    } else if (confirm(lokale.length + ' Aufgaben von diesem Gerät für die Familie übernehmen?\n\n„Abbrechen“ verwirft sie auf diesem Gerät.')) {
      daten.ausstehend = daten.karten.map(k => k.id);
    } else {
      daten = leereDaten();
    }
    daten.nutzerId = nutzer.id;
    daten.unberuehrt = false;
    speichern();
    zeichnen();
  }

  // Konto über die E-Mail seinem Familienmitglied zuordnen, dann die Familie laden
  try {
    const { error } = await sb.rpc('mitglied_verknuepfen');
    if (error) throw error;
    await mitgliederLaden();
  } catch (e) {
    console.warn('Familie laden fehlgeschlagen:', e);
  }

  // Änderungen der anderen Familienmitglieder live empfangen
  kanal = sb.channel('familie')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'karten' },
      nachricht => { if (nachricht.new && nachricht.new.id) zusammenfuehren([nachricht.new]); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mitglieder' },
      () => mitgliederLaden().catch(e => console.warn('Familie laden fehlgeschlagen:', e)))
    .subscribe();

  await abgleichen();
}

function abgemeldet() {
  kontoKnopf.textContent = 'Anmelden';
  passwortKnopf.hidden = true;
  if (kanal) {
    sb.removeChannel(kanal);
    kanal = null;
  }
  familieZuruecksetzen();
  // Daten des Kontos nicht auf dem Gerät liegen lassen
  if (daten.nutzerId) {
    daten = leereDaten();
    speichern();
  }
  zeichnen();
  statusSetzen('abgemeldet');
}

// Vollständiger Abgleich: erst eigene Änderungen hoch, dann alles herunterladen
async function abgleichen() {
  if (!sb || !nutzer) return;
  statusSetzen('laeuft');
  try {
    await hochladen();
    const { data, error } = await sb.from('karten').select('*');
    if (error) throw error;
    zusammenfuehren(data);
    statusNachAbgleich();
  } catch (e) {
    console.warn('Abgleich fehlgeschlagen:', e);
    statusSetzen('fehler');
  }
}

// Wird von app.js nach jeder Änderung aufgerufen
function syncNachAenderung() {
  if (!sb || !nutzer) return;
  statusSetzen('laeuft');
  hochladen()
    .then(statusNachAbgleich)
    .catch(e => {
      console.warn('Hochladen fehlgeschlagen:', e);
      statusSetzen('fehler');
    });
}

// Ausstehende Karten hochladen – immer nur ein Vorgang gleichzeitig
let hochladenLaeuft = false;
let nochmalHochladen = false;

async function hochladen() {
  // Ohne Familienzugehörigkeit lässt die Datenbank nichts zu – Änderungen bleiben ausstehend
  if (!sb || !nutzer || !meinMitglied) return;
  if (hochladenLaeuft) {
    nochmalHochladen = true;
    return;
  }
  hochladenLaeuft = true;
  try {
    do {
      nochmalHochladen = false;
      // Stand merken: Wird eine Karte währenddessen erneut geändert, bleibt sie ausstehend
      const stand = new Map();
      for (const id of daten.ausstehend) {
        const k = daten.karten.find(x => x.id === id);
        if (k) stand.set(id, k.geaendert);
      }
      const zeilen = daten.karten.filter(k => stand.has(k.id)).map(zeileAus);
      if (zeilen.length) await zeilenHochladen(zeilen);
      daten.ausstehend = daten.ausstehend.filter(id => {
        const k = daten.karten.find(x => x.id === id);
        return k && k.geaendert !== stand.get(id);
      });
      speichern();
    } while (nochmalHochladen);
  } finally {
    hochladenLaeuft = false;
  }
  meldungenSenden();
}

// Erst alle Karten auf einmal. Lehnt die Datenbank etwas ab (Prüfregel verletzt),
// jede einzeln versuchen – so blockiert eine ungültige Karte nicht den ganzen Abgleich.
async function zeilenHochladen(zeilen) {
  const { error } = await sb.from('karten').upsert(zeilen);
  if (!error) return;
  if (!regelVerletzt(error)) throw error;
  for (const zeile of zeilen) {
    const { error: fehler } = await sb.from('karten').upsert(zeile);
    if (fehler && !regelVerletzt(fehler)) throw fehler;
    if (fehler) console.warn('Karte von der Datenbank abgelehnt und übersprungen:', zeile.id, fehler.message);
  }
}

// Fehlercodes 23… = Prüfregel oder Verweis verletzt (z. B. unbekannte Spalte)
function regelVerletzt(fehler) {
  return /^23/.test(fehler.code || '');
}

// Karte in eine Datenbankzeile umwandeln (user_id = Ersteller, setzt die Datenbank selbst)
function zeileAus(k) {
  return {
    id: k.id, titel: k.titel, notiz: k.notiz, prio: k.prio, faellig: k.faellig,
    spalte: k.spalte, position: k.position, geaendert: k.geaendert, geloescht: k.geloescht,
    // Zuweisung an ein inzwischen entferntes Mitglied nicht hochladen
    zugewiesen: k.zugewiesen && mitgliedNach(k.zugewiesen) ? k.zugewiesen : null
  };
}

// Karten vom Server mit den lokalen zusammenführen – die neuere Fassung gewinnt
function zusammenfuehren(zeilen) {
  let etwasNeu = false;
  for (const z of zeilen) {
    const fassung = {
      id: z.id, titel: z.titel, notiz: z.notiz, prio: z.prio, faellig: z.faellig,
      spalte: z.spalte, position: z.position, geaendert: z.geaendert, geloescht: z.geloescht,
      zugewiesen: z.zugewiesen || null
    };
    const lokal = daten.karten.find(k => k.id === z.id);
    if (!lokal) {
      daten.karten.push(fassung);
      etwasNeu = true;
    } else if (new Date(z.geaendert) > new Date(lokal.geaendert)) {
      Object.assign(lokal, fassung);
      daten.ausstehend = daten.ausstehend.filter(id => id !== z.id);
      etwasNeu = true;
    }
  }
  if (etwasNeu) {
    speichern();
    zeichnen();
  }
}

// ---------- Anmelden / Abmelden / Passwort ----------

function meldungSetzen(element, text, istFehler) {
  element.textContent = text;
  element.className = 'meldung' + (istFehler ? ' fehler' : '');
}

const kontoDialog = document.getElementById('kontoDialog');
const kontoFormular = document.getElementById('kontoFormular');
const kEmail = document.getElementById('kEmail');
const kPasswort = document.getElementById('kPasswort');
const kMeldung = document.getElementById('kMeldung');

kontoKnopf.onclick = async () => {
  if (nutzer) {
    if (daten.ausstehend.length && !confirm('Einige Änderungen sind noch nicht hochgeladen und gehen beim Abmelden verloren. Trotzdem abmelden?')) return;
    if (!confirm('Abmelden? Die Aufgaben werden von diesem Gerät entfernt und bleiben in der Familie gespeichert.')) return;
    await pushAbmelden();
    await sb.auth.signOut();
    return;
  }
  meldungSetzen(kMeldung, '');
  kPasswort.value = '';
  kontoDialog.showModal();
  kEmail.focus();
};

document.getElementById('kAbbrechenKnopf').onclick = () => kontoDialog.close();

kontoFormular.addEventListener('submit', async e => {
  e.preventDefault();
  meldungSetzen(kMeldung, 'Melde an…');
  const { error } = await sb.auth.signInWithPassword({ email: kEmail.value.trim(), password: kPasswort.value });
  if (error) {
    meldungSetzen(kMeldung, error.message === 'Invalid login credentials' ? 'E-Mail oder Passwort falsch.' : error.message, true);
    return;
  }
  kontoDialog.close();
});

const passwortDialog = document.getElementById('passwortDialog');
const pNeu = document.getElementById('pNeu');
const pWiederholung = document.getElementById('pWiederholung');
const pMeldung = document.getElementById('pMeldung');

passwortKnopf.onclick = () => {
  pNeu.value = '';
  pWiederholung.value = '';
  meldungSetzen(pMeldung, '');
  passwortDialog.showModal();
  pNeu.focus();
};

document.getElementById('pAbbrechenKnopf').onclick = () => passwortDialog.close();

document.getElementById('passwortFormular').addEventListener('submit', async e => {
  e.preventDefault();
  if (pNeu.value !== pWiederholung.value) {
    meldungSetzen(pMeldung, 'Die beiden Eingaben stimmen nicht überein.', true);
    return;
  }
  meldungSetzen(pMeldung, 'Speichere…');
  const { error } = await sb.auth.updateUser({ password: pNeu.value });
  if (error) {
    meldungSetzen(pMeldung, error.message, true);
    return;
  }
  passwortDialog.close();
  hinweisZeigen('Passwort geändert');
});

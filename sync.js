// ---------- Abgleich mit Supabase ----------
//
// Prinzip: Die Karten liegen immer auch lokal im Browser (funktioniert offline).
// Jede Änderung wird hochgeladen; was nicht klappt, bleibt in "ausstehend"
// und wird beim nächsten Abgleich nachgeholt. Haben zwei Geräte dieselbe Karte
// geändert, gewinnt die Fassung mit dem neueren Zeitstempel.

let sb = null;      // Supabase-Client (null = nur lokal)
let nutzer = null;  // angemeldeter Nutzer
let kanal = null;   // Echtzeit-Verbindung für Änderungen anderer Geräte

const statusAnzeige = document.getElementById('status');
const kontoKnopf = document.getElementById('kontoKnopf');

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
    lokal: 'Nur auf diesem Gerät',
    abgemeldet: 'Nicht angemeldet',
    laeuft: 'Gleiche ab…',
    ok: 'Abgeglichen',
    fehler: 'Offline – wird nachgeholt'
  };
  statusAnzeige.textContent = texte[zustand];
  statusAnzeige.className = 'status ' + zustand;
  statusAnzeige.title = nutzer ? 'Angemeldet als ' + nutzer.email : '';
}

async function angemeldet() {
  kontoKnopf.textContent = 'Abmelden';

  // Erste Anmeldung auf diesem Gerät: Was passiert mit den lokalen Karten?
  if (daten.nutzerId !== nutzer.id) {
    const lokale = daten.karten.filter(k => !k.geloescht);
    if (daten.unberuehrt || !lokale.length) {
      daten = leereDaten();
    } else if (confirm(lokale.length + ' Aufgaben von diesem Gerät in dein Konto übernehmen?\n\n„Abbrechen“ verwirft sie auf diesem Gerät.')) {
      daten.ausstehend = daten.karten.map(k => k.id);
    } else {
      daten = leereDaten();
    }
    daten.nutzerId = nutzer.id;
    daten.unberuehrt = false;
    speichern();
    zeichnen();
  }

  // Änderungen anderer Geräte live empfangen
  kanal = sb.channel('karten-' + nutzer.id)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'karten', filter: 'user_id=eq.' + nutzer.id },
      nachricht => { if (nachricht.new && nachricht.new.id) zusammenfuehren([nachricht.new]); })
    .subscribe();

  await abgleichen();
}

function abgemeldet() {
  kontoKnopf.textContent = 'Anmelden';
  if (kanal) {
    sb.removeChannel(kanal);
    kanal = null;
  }
  // Daten des Kontos nicht auf dem Gerät liegen lassen
  if (daten.nutzerId) {
    daten = leereDaten();
    speichern();
    zeichnen();
  }
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
    statusSetzen('ok');
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
    .then(() => statusSetzen('ok'))
    .catch(e => {
      console.warn('Hochladen fehlgeschlagen:', e);
      statusSetzen('fehler');
    });
}

// Ausstehende Karten hochladen – immer nur ein Vorgang gleichzeitig
let hochladenLaeuft = false;
let nochmalHochladen = false;

async function hochladen() {
  if (!sb || !nutzer) return;
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
      if (zeilen.length) {
        const { error } = await sb.from('karten').upsert(zeilen);
        if (error) throw error;
      }
      daten.ausstehend = daten.ausstehend.filter(id => {
        const k = daten.karten.find(x => x.id === id);
        return k && k.geaendert !== stand.get(id);
      });
      speichern();
    } while (nochmalHochladen);
  } finally {
    hochladenLaeuft = false;
  }
}

// Karte in eine Datenbankzeile umwandeln (user_id setzt die Datenbank selbst)
function zeileAus(k) {
  return {
    id: k.id, titel: k.titel, notiz: k.notiz, prio: k.prio, faellig: k.faellig,
    spalte: k.spalte, position: k.position, geaendert: k.geaendert, geloescht: k.geloescht
  };
}

// Karten vom Server mit den lokalen zusammenführen – die neuere Fassung gewinnt
function zusammenfuehren(zeilen) {
  let etwasNeu = false;
  for (const z of zeilen) {
    const fassung = {
      id: z.id, titel: z.titel, notiz: z.notiz, prio: z.prio, faellig: z.faellig,
      spalte: z.spalte, position: z.position, geaendert: z.geaendert, geloescht: z.geloescht
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

// ---------- Anmelden / Abmelden ----------

const kontoDialog = document.getElementById('kontoDialog');
const kontoFormular = document.getElementById('kontoFormular');
const kEmail = document.getElementById('kEmail');
const kPasswort = document.getElementById('kPasswort');
const kMeldung = document.getElementById('kMeldung');

function meldung(text, istFehler) {
  kMeldung.textContent = text;
  kMeldung.className = 'meldung' + (istFehler ? ' fehler' : '');
}

kontoKnopf.onclick = async () => {
  if (nutzer) {
    if (daten.ausstehend.length && !confirm('Einige Änderungen sind noch nicht hochgeladen und gehen beim Abmelden verloren. Trotzdem abmelden?')) return;
    if (!confirm('Abmelden? Deine Aufgaben werden von diesem Gerät entfernt und bleiben in deinem Konto.')) return;
    await sb.auth.signOut();
    return;
  }
  meldung('');
  kPasswort.value = '';
  kontoDialog.showModal();
  kEmail.focus();
};

document.getElementById('kAbbrechenKnopf').onclick = () => kontoDialog.close();

kontoFormular.addEventListener('submit', async e => {
  e.preventDefault();
  meldung('Melde an…');
  const { error } = await sb.auth.signInWithPassword({ email: kEmail.value.trim(), password: kPasswort.value });
  if (error) {
    meldung(error.message === 'Invalid login credentials' ? 'E-Mail oder Passwort falsch.' : error.message, true);
    return;
  }
  kontoDialog.close();
});

document.getElementById('registrierenKnopf').onclick = async () => {
  if (!kontoFormular.reportValidity()) return;
  meldung('Registriere…');
  const optionen = location.protocol.startsWith('http') ? { emailRedirectTo: location.origin + location.pathname } : {};
  const { data, error } = await sb.auth.signUp({ email: kEmail.value.trim(), password: kPasswort.value, options: optionen });
  if (error) {
    meldung(error.message, true);
    return;
  }
  if (data.session) {
    kontoDialog.close();
  } else {
    meldung('Fast geschafft: Bitte bestätige den Link in der E-Mail, die du gerade bekommen hast, und melde dich dann an.');
  }
};

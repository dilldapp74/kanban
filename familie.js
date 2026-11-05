// ---------- Familie: Mitglieder, Zuweisung, Benachrichtigungen ----------

const FARBEN = ['#e11d48', '#f97316', '#eab308', '#10b981', '#06b6d4', '#6366f1', '#a855f7', '#ec4899'];

let mitglieder = [];      // alle Familienmitglieder aus der Datenbank
let meinMitglied = null;  // das Mitglied des angemeldeten Kontos (null = keine Familie)

function familieAktiv() {
  return !!meinMitglied;
}

function mitgliedNach(id) {
  return mitglieder.find(m => m.id === id) || null;
}

async function mitgliederLaden() {
  const { data, error } = await sb.from('mitglieder')
    .select('id, name, kuerzel, farbe, email, user_id, benachrichtigungen')
    .order('erstellt');
  if (error) throw error;
  mitglieder = data;
  meinMitglied = (nutzer && mitglieder.find(m => m.user_id === nutzer.id)) || null;
  familieOberflaeche();
  if (familieDialog.open) {
    if (meinMitglied) familieListeZeichnen();
    else familieDialog.close();
  }
  zeichnen();
}

function familieZuruecksetzen() {
  mitglieder = [];
  meinMitglied = null;
  meldungen = [];
  for (const d of [familieDialog, hinweiseDialog]) if (d.open) d.close();
  familieOberflaeche();
}

// Familien-Bedienelemente nur zeigen, wenn das Konto zu einer Familie gehört
const ansichtUmschalter = document.getElementById('ansicht');

function familieOberflaeche() {
  const aktiv = familieAktiv();
  ansichtUmschalter.hidden = !aktiv;
  document.getElementById('familieKnopf').hidden = !aktiv;
  document.getElementById('hinweiseKnopf').hidden = !aktiv;
  for (const knopf of ansichtUmschalter.children) knopf.classList.toggle('aktiv', knopf.dataset.ansicht === ansicht);
}

// Runder Kreis mit Kürzel in der Farbe des Mitglieds
function avatarElement(m, klasse) {
  const a = el('span', klasse || 'avatar', m.kuerzel);
  a.style.setProperty('--c', m.farbe);
  a.title = m.name;
  return a;
}

// ---------- Zuweisung im Bearbeiten-Dialog ----------

const fZuweisung = document.getElementById('fZuweisung');
const fZuweisungName = document.getElementById('fZuweisungName');
let gewaehlteZuweisung = null;

function zuweisungZeigen(gewaehlt) {
  document.getElementById('zuweisungBereich').hidden = !familieAktiv();
  // Private Aufgaben gehören immer mir – dann lässt sich die Zuweisung nicht ändern
  const gesperrt = familieAktiv() && fPrivat.checked;
  if (gesperrt) gewaehlt = meinMitglied.id;
  gewaehlteZuweisung = gewaehlt && mitgliedNach(gewaehlt) ? gewaehlt : null;
  fZuweisung.classList.toggle('gesperrt', gesperrt);
  fZuweisung.innerHTML = '';

  const niemand = el('button', 'person niemand', '–');
  niemand.type = 'button';
  niemand.title = 'Niemand';
  niemand.classList.toggle('aktiv', !gewaehlteZuweisung);
  niemand.disabled = gesperrt;
  niemand.onclick = () => zuweisungZeigen(null);
  fZuweisung.append(niemand);

  for (const m of mitglieder) {
    const knopf = el('button', 'person', m.kuerzel);
    knopf.type = 'button';
    knopf.title = m.name;
    knopf.style.setProperty('--c', m.farbe);
    knopf.classList.toggle('aktiv', m.id === gewaehlteZuweisung);
    knopf.disabled = gesperrt;
    knopf.onclick = () => zuweisungZeigen(m.id);
    fZuweisung.append(knopf);
  }
  const m = mitgliedNach(gewaehlteZuweisung);
  fZuweisungName.textContent = (m ? '· ' + m.name : '· niemand') + (gesperrt ? ' (privat)' : '');
}

// Privat-Schalter im Dialog: Zuweisung sofort auf mich setzen und sperren
const fPrivat = document.getElementById('fPrivat');
fPrivat.addEventListener('change', () => zuweisungZeigen(gewaehlteZuweisung));

// ---------- Familie verwalten ----------

const familieDialog = document.getElementById('familieDialog');
const familieListe = document.getElementById('familieListe');
const mitgliedFormular = document.getElementById('mitgliedFormular');
const mName = document.getElementById('mName');
const mKuerzel = document.getElementById('mKuerzel');
const mEmail = document.getElementById('mEmail');
const mFarben = document.getElementById('mFarben');
const mMeldung = document.getElementById('mMeldung');
const mSpeichernKnopf = document.getElementById('mSpeichernKnopf');
const mAbbrechenKnopf = document.getElementById('mAbbrechenKnopf');

let bearbeitetesMitglied = null;  // null = neues Mitglied
let gewaehlteFarbe = FARBEN[0];
let kuerzelSelbstGewaehlt = false;

document.getElementById('familieKnopf').onclick = () => {
  formularLeeren();
  familieListeZeichnen();
  familieDialog.showModal();
};
document.getElementById('familieSchliessenKnopf').onclick = () => familieDialog.close();

function familieListeZeichnen() {
  familieListe.innerHTML = '';
  for (const m of mitglieder) {
    const zeile = el('div', 'mitglied');
    const info = el('div', 'mitglied-info');
    info.append(
      el('div', 'mitglied-name', m.name + (m.id === meinMitglied.id ? ' (du)' : '')),
      el('div', 'leise', m.user_id ? '✓ nutzt die App' : (m.email ? 'wartet auf erste Anmeldung' : 'ohne eigenes Konto'))
    );
    const bearbeiten = el('button', 'klein', 'Bearbeiten');
    bearbeiten.type = 'button';
    bearbeiten.onclick = () => formularFuellen(m);
    zeile.append(avatarElement(m), info, bearbeiten);
    if (m.id !== meinMitglied.id) {
      const entfernen = el('button', 'klein gefahr', 'Entfernen');
      entfernen.type = 'button';
      entfernen.onclick = () => mitgliedEntfernen(m);
      zeile.append(entfernen);
    }
    familieListe.append(zeile);
  }
}

function farbenZeichnen() {
  mFarben.innerHTML = '';
  for (const f of FARBEN) {
    const knopf = el('button', 'farbe');
    knopf.type = 'button';
    knopf.style.setProperty('--c', f);
    knopf.setAttribute('aria-label', 'Farbe ' + f);
    knopf.classList.toggle('aktiv', f === gewaehlteFarbe);
    knopf.onclick = () => {
      gewaehlteFarbe = f;
      farbenZeichnen();
    };
    mFarben.append(knopf);
  }
}

function formularLeeren() {
  bearbeitetesMitglied = null;
  kuerzelSelbstGewaehlt = false;
  mName.value = '';
  mKuerzel.value = '';
  mEmail.value = '';
  // Eine Farbe vorschlagen, die noch niemand hat
  gewaehlteFarbe = FARBEN.find(f => !mitglieder.some(m => m.farbe === f)) || FARBEN[0];
  document.getElementById('mitgliedTitel').textContent = 'Mitglied hinzufügen';
  mSpeichernKnopf.textContent = 'Hinzufügen';
  mAbbrechenKnopf.hidden = true;
  meldungSetzen(mMeldung, '');
  farbenZeichnen();
}

function formularFuellen(m) {
  bearbeitetesMitglied = m;
  kuerzelSelbstGewaehlt = true;
  mName.value = m.name;
  mKuerzel.value = m.kuerzel;
  mEmail.value = m.email || '';
  gewaehlteFarbe = m.farbe;
  document.getElementById('mitgliedTitel').textContent = m.name + ' bearbeiten';
  mSpeichernKnopf.textContent = 'Speichern';
  mAbbrechenKnopf.hidden = false;
  meldungSetzen(mMeldung, '');
  farbenZeichnen();
  mName.focus();
}

mAbbrechenKnopf.onclick = formularLeeren;

// Kürzel vorschlagen: Anfangsbuchstabe, bei Doppelung die ersten zwei Buchstaben
function kuerzelVorschlag(name) {
  const n = name.trim();
  if (!n) return '';
  const belegt = new Set(mitglieder
    .filter(m => !bearbeitetesMitglied || m.id !== bearbeitetesMitglied.id)
    .map(m => m.kuerzel.toUpperCase()));
  const einer = n.charAt(0).toUpperCase();
  if (!belegt.has(einer)) return einer;
  const zwei = einer + n.charAt(1).toLowerCase();
  if (n.length > 1 && !belegt.has(zwei.toUpperCase())) return zwei;
  for (let i = 2; i <= 9; i++) if (!belegt.has(einer + i)) return einer + i;
  return einer;
}

mName.addEventListener('input', () => {
  if (!kuerzelSelbstGewaehlt) mKuerzel.value = kuerzelVorschlag(mName.value);
});
mKuerzel.addEventListener('input', () => { kuerzelSelbstGewaehlt = true; });

mitgliedFormular.addEventListener('submit', async e => {
  e.preventDefault();
  const werte = {
    name: mName.value.trim(),
    kuerzel: mKuerzel.value.trim(),
    farbe: gewaehlteFarbe,
    email: mEmail.value.trim().toLowerCase() || null
  };
  if (!werte.name || !werte.kuerzel) return;
  const doppelt = mitglieder.some(m => m.kuerzel.toUpperCase() === werte.kuerzel.toUpperCase()
    && (!bearbeitetesMitglied || m.id !== bearbeitetesMitglied.id));
  if (doppelt) {
    meldungSetzen(mMeldung, 'Dieses Kürzel hat schon jemand.', true);
    return;
  }
  meldungSetzen(mMeldung, 'Speichere…');
  const { error } = bearbeitetesMitglied
    ? await sb.from('mitglieder').update(werte).eq('id', bearbeitetesMitglied.id)
    : await sb.from('mitglieder').insert(werte);
  if (error) {
    meldungSetzen(mMeldung, error.code === '23505' ? 'Diese E-Mail gehört schon zu einem anderen Mitglied.' : error.message, true);
    return;
  }
  await mitgliederLaden();
  formularLeeren();
  hinweisZeigen(werte.name + ' gespeichert');
});

async function mitgliedEntfernen(m) {
  if (!confirm(m.name + ' aus der Familie entfernen?\n\nAufgaben, die ' + m.name + ' zugewiesen sind, werden frei.'
    + (m.user_id ? '\n' + m.name + ' kann die App danach nicht mehr nutzen.' : ''))) return;
  const { error } = await sb.from('mitglieder').delete().eq('id', m.id);
  if (error) {
    alert('Entfernen fehlgeschlagen: ' + error.message);
    return;
  }
  await mitgliederLaden();
  abgleichen();
}

// ---------- Benachrichtigungen ----------
//
// Die App meldet nach dem Hochladen an die Edge Function "benachrichtigen", welche
// Karten sie zugewiesen oder geändert hat. Die Funktion prüft alles selbst nach und
// schickt eine Push-Nachricht an die Geräte der betroffenen Person.

const pushMoeglich = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  && typeof VAPID_PUBLIC_KEY === 'string' && VAPID_PUBLIC_KEY !== '';

let meldungen = [];  // noch zu sendende Meldungen { karte_id, art }

// Merken, dass andere über diese Änderung informiert werden sollen
function melden(k, vorherZugewiesen) {
  if (!familieAktiv() || k.geloescht || !k.zugewiesen || k.zugewiesen === meinMitglied.id) return;
  const art = k.zugewiesen !== vorherZugewiesen ? 'zuweisung' : 'aenderung';
  if (!meldungen.some(m => m.karte_id === k.id && m.art === art)) meldungen.push({ karte_id: k.id, art });
}

// Nach erfolgreichem Hochladen aufgerufen (dann sieht der Server schon den neuen Stand)
function meldungenSenden() {
  if (!meldungen.length || !sb) return;
  const liste = meldungen;
  meldungen = [];
  for (const m of liste) {
    sb.functions.invoke('benachrichtigen', { body: m })
      .then(({ error }) => { if (error) console.warn('Benachrichtigung fehlgeschlagen:', error); });
  }
}

const hinweiseDialog = document.getElementById('hinweiseDialog');
const hStatus = document.getElementById('hStatus');
const hAktivieren = document.getElementById('hAktivieren');
const hAbschalten = document.getElementById('hAbschalten');
const hSchalter = {
  zuweisung: document.getElementById('hZuweisung'),
  aenderung: document.getElementById('hAenderung'),
  morgens: document.getElementById('hMorgens')
};

document.getElementById('hinweiseKnopf').onclick = async () => {
  hinweiseDialog.showModal();
  await hinweiseAktualisieren();
};
document.getElementById('hinweiseSchliessenKnopf').onclick = () => hinweiseDialog.close();

async function aktuellesAbo() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function hinweiseAktualisieren() {
  const einstellungen = meinMitglied.benachrichtigungen || {};
  for (const [art, schalter] of Object.entries(hSchalter)) schalter.checked = einstellungen[art] !== false;

  hAktivieren.hidden = true;
  hAbschalten.hidden = true;
  if (!pushMoeglich) {
    hStatus.textContent = 'Dieser Browser kann keine Benachrichtigungen empfangen. Tipp: Die App installieren – auf Android über „Zum Startbildschirm hinzufügen“, auf dem Mac in Safari über „Zum Dock hinzufügen“.';
    return;
  }
  if (Notification.permission === 'denied') {
    hStatus.textContent = 'Benachrichtigungen sind für diese App blockiert. Bitte in den Einstellungen des Browsers bzw. des Geräts erlauben.';
    return;
  }
  const abo = await aktuellesAbo();
  hStatus.textContent = abo ? 'Auf diesem Gerät eingeschaltet.' : 'Auf diesem Gerät noch aus.';
  hAktivieren.hidden = !!abo;
  hAbschalten.hidden = !abo;
}

hAktivieren.onclick = async () => {
  try {
    const erlaubnis = await Notification.requestPermission();
    if (erlaubnis !== 'granted') {
      await hinweiseAktualisieren();
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: schluesselAusBase64(VAPID_PUBLIC_KEY) });
    const j = abo.toJSON();
    const { error } = await sb.rpc('push_abo_speichern', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
    if (error) {
      await abo.unsubscribe();
      throw error;
    }
    hinweisZeigen('Benachrichtigungen eingeschaltet');
  } catch (e) {
    console.warn('Benachrichtigungen einschalten fehlgeschlagen:', e);
    hinweisZeigen('Einschalten fehlgeschlagen');
  }
  await hinweiseAktualisieren();
};

hAbschalten.onclick = async () => {
  await pushAbmelden();
  hinweisZeigen('Benachrichtigungen ausgeschaltet');
  await hinweiseAktualisieren();
};

// Abo dieses Geräts entfernen (auch beim Abmelden, damit niemand fremde Nachrichten bekommt)
async function pushAbmelden() {
  if (!pushMoeglich || !sb) return;
  try {
    const abo = await aktuellesAbo();
    if (!abo) return;
    await sb.rpc('push_abo_loeschen', { p_endpoint: abo.endpoint });
    await abo.unsubscribe();
  } catch (e) {
    console.warn('Benachrichtigungen abschalten fehlgeschlagen:', e);
  }
}

// Welche Ereignisse gemeldet werden, gilt für alle Geräte der Person
for (const [art, schalter] of Object.entries(hSchalter)) {
  schalter.addEventListener('change', async () => {
    const neu = { ...(meinMitglied.benachrichtigungen || {}), [art]: schalter.checked };
    const { error } = await sb.from('mitglieder').update({ benachrichtigungen: neu }).eq('id', meinMitglied.id);
    if (error) {
      schalter.checked = !schalter.checked;
      hinweisZeigen('Speichern fehlgeschlagen');
      return;
    }
    meinMitglied.benachrichtigungen = neu;
  });
}

// VAPID-Schlüssel (Base64url) in das Format umwandeln, das der Browser erwartet
function schluesselAusBase64(text) {
  const b64 = (text + '='.repeat((4 - text.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

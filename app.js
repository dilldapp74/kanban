// ---------- Daten ----------

const SPEICHER_SCHLUESSEL = 'kanban-daten-v1';

const SPALTEN = [
  { id: 'backlog', name: 'Backlog' },
  { id: 'offen', name: 'Offen' },
  { id: 'arbeit', name: 'In Arbeit' },
  { id: 'erledigt', name: 'Erledigt' }
];

// Aufbau von "daten":
//   karten     – alle Karten (auch gelöschte, mit geloescht: true)
//   ausstehend – IDs von Karten, die noch nicht hochgeladen wurden
//   nutzerId   – zu welchem Konto die Karten auf diesem Gerät gehören
//   unberuehrt – true, solange nur die Beispielkarten da sind
let daten = laden();

// Daten aus dem Browser-Speicher laden (oder Beispieldaten beim ersten Start)
function laden() {
  let d = null;
  try {
    d = JSON.parse(localStorage.getItem(SPEICHER_SCHLUESSEL));
  } catch (e) { /* kaputte oder gesperrte Daten ignorieren */ }
  if (!d || !Array.isArray(d.karten)) return beispielDaten();

  // Daten aus der ersten Version um die neuen Felder ergänzen
  d.karten.forEach((k, i) => {
    if (typeof k.position !== 'number') k.position = i * 1000;
    if (!k.geaendert) k.geaendert = new Date().toISOString();
    if (k.geloescht === undefined) k.geloescht = false;
    if (k.zugewiesen === undefined) k.zugewiesen = null;
    if (k.privat === undefined) k.privat = false;
    if (k.ersteller === undefined) k.ersteller = null;
  });
  if (!Array.isArray(d.ausstehend)) d.ausstehend = d.karten.map(k => k.id);
  if (d.nutzerId === undefined) d.nutzerId = null;
  return d;
}

function beispielDaten() {
  const jetzt = new Date().toISOString();
  const karte = (titel, notiz, prio, spalte, position) =>
    ({ id: neueId(), titel, notiz, prio, faellig: '', spalte, position, geaendert: jetzt, geloescht: false, zugewiesen: null });
  return {
    karten: [
      karte('Willkommen! Tippe auf eine Karte zum Bearbeiten', 'Am Griff ⠿ links kannst du Karten in andere Spalten ziehen.', 'niedrig', 'offen', 0),
      karte('Einkaufen', 'Milch, Brot, Kaffee', 'mittel', 'offen', 1000),
      karte('Steuererklärung', '', 'hoch', 'arbeit', 0)
    ],
    ausstehend: [],
    nutzerId: null,
    unberuehrt: true
  };
}

function leereDaten() {
  return { karten: [], ausstehend: [], nutzerId: null, unberuehrt: false };
}

function speichern() {
  try {
    localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(daten));
  } catch (e) {
    // z. B. im privaten Modus: dann nur bis zum Neuladen merken
  }
}

function neueId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function heute() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const PRIO_NAMEN = { niedrig: 'Niedrig', mittel: 'Mittel', hoch: 'Hoch' };

// Datum lesbar machen: "Heute", "Morgen", "Gestern" oder z. B. "14.11."
function datumText(datum) {
  const tag = 24 * 60 * 60 * 1000;
  const abstand = Math.round((new Date(datum + 'T00:00') - new Date(heute() + 'T00:00')) / tag);
  if (abstand === 0) return 'Heute';
  if (abstand === 1) return 'Morgen';
  if (abstand === -1) return 'Gestern';
  const [j, m, t] = datum.split('-');
  return t + '.' + m + '.' + (j === heute().slice(0, 4) ? '' : j);
}

// Sichtbare Karten einer Spalte, in der richtigen Reihenfolge
function kartenDerSpalte(spalte) {
  return daten.karten
    .filter(k => !k.geloescht && k.spalte === spalte)
    .sort((a, b) => a.position - b.position);
}

// Ansicht "meine" (mir zugewiesen) oder "alle" – nur wirksam, wenn eine Familie da ist
let ansicht = 'alle';
try { ansicht = localStorage.getItem('kanban-ansicht') || 'alle'; } catch (e) { /* egal */ }

// "Meine" = mir zugewiesen, "Alle" = alles. Private Aufgaben anderer liefert der Server
// gar nicht erst aus – eigene private erscheinen also in beiden Ansichten nur bei mir.
function inAnsicht(k) {
  if (!familieAktiv() || ansicht !== 'meine') return true;
  return k.zugewiesen === meinMitglied.id;
}

// Privat stellen darf nur, wer die Aufgabe angelegt hat
function darfPrivatSetzen(k) {
  return familieAktiv() && (!k || !k.ersteller || k.ersteller === nutzer.id);
}

document.getElementById('ansicht').addEventListener('click', e => {
  const knopf = e.target.closest('[data-ansicht]');
  if (!knopf) return;
  ansicht = knopf.dataset.ansicht;
  try { localStorage.setItem('kanban-ansicht', ansicht); } catch (e) { /* egal */ }
  familieOberflaeche();
  zeichnen();
});

// Position für eine Karte ganz unten in der Spalte
function positionAmEnde(spalte) {
  const karten = kartenDerSpalte(spalte);
  return karten.length ? karten[karten.length - 1].position + 1000 : 0;
}

// Karte als geändert markieren (Zeitstempel + später hochladen)
function markieren(k) {
  k.geaendert = new Date().toISOString();
  if (!daten.ausstehend.includes(k.id)) daten.ausstehend.push(k.id);
  daten.unberuehrt = false;
}

// Nach Änderungen: speichern, neu zeichnen, abgleichen
function uebernehmen() {
  speichern();
  zeichnen();
  syncNachAenderung();
}

// ---------- Zeichnen ----------

const board = document.getElementById('board');

// Hilfsfunktion: Element mit Klasse und Text erzeugen
function el(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text !== undefined) e.textContent = text;
  return e;
}

function zeichnen() {
  // Während des Ziehens nicht neu zeichnen – das passiert danach
  if (ziehen) return;

  // Scrollposition merken, sonst springt das Handy nach jeder Änderung zur ersten Spalte
  const scrollX = board.scrollLeft, scrollY = window.scrollY;
  board.innerHTML = '';

  for (const sp of SPALTEN) {
    const karten = kartenDerSpalte(sp.id).filter(inAnsicht);

    const spalte = el('section', 'spalte');
    spalte.dataset.spalte = sp.id;

    const kopf = el('div', 'spalte-kopf');
    kopf.append(el('h2', '', sp.name), el('span', 'anzahl', karten.length));
    if (sp.id === 'erledigt' && karten.length > 0) {
      const leeren = el('button', 'klein', 'Leeren');
      leeren.onclick = () => {
        if (confirm(karten.length + ' erledigte Aufgaben' + (ansicht === 'meine' && familieAktiv() ? ' von dir' : '') + ' löschen?')) {
          for (const k of karten) {
            k.geloescht = true;
            markieren(k);
          }
          uebernehmen();
        }
      };
      kopf.append(leeren);
    }

    const liste = el('div', 'karten');
    liste.dataset.spalte = sp.id;
    for (const k of karten) liste.append(karteElement(k));

    const neu = el('button', 'neu', '+ Aufgabe hinzufügen');
    neu.onclick = () => dialogOeffnen(null, sp.id);

    spalte.append(kopf, liste, neu);
    board.append(spalte);
  }

  board.scrollLeft = scrollX;
  window.scrollTo(0, scrollY);
  leisteZeichnen();
}

// ---------- Spaltenleiste (Handy): springen und Karten ablegen ----------

const leiste = document.getElementById('spaltenleiste');

function leisteZeichnen() {
  leiste.innerHTML = '';
  for (const sp of SPALTEN) {
    const tab = el('button', 'tab');
    tab.type = 'button';
    tab.dataset.spalte = sp.id;
    tab.append(el('span', '', sp.name), el('span', 'tab-anzahl', kartenDerSpalte(sp.id).filter(inAnsicht).length));
    tab.onclick = () => {
      const spalte = board.querySelector('.spalte[data-spalte="' + sp.id + '"]');
      if (spalte) spalte.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    };
    leiste.append(tab);
  }
  aktiveSpalteMarkieren();
}

// Die Spalte hervorheben, die gerade in der Bildschirmmitte steht
function aktiveSpalteMarkieren() {
  const mitte = window.innerWidth / 2;
  let beste = null, abstand = Infinity;
  for (const s of board.querySelectorAll('.spalte')) {
    const r = s.getBoundingClientRect();
    const a = Math.abs(r.left + r.width / 2 - mitte);
    if (a < abstand) {
      abstand = a;
      beste = s.dataset.spalte;
    }
  }
  for (const t of leiste.children) t.classList.toggle('aktiv', t.dataset.spalte === beste);
}

board.addEventListener('scroll', aktiveSpalteMarkieren, { passive: true });

// Kurzer Hinweis am unteren Bildschirmrand
const toast = document.getElementById('toast');
let toastTimer = null;

function hinweisZeigen(text) {
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}

function karteElement(k) {
  const karte = el('div', 'karte' + (k.prio ? ' prio-' + k.prio : ''));
  karte.dataset.id = k.id;

  // Griffe links und rechts – rechts ist auf dem Handy gut mit dem Daumen erreichbar
  const griff = el('div', 'griff', '⠿');
  griff.title = 'Ziehen zum Verschieben';
  const griffRechts = el('div', 'griff rechts', '⠿');
  griffRechts.title = 'Ziehen zum Verschieben';

  const inhalt = el('div', 'inhalt');
  inhalt.append(el('div', 'titel', k.titel));
  if (k.notiz) inhalt.append(el('div', 'notiz', k.notiz));

  // Etiketten für Priorität und Fälligkeit
  const etiketten = el('div', 'etiketten');
  if (k.privat && familieAktiv()) etiketten.append(el('span', 'etikett privat', '🔒 Privat'));
  if (k.prio) etiketten.append(el('span', 'etikett prio-' + k.prio, PRIO_NAMEN[k.prio]));
  if (k.faellig) {
    let art = '';
    if (k.spalte !== 'erledigt') {
      if (k.faellig < heute()) art = ' ueberfaellig';
      else if (k.faellig === heute()) art = ' heute';
    }
    etiketten.append(el('span', 'etikett datum' + art, '📅 ' + datumText(k.faellig)));
  }
  if (etiketten.children.length) inhalt.append(etiketten);

  karte.append(griff, inhalt);
  const person = familieAktiv() && mitgliedNach(k.zugewiesen);
  if (person) karte.append(avatarElement(person));
  karte.append(griffRechts);
  karte.addEventListener('click', e => {
    if (!e.target.closest('.griff')) dialogOeffnen(k.id);
  });
  return karte;
}


// ---------- Bearbeiten-Dialog ----------

const dialog = document.getElementById('dialog');
const formular = document.getElementById('formular');
const fTitel = document.getElementById('fTitel');
const fNotiz = document.getElementById('fNotiz');
const fPrio = document.getElementById('fPrio');
const fFaellig = document.getElementById('fFaellig');
const fSpalte = document.getElementById('fSpalte');
const loeschenKnopf = document.getElementById('loeschenKnopf');

// Spaltenwahl als Knöpfe – ein Tipp genügt zum Verschieben
let gewaehlteSpalte = null;

for (const sp of SPALTEN) {
  const knopf = el('button', 'segment', sp.name);
  knopf.type = 'button';
  knopf.dataset.spalte = sp.id;
  knopf.onclick = () => spalteWaehlen(sp.id);
  fSpalte.append(knopf);
}

function spalteWaehlen(id) {
  gewaehlteSpalte = id;
  for (const knopf of fSpalte.children) knopf.classList.toggle('aktiv', knopf.dataset.spalte === id);
}

let bearbeiteId = null; // null bedeutet: neue Karte

function dialogOeffnen(id, spalte) {
  bearbeiteId = id;
  // Neue Aufgabe in der Ansicht "Meine" ist automatisch mir zugewiesen
  const vorschlag = ansicht === 'meine' && familieAktiv() ? meinMitglied.id : null;
  const k = id ? daten.karten.find(x => x.id === id) : { titel: '', notiz: '', prio: '', faellig: '', spalte, zugewiesen: vorschlag };
  document.getElementById('dialogTitel').textContent = id ? 'Aufgabe bearbeiten' : 'Neue Aufgabe';
  fTitel.value = k.titel;
  fNotiz.value = k.notiz;
  fPrio.value = k.prio;
  fFaellig.value = k.faellig;
  spalteWaehlen(k.spalte);
  document.getElementById('privatBereich').hidden = !darfPrivatSetzen(id ? k : null);
  fPrivat.checked = !!k.privat;
  zuweisungZeigen(k.zugewiesen);
  loeschenKnopf.style.display = id ? '' : 'none';
  dialog.showModal();
  if (!id) fTitel.focus();
}

formular.addEventListener('submit', e => {
  e.preventDefault();
  const werte = {
    titel: fTitel.value.trim(),
    notiz: fNotiz.value.trim(),
    prio: fPrio.value,
    faellig: fFaellig.value,
    spalte: gewaehlteSpalte,
    zugewiesen: gewaehlteZuweisung
  };
  if (!werte.titel) return;

  let k = daten.karten.find(x => x.id === bearbeiteId);
  const vorherZugewiesen = k ? k.zugewiesen : null;
  // Privat nur übernehmen, wenn der Schalter angeboten wurde; private Aufgaben gehören mir
  if (!document.getElementById('privatBereich').hidden) werte.privat = fPrivat.checked;
  if (werte.privat) werte.zugewiesen = meinMitglied.id;
  if (k) {
    // Bei Spaltenwechsel ans Ende der neuen Spalte setzen
    if (k.spalte !== werte.spalte) werte.position = positionAmEnde(werte.spalte);
    Object.assign(k, werte);
  } else {
    // Karte wurde inzwischen auf einem anderen Gerät gelöscht oder ist neu
    k = { id: neueId(), privat: false, ...werte, position: positionAmEnde(werte.spalte), geloescht: false, ersteller: nutzer ? nutzer.id : null };
    daten.karten.push(k);
  }
  markieren(k);
  melden(k, vorherZugewiesen);
  dialog.close();
  uebernehmen();
});

document.getElementById('abbrechenKnopf').onclick = () => dialog.close();

loeschenKnopf.onclick = () => {
  if (!confirm('Diese Aufgabe wirklich löschen?')) return;
  const k = daten.karten.find(x => x.id === bearbeiteId);
  if (k) {
    k.geloescht = true;
    markieren(k);
  }
  dialog.close();
  uebernehmen();
};

// ---------- Ziehen & Ablegen (Maus und Touch) ----------

let ziehen = null;

// Kennung der Nachbarn, um zu erkennen, ob sich überhaupt etwas bewegt hat
function lageVon(karte) {
  const vor = karte.previousElementSibling, nach = karte.nextElementSibling;
  return karte.parentElement.dataset.spalte + '|' + (vor ? vor.dataset.id : '') + '|' + (nach ? nach.dataset.id : '');
}

board.addEventListener('pointerdown', e => {
  const griff = e.target.closest('.griff');
  if (!griff) return;
  e.preventDefault();

  const karte = griff.closest('.karte');
  const r = karte.getBoundingClientRect();

  // Kopie der Karte, die dem Finger/Mauszeiger folgt
  const geist = karte.cloneNode(true);
  geist.classList.add('geist');
  geist.style.width = r.width + 'px';
  // Um den Griffpunkt drehen/verkleinern – so bleibt die Kopie unter dem Finger, egal ob links oder rechts gegriffen
  geist.style.transformOrigin = (e.clientX - r.left) + 'px ' + (e.clientY - r.top) + 'px';
  document.body.append(geist);

  karte.classList.add('gezogen');
  document.body.classList.add('zieht');
  ziehen = { id: karte.dataset.id, karte, geist, dx: e.clientX - r.left, dy: e.clientY - r.top, start: lageVon(karte) };
  geistBewegen(e.clientX, e.clientY);
});

window.addEventListener('pointermove', e => {
  if (!ziehen) return;
  geistBewegen(e.clientX, e.clientY);

  const unter = document.elementFromPoint(e.clientX, e.clientY);

  // Über der Spaltenleiste? Dann landet die Karte beim Loslassen oben in dieser Spalte
  const tab = unter && unter.closest('.tab');
  ziehen.zielSpalte = tab ? tab.dataset.spalte : null;
  for (const t of leiste.children) t.classList.toggle('ziel', t === tab);
  ziehen.geist.classList.toggle('ueber-leiste', !!tab);
  if (tab) return;

  // Sonst die Spalte unter dem Zeiger suchen – notfalls nur nach der waagerechten Position,
  // damit es auch klappt, wenn die Nachbarspalte kürzer ist
  const spalte = (unter && unter.closest('.spalte')) || spalteBeiX(e.clientX);
  if (spalte) {
    const liste = spalte.querySelector('.karten');
    const andere = [...liste.querySelectorAll('.karte:not(.gezogen)')];
    const davor = andere.find(k => {
      const r = k.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if (davor) {
      if (davor.previousElementSibling !== ziehen.karte) liste.insertBefore(ziehen.karte, davor);
    } else if (liste.lastElementChild !== ziehen.karte) {
      liste.append(ziehen.karte);
    }
  }

  // Automatisch scrollen, wenn man an den Rand zieht
  const rand = 40;
  if (e.clientX < rand) board.scrollLeft -= 12;
  if (e.clientX > window.innerWidth - rand) board.scrollLeft += 12;
  if (e.clientY < rand + 50) window.scrollBy(0, -12);
  if (e.clientY > window.innerHeight - rand) window.scrollBy(0, 12);
});

window.addEventListener('pointerup', ziehenBeenden);
window.addEventListener('pointercancel', ziehenAbbrechen);

// Vom System abgebrochen (z. B. Wischgeste): nichts verschieben, alten Zustand zeigen
function ziehenAbbrechen() {
  if (!ziehen) return;
  ziehen.geist.remove();
  ziehen = null;
  document.body.classList.remove('zieht');
  for (const t of leiste.children) t.classList.remove('ziel');
  zeichnen();
}

function spalteBeiX(x) {
  return [...board.querySelectorAll('.spalte')].find(s => {
    const r = s.getBoundingClientRect();
    return x >= r.left && x <= r.right;
  });
}

function geistBewegen(x, y) {
  ziehen.geist.style.left = (x - ziehen.dx) + 'px';
  ziehen.geist.style.top = (y - ziehen.dy) + 'px';
}

function ziehenBeenden() {
  if (!ziehen) return;
  const { karte, geist, id, start, zielSpalte } = ziehen;
  ziehen = null;
  geist.remove();
  document.body.classList.remove('zieht');
  for (const t of leiste.children) t.classList.remove('ziel');

  const k = daten.karten.find(x => x.id === id);

  // Auf der Spaltenleiste abgelegt: ganz oben in die gewählte Spalte
  if (k && zielSpalte) {
    const andere = kartenDerSpalte(zielSpalte).filter(x => x !== k);
    k.position = andere.length ? andere[0].position - 1000 : 0;
    k.spalte = zielSpalte;
    markieren(k);
    melden(k, k.zugewiesen);
    uebernehmen();
    hinweisZeigen('Verschoben nach „' + SPALTEN.find(s => s.id === zielSpalte).name + '“');
    return;
  }
  if (!k || lageVon(karte) === start) {
    zeichnen();
    return;
  }

  // Neue Position zwischen den Nachbarkarten berechnen
  const positionVon = el => daten.karten.find(x => x.id === el.dataset.id).position;
  const vor = karte.previousElementSibling, nach = karte.nextElementSibling;
  if (vor && nach) k.position = (positionVon(vor) + positionVon(nach)) / 2;
  else if (vor) k.position = positionVon(vor) + 1000;
  else if (nach) k.position = positionVon(nach) - 1000;
  else k.position = 0;
  k.spalte = karte.parentElement.dataset.spalte;

  markieren(k);
  melden(k, k.zugewiesen);
  uebernehmen();
}

// ---------- Diktieren (Spracherkennung des Browsers) ----------

const Spracherkennung = window.SpeechRecognition || window.webkitSpeechRecognition;
let erkennung = null;

for (const knopf of document.querySelectorAll('.mikro')) {
  if (!Spracherkennung) continue;
  knopf.hidden = false;
  knopf.textContent = '🎤';
  knopf.onclick = () => diktieren(knopf, document.getElementById(knopf.dataset.feld));
}

function diktieren(knopf, feld) {
  // Zweiter Tipp beendet das Diktat
  if (erkennung) {
    erkennung.stop();
    return;
  }
  erkennung = new Spracherkennung();
  erkennung.lang = 'de-DE';
  erkennung.interimResults = true;
  erkennung.continuous = feld.tagName === 'TEXTAREA';
  // Diktierter Text wird an den vorhandenen angehängt
  const vorher = feld.value.trim() ? feld.value.trim() + ' ' : '';

  erkennung.onresult = e => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    text = text.trim();
    if (!vorher) text = text.charAt(0).toUpperCase() + text.slice(1);
    feld.value = (vorher + text).slice(0, feld.maxLength > 0 ? feld.maxLength : undefined);
  };
  erkennung.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') hinweisZeigen('Mikrofon ist nicht erlaubt');
    else if (e.error !== 'aborted' && e.error !== 'no-speech') hinweisZeigen('Diktieren hat nicht geklappt');
  };
  erkennung.onend = () => {
    knopf.classList.remove('hoert');
    erkennung = null;
  };
  knopf.classList.add('hoert');
  erkennung.start();
}

// Diktat beenden, wenn der Dialog geschlossen wird
dialog.addEventListener('close', () => {
  if (erkennung) erkennung.abort();
});

// ---------- Einstellungsmenü ----------

const menueKnopf = document.getElementById('menueKnopf');
const menue = document.getElementById('menue');

function menueUmschalten(offen) {
  menue.hidden = !offen;
  menueKnopf.setAttribute('aria-expanded', offen);
}

menueKnopf.onclick = () => menueUmschalten(menue.hidden);

// Schließen bei Klick daneben, nach Auswahl eines Eintrags oder mit Escape
document.addEventListener('click', e => {
  if (!menue.hidden && !e.target.closest('.menue-bereich')) menueUmschalten(false);
});
menue.addEventListener('click', e => {
  if (e.target.closest('.menue-eintrag')) menueUmschalten(false);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') menueUmschalten(false);
});

// Farbschema wechseln (themaSetzen steht in thema.js); das Menü bleibt offen zum Ausprobieren
for (const knopf of document.querySelectorAll('.thema-knopf')) knopf.onclick = () => themaSetzen(knopf.dataset.wahl);
themaSetzen(aktuellesThema);

// ---------- Sichern & Laden (Backup als Datei) ----------

document.getElementById('exportKnopf').onclick = () => {
  const karten = daten.karten.filter(k => !k.geloescht);
  const blob = new Blob([JSON.stringify({ karten }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'family-kanban-' + heute() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
};

const importDatei = document.getElementById('importDatei');
document.getElementById('importKnopf').onclick = () => importDatei.click();

importDatei.addEventListener('change', () => {
  const datei = importDatei.files[0];
  if (!datei) return;
  const leser = new FileReader();
  leser.onload = () => {
    try {
      const d = JSON.parse(leser.result);
      if (!Array.isArray(d.karten)) throw new Error();
      const neue = d.karten.filter(k => !k.geloescht);
      if (confirm('Aktuelle Aufgaben durch ' + neue.length + ' Aufgaben aus der Datei ersetzen?')) {
        importieren(neue);
      }
    } catch (e) {
      alert('Die Datei konnte nicht gelesen werden.');
    }
    importDatei.value = '';
  };
  leser.readAsText(datei);
});

function importieren(neue) {
  // Bisherige Karten als gelöscht markieren (damit es auch andere Geräte erfahren)
  for (const k of daten.karten) {
    if (!k.geloescht) {
      k.geloescht = true;
      markieren(k);
    }
  }
  neue.forEach((n, i) => {
    let k = n.id && daten.karten.find(x => x.id === n.id);
    if (!k) {
      k = { id: n.id ? String(n.id) : neueId() };
      daten.karten.push(k);
    }
    Object.assign(k, {
      titel: String(n.titel || ''),
      notiz: String(n.notiz || ''),
      prio: ['niedrig', 'mittel', 'hoch'].includes(n.prio) ? n.prio : '',
      faellig: /^\d{4}-\d{2}-\d{2}$/.test(n.faellig) ? n.faellig : '',
      spalte: SPALTEN.some(s => s.id === n.spalte) ? n.spalte : 'offen',
      position: typeof n.position === 'number' ? n.position : i * 1000,
      geloescht: false,
      zugewiesen: typeof n.zugewiesen === 'string' && mitgliedNach(n.zugewiesen) ? n.zugewiesen : null
    });
    markieren(k);
  });
  uebernehmen();
}

// Los geht's
zeichnen();
syncStarten();

// Installierbar und offline startbar machen (nur über http/https möglich)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service Worker:', e));
}

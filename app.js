// ---------- Daten ----------

const SPEICHER_SCHLUESSEL = 'kanban-daten-v1';

const SPALTEN = [
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
  });
  if (!Array.isArray(d.ausstehend)) d.ausstehend = d.karten.map(k => k.id);
  if (d.nutzerId === undefined) d.nutzerId = null;
  return d;
}

function beispielDaten() {
  const jetzt = new Date().toISOString();
  const karte = (titel, notiz, prio, spalte, position) =>
    ({ id: neueId(), titel, notiz, prio, faellig: '', spalte, position, geaendert: jetzt, geloescht: false });
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

// Sichtbare Karten einer Spalte, in der richtigen Reihenfolge
function kartenDerSpalte(spalte) {
  return daten.karten
    .filter(k => !k.geloescht && k.spalte === spalte)
    .sort((a, b) => a.position - b.position);
}

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
const suchfeld = document.getElementById('suche');

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

  const suche = suchfeld.value.trim().toLowerCase();
  board.innerHTML = '';

  for (const sp of SPALTEN) {
    const karten = kartenDerSpalte(sp.id);
    const sichtbar = karten.filter(k => !suche || (k.titel + ' ' + k.notiz).toLowerCase().includes(suche));

    const spalte = el('section', 'spalte');
    spalte.dataset.spalte = sp.id;

    const kopf = el('div', 'spalte-kopf');
    kopf.append(el('h2', '', sp.name), el('span', 'anzahl', karten.length));
    if (sp.id === 'erledigt' && karten.length > 0) {
      const leeren = el('button', 'knopf', 'Leeren');
      leeren.onclick = () => {
        if (confirm('Alle erledigten Aufgaben löschen?')) {
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
    for (const k of sichtbar) liste.append(karteElement(k));

    const neu = el('button', 'neu', '+ Aufgabe hinzufügen');
    neu.onclick = () => dialogOeffnen(null, sp.id);

    spalte.append(kopf, liste, neu);
    board.append(spalte);
  }
}

function karteElement(k) {
  const karte = el('div', 'karte' + (k.prio ? ' prio-' + k.prio : ''));
  karte.dataset.id = k.id;

  const griff = el('div', 'griff', '⠿');
  griff.title = 'Ziehen zum Verschieben';

  const inhalt = el('div', 'inhalt');
  inhalt.append(el('div', 'titel', k.titel));
  if (k.notiz) inhalt.append(el('div', 'notiz', k.notiz));
  if (k.faellig) {
    const ueberfaellig = k.faellig < heute() && k.spalte !== 'erledigt';
    const [j, m, t] = k.faellig.split('-');
    inhalt.append(el('div', 'meta' + (ueberfaellig ? ' ueberfaellig' : ''), '📅 ' + t + '.' + m + '.' + j));
  }

  karte.append(griff, inhalt);
  karte.addEventListener('click', e => {
    if (!e.target.closest('.griff')) dialogOeffnen(k.id);
  });
  return karte;
}

suchfeld.addEventListener('input', zeichnen);

// ---------- Bearbeiten-Dialog ----------

const dialog = document.getElementById('dialog');
const formular = document.getElementById('formular');
const fTitel = document.getElementById('fTitel');
const fNotiz = document.getElementById('fNotiz');
const fPrio = document.getElementById('fPrio');
const fFaellig = document.getElementById('fFaellig');
const fSpalte = document.getElementById('fSpalte');
const loeschenKnopf = document.getElementById('loeschenKnopf');

for (const sp of SPALTEN) {
  const opt = el('option', '', sp.name);
  opt.value = sp.id;
  fSpalte.append(opt);
}

let bearbeiteId = null; // null bedeutet: neue Karte

function dialogOeffnen(id, spalte) {
  bearbeiteId = id;
  const k = id ? daten.karten.find(x => x.id === id) : { titel: '', notiz: '', prio: '', faellig: '', spalte };
  document.getElementById('dialogTitel').textContent = id ? 'Aufgabe bearbeiten' : 'Neue Aufgabe';
  fTitel.value = k.titel;
  fNotiz.value = k.notiz;
  fPrio.value = k.prio;
  fFaellig.value = k.faellig;
  fSpalte.value = k.spalte;
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
    spalte: fSpalte.value
  };
  if (!werte.titel) return;

  let k = daten.karten.find(x => x.id === bearbeiteId);
  if (k) {
    // Bei Spaltenwechsel ans Ende der neuen Spalte setzen
    if (k.spalte !== werte.spalte) werte.position = positionAmEnde(werte.spalte);
    Object.assign(k, werte);
  } else {
    // Karte wurde inzwischen auf einem anderen Gerät gelöscht oder ist neu
    k = { id: neueId(), ...werte, position: positionAmEnde(werte.spalte), geloescht: false };
    daten.karten.push(k);
  }
  markieren(k);
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
  document.body.append(geist);

  karte.classList.add('gezogen');
  ziehen = { id: karte.dataset.id, karte, geist, dx: e.clientX - r.left, dy: e.clientY - r.top, start: lageVon(karte) };
  geistBewegen(e.clientX, e.clientY);
});

window.addEventListener('pointermove', e => {
  if (!ziehen) return;
  geistBewegen(e.clientX, e.clientY);

  // Unter dem Zeiger liegende Spalte suchen und Karte dort einsortieren
  const unter = document.elementFromPoint(e.clientX, e.clientY);
  const spalte = unter && unter.closest('.spalte');
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
window.addEventListener('pointercancel', ziehenBeenden);

function geistBewegen(x, y) {
  ziehen.geist.style.left = (x - ziehen.dx) + 'px';
  ziehen.geist.style.top = (y - ziehen.dy) + 'px';
}

function ziehenBeenden() {
  if (!ziehen) return;
  const { karte, geist, id, start } = ziehen;
  ziehen = null;
  geist.remove();

  const k = daten.karten.find(x => x.id === id);
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
  uebernehmen();
}

// ---------- Sichern & Laden (Backup als Datei) ----------

document.getElementById('exportKnopf').onclick = () => {
  const karten = daten.karten.filter(k => !k.geloescht);
  const blob = new Blob([JSON.stringify({ karten }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'kanban-' + heute() + '.json';
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
      geloescht: false
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

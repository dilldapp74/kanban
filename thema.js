// Farbschema früh setzen (wird im <head> geladen, vor dem ersten Zeichnen),
// damit beim Start nichts aufblitzt. Die Wahl gilt pro Gerät.

const THEMA_SCHLUESSEL = 'kanban-thema';

// Farbe der Systemleiste (Android, Mac) je Schema: [hell, dunkel] – passend zur Kopfzeile
const THEMA_LEISTE = {
  rot: ['#09090b', '#09090b'],
  blau: ['#f1f3f7', '#111418'],
  pastell: ['#f5b8dc', '#6b1d4f']
};

const dunkelAnfrage = window.matchMedia('(prefers-color-scheme: dark)');
let aktuellesThema = 'rot';

function themaSetzen(name) {
  if (!THEMA_LEISTE[name]) name = 'rot';
  aktuellesThema = name;
  // "rot" ist das Grundschema in style.css und braucht kein Attribut
  if (name === 'rot') delete document.documentElement.dataset.thema;
  else document.documentElement.dataset.thema = name;
  try { localStorage.setItem(THEMA_SCHLUESSEL, name); } catch (e) { /* egal */ }
  leisteFaerben();
  for (const knopf of document.querySelectorAll('.thema-knopf')) knopf.classList.toggle('aktiv', knopf.dataset.wahl === name);
}

function leisteFaerben() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEMA_LEISTE[aktuellesThema][dunkelAnfrage.matches ? 1 : 0];
}

dunkelAnfrage.addEventListener('change', leisteFaerben);

let gespeichertesThema = 'rot';
try { gespeichertesThema = localStorage.getItem(THEMA_SCHLUESSEL) || 'rot'; } catch (e) { /* egal */ }
themaSetzen(gespeichertesThema);

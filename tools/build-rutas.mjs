/* Genera prototype/rutas.js a partir del CSV oficial del INTRANT.
   Uso: node tools/build-rutas.mjs
   Fuente: datos.gob.do — INTRANT, "Lista de Rutas de Transporte Público
   Urbanos e Interurbanos", actualizado 18/07/2025.                        */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'data/rutas-gran-santo-domingo.csv';
const OUT = 'prototype/rutas.js';

/* parser CSV complet (les noms de syndicats contiennent des virgules,
   donc les champs sont entre guillemets — un split(',') ne suffit pas) */
function parseCSV(text) {
  const out = [];
  let row = [], field = '', q = false;
  const src = text.replace(/\r\n/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); out.push(row); }
  return out;
}

const table = parseCSV(readFileSync(SRC, 'utf8').trim());
const cols = table.shift();
const rows = table.map(v => Object.fromEntries(cols.map((c, i) => [c, (v[i] ?? '').trim()])));

const clean = s => s.replace(/\s+/g, ' ').trim();
const sigla = f => (f.match(/\(([^)]+)\)\s*$/)?.[1] || f).replace(/,?\s*SRL.*$/i, '').trim();

/* On ne garde que les rutas URBAINES : les 70 lignes « Interurbano » sont des
   compagnies de cars longue distance (Caribe Tours vers Santiago, Barahona, la
   frontière haïtienne). Leur colonne « ruta » contient un nom d'entreprise, pas
   un code de ligne — elles n'ont rien à faire dans un planificateur urbain. */
const rutas = rows
  .filter(r => r.ruta && r.ruta !== 'N/A' && r.licencia === 'Urbano')
  .filter(r => !/inactiva/i.test(r.ruta))          // lignes déclarées hors service
  .map(r => ({
    id: r.ruta,
    tipo: r.tipo,
    licencia: r.licencia,
    costo: Number(r.costo_dop) || 0,
    veh: Number(r.vehiculos) || 0,
    horario: clean(r.horario),
    dias: Number(r.dias) || 0,
    op: sigla(clean(r.federacion)),
    opFull: clean(r.federacion),
    upd: r.actualizado
  }))
  .sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));

const stats = {
  total: rutas.length,
  veh: rutas.reduce((t, r) => t + r.veh, 0),
  porTipo: rutas.reduce((o, r) => (o[r.tipo] = (o[r.tipo] || 0) + 1, o), {}),
  alcance: 'rutas urbanas del Gran Santo Domingo',
  fuente: 'INTRANT · datos.gob.do',
  actualizado: rutas.map(r => r.upd).sort().pop()
};

writeFileSync(OUT,
`/* GENERADO por tools/build-rutas.mjs — no editar a mano.
   Fuente: INTRANT (datos.gob.do), Lista de Rutas de Transporte Público
   Urbanos e Interurbanos del Gran Santo Domingo. ${stats.total} rutas.     */
const RUTAS_STATS = ${JSON.stringify(stats, null, 2)};

const RUTAS = ${JSON.stringify(rutas)};

const rutaById = id => RUTAS.find(r => r.id === id) || null;
`);

console.log(`✓ ${OUT} — ${stats.total} rutas, ${stats.veh} véhicules`);
console.log(stats.porTipo);

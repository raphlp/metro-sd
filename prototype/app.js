/* ------------------------------------------------------------------
   Metro SD — lógica de la maqueta (3 pantallas)
   home  →  route (itinerario dibujado)  →  live (viaje en curso)

   - Conchos/guaguas: rutas.js, generado desde el CSV oficial del INTRANT.
   - Caminatas y conchos se trazan por las calles con Valhalla (OSM).
     Si no hay red, se cae a líneas rectas.
   - Metro: recta entre estaciones (es subterráneo, no sigue la vía).
------------------------------------------------------------------ */

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const BRAND = '#008048';
const AMBER = '#F2A413';
const WALK  = '#8E8677';
const DONE  = '#B9B3A6';
const ROUTER = 'https://valhalla1.openstreetmap.de/route';

/* ---------------- splash : 2 s puis l'app, quoi qu'il arrive ---------------- */
setTimeout(() => $('#splash').classList.add('hide'), 2000);

/* ---------------- échelle du téléphone ---------------- */
let mapRef = null;                       // renseigné après la création de la carte
function fitPhone() {
  if (innerWidth <= 430) { document.documentElement.style.setProperty('--s', 1); return; }
  /* la hauteur du pied varie avec le logo et le nombre de lignes : on la mesure
     plutôt que de la deviner, sinon le téléphone déborde en haut de l'écran */
  const foot = document.querySelector('.stage-foot');
  const chrome = (foot ? foot.offsetHeight : 0) + 68;      // pied + marges + anneau du châssis
  const s = Math.min(1, (innerHeight - chrome) / 844, (innerWidth - 32) / 390);
  document.documentElement.style.setProperty('--s', Math.max(.35, s).toFixed(3));
  if (mapRef) mapRef.invalidateSize();
}
addEventListener('resize', fitPhone);
addEventListener('load', fitPhone);          // le logo du pied change sa hauteur
fitPhone();

/* ---------------- carte ---------------- */
const map = L.map('map', {
  zoomControl: false, attributionControl: false, zoomSnap: .25,
  /* le conteneur SVG déborde largement du cadre : Leaflet ne redessine plus
     les tracés à chaque petit déplacement, seulement aux grands sauts */
  renderer: L.svg({ padding: .8 })
})
  .setView([18.492, -69.912], 11.6);
mapRef = map;

/* Fond de carte : Esri Light Gray Canvas (sans clé). CARTO exige une clé
   depuis 2026, et les tuiles OSM standard bloquent les usages « app ». */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
L.tileLayer(ESRI + 'World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 16, maxZoom: 18 }).addTo(map);
L.tileLayer(ESRI + 'World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 16, maxZoom: 18, opacity: .85, pane: 'shadowPane' }).addTo(map);

const baseLayer  = L.layerGroup().addTo(map);   // réseau complet, discret
const routeLayer = L.layerGroup().addTo(map);   // itinéraire actif
const liveLayer  = L.layerGroup().addTo(map);   // portion parcourue + segment courant
let meMarker = null;

for (const key of ['L1', 'L2']) {
  L.polyline(NET[key].stations.map(s => [s.lat, s.lon]),
    { color: NET[key].color, weight: 3, opacity: .28 }).addTo(baseLayer);
}

/* ---------------- géométrie ---------------- */
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function haversine(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* polyline encodée (précision 6, format Valhalla) → [[lat,lon],…] */
function decodePolyline(str, prec = 6) {
  const f = Math.pow(10, prec); let i = 0, lat = 0, lon = 0; const out = [];
  while (i < str.length) {
    for (const k of [0, 1]) {
      let sh = 0, res = 0, b;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
      const d = (res & 1) ? ~(res >> 1) : (res >> 1);
      if (k === 0) lat += d; else lon += d;
    }
    out.push([lat / f, lon / f]);
  }
  return out;
}

/* itinéraire par les rues. costing: 'pedestrian' | 'auto'. null si échec. */
const geoCache = new Map();
async function fetchGeo(costing, a, b) {
  const key = `${costing}|${a}|${b}`;
  if (geoCache.has(key)) return geoCache.get(key);
  try {
    const q = { locations: [{ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }], costing, units: 'kilometers' };
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(ROUTER + '?json=' + encodeURIComponent(JSON.stringify(q)), { signal: ctrl.signal });
    clearTimeout(to);
    const d = await res.json();
    const pts = decodePolyline(d.trip.legs[0].shape);
    const out = [a, ...pts, b];
    geoCache.set(key, out);
    return out;
  } catch { return null; }
}

/* point à la fraction t (0..1) d'un chemin, proportionnel à la distance */
function pathMeta(path) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(path[i - 1], path[i]));
  return { cum, total: cum[cum.length - 1] || 1 };
}
function pointAt(path, meta, t) {
  const d = t * meta.total;
  let i = 1;
  while (i < meta.cum.length && meta.cum[i] < d) i++;
  if (i >= path.length) return { pt: path[path.length - 1], idx: path.length - 1 };
  const seg = meta.cum[i] - meta.cum[i - 1] || 1;
  return { pt: lerp(path[i - 1], path[i], (d - meta.cum[i - 1]) / seg), idx: i - 1 };
}

/* cadre un chemin dans la bande visible (au-dessus de la sheet) */
function fitPath(path, opts = {}) {
  const sheet = $('.screen.is-active .sheet');
  const sheetH = sheet ? sheet.offsetHeight : 0;
  const b = L.latLngBounds(path);
  map.fitBounds(b, {
    paddingTopLeft: [46, 135], paddingBottomRight: [46, sheetH + 36],
    maxZoom: opts.maxZoom ?? 16.5, animate: opts.animate ?? true, duration: .7
  });
}

/* ---------------- caméra du trajet en cours ----------------
   Un changement de zoom force Leaflet à recharger les tuiles et à reprojeter
   tous les tracés — c'est ce qui faisait clignoter la ligne de métro. On fixe
   donc un zoom par mode de transport, qui ne change qu'aux transitions
   (marche → métro → concho), et entre deux arrêts on ne fait que translater. */
const ZOOM = { walk: 15.3, station: 14.2, concho: 12.4, off: 15, flag: 15.3 };
let camZoom = null;

/* Recentre en tenant compte de la bottom sheet : le point doit tomber au
   milieu de la bande visible, pas au milieu de la carte. */
function offsetCenter(coord, z) {
  const size = map.getSize();
  const sheet = $('.screen.is-active .sheet');
  const sheetH = sheet ? sheet.offsetHeight : 0;
  const topH = 118;
  const visibleY = topH + (size.y - sheetH - topH) / 2;
  const p = map.project(coord, z);
  return map.unproject(L.point(p.x, p.y + size.y / 2 - visibleY), z);
}

function followTo(coord, kind, first) {
  const z = ZOOM[kind] ?? 14.5;
  const c = offsetCenter(coord, z);
  if (first || camZoom === null || Math.abs(z - camZoom) > .05) {
    camZoom = z;
    map.setView(c, z, { animate: !first, duration: .7 });      // transition de mode
  } else {
    map.panTo(c, { animate: true, duration: .65 });            // même zoom : simple translation
  }
}

/* ---------------- helpers réseau ---------------- */
const stationsOf = line => NET[line].stations;
const idxOf = (line, id) => stationsOf(line).findIndex(s => s.id === id);
function legStations(leg) {
  const st = stationsOf(leg.line);
  const a = idxOf(leg.line, leg.from), b = idxOf(leg.line, leg.to);
  return a < b ? st.slice(a, b + 1) : st.slice(b, a + 1).reverse();
}

/* ---------------- construction de l'itinéraire ----------------
   Chaque étape = { kind, coord (où l'on est quand elle commence),
                    path (chemin jusqu'à l'étape suivante), … }        */
let current = null;

function buildRoute(key) {
  const route = ROUTES[key];
  const dest = route.dest;
  const steps = [];
  const origin = [ORIGIN.lat, ORIGIN.lon];

  for (const leg of route.legs) {
    if (leg.type === 'walk') {
      steps.push({ kind: 'walk', name: `Caminar hasta ${leg.to}`, to: leg.to, note: leg.note,
                   mins: leg.mins, coord: null, costing: 'pedestrian' });
    }
    if (leg.type === 'metro') {
      const seg = legStations(leg);
      seg.forEach((s, i) => steps.push({
        kind: 'station', name: s.name, line: leg.line, dir: leg.dir, coord: [s.lat, s.lon],
        sub: i === 0 ? `Sube · dirección ${leg.dir}` : i === seg.length - 1 ? 'Bájate aquí' : `Dirección ${leg.dir}`,
        first: i === 0, last: i === seg.length - 1, transfer: !!s.interchange
      }));
    }
    if (leg.type === 'concho') {
      const r = rutaById(leg.ruta);
      steps.push({
        kind: 'concho', ruta: r, corridor: leg.corridor, mins: leg.mins, note: leg.note,
        name: `${leg.ruta} · ${leg.corridor}`, coord: leg.stop, costing: 'auto',
        sub: r ? `${r.tipo.toLowerCase()} · RD$ ${r.costo} en efectivo · ${leg.mins} min aprox.` : `${leg.mins} min aprox.`
      });
      steps.push({ kind: 'off', name: `Bájate en ${leg.off}`, sub: 'Fin del tramo en concho', coord: leg.offCoord });
    }
    if (leg.type === 'arrive') steps.push({ kind: 'flag', name: leg.name, sub: 'Has llegado', coord: dest });
  }

  /* coord de départ des marches = point d'ancrage précédent (ou l'origine) */
  steps.forEach((s, i) => { if (!s.coord) s.coord = i === 0 ? origin : steps[i - 1].coord; });

  /* chemin par défaut : droite jusqu'à l'étape suivante */
  steps.forEach((s, i) => {
    const n = steps[i + 1];
    if (!n) return;
    s.path = [s.coord, n.coord];
    s.dist = haversine(s.coord, n.coord);
    if (s.kind === 'walk') setWalkMeta(s, 1.25);   // droite × 1.25 ≈ détour moyen en ville
  });

  const mins  = totalMins(steps) + route.legs.reduce((t, l) => t + (l.type === 'metro' ? l.mins : 0), 0);
  const price = route.legs.reduce((t, l) =>
    t + (l.type === 'metro' ? (l.price || 0) : l.type === 'concho' ? (rutaById(l.ruta)?.costo || 0) : 0), 0);

  const cur = { key, route, steps, mins, price, dest, geo: 'loading',
                nStations: steps.filter(x => x.kind === 'station').length };
  cur.ready = loadGeo(cur);
  return cur;
}

/* marche : minutes dérivées de la distance (80 m/min ≈ 4,8 km/h) */
function setWalkMeta(s, factor = 1) {
  const d = s.dist * factor;
  s.mins = Math.max(1, Math.round(d / 80));
  s.sub = `${s.mins} min · ${Math.round(d / 10) * 10} m${s.note ? ' · ' + s.note : ''}`;
}
const totalMins = steps => steps.reduce((t, s) => t + (s.kind === 'walk' || s.kind === 'concho' ? s.mins : 0), 0);
const metroMins = cur => cur.route.legs.reduce((t, l) => t + (l.type === 'metro' ? l.mins : 0), 0);

/* remplace les droites des marches/conchos par le tracé réel des rues */
async function loadGeo(cur) {
  const jobs = cur.steps
    .map((s, i) => s.costing && s.path ? { s, i } : null).filter(Boolean)
    .map(({ s }) => fetchGeo(s.costing, s.path[0], s.path[s.path.length - 1]).then(p => {
      if (p) { s.path = p; s.dist = pathMeta(p).total; s.geo = true; }
      if (s.kind === 'walk') setWalkMeta(s, p ? 1 : 1.25);
      return !!p;
    }));
  const ok = await Promise.all(jobs);
  cur.geo = ok.every(Boolean) ? 'ok' : ok.some(Boolean) ? 'partial' : 'fallback';
  if (cur !== current) return;

  const note = $('#geoNote');
  note.className = 'geo-note show ' + (cur.geo === 'fallback' ? 'err' : 'ok');
  note.textContent = cur.geo === 'fallback' ? 'sin red · tramos a pie en línea recta'
                   : cur.geo === 'partial'  ? 'calles OSM · parcial'
                   : 'a pie y concho por calles OSM ✓';
  cur.mins = totalMins(cur.steps) + metroMins(cur);
  renderRouteSheet(cur);
  if ($('#screen-route').classList.contains('is-active')) drawRoute(cur, false);
}

/* ---------------- dessin de l'itinéraire ---------------- */
const styleFor = kind => ({
  walk:    { color: WALK,  weight: 4, opacity: .8,  dashArray: '1 9',  lineCap: 'round' },
  concho:  { color: AMBER, weight: 5, opacity: .95, dashArray: '10 8', lineCap: 'round' },
  off:     { color: WALK,  weight: 4, opacity: .8,  dashArray: '1 9',  lineCap: 'round' },
  station: { weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' }
}[kind]);

function drawAnimated(latlngs, opts, delay, dur, animate) {
  const pl = L.polyline(latlngs, opts).addTo(routeLayer);
  const path = pl.getElement();
  if (!path || !animate) return pl;
  if (opts.dashArray) {
    path.style.opacity = 0;
    path.style.transition = `opacity 400ms ${delay}ms`;
    requestAnimationFrame(() => { path.style.opacity = opts.opacity ?? 1; });
  } else {
    const len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    path.style.transition = `stroke-dashoffset ${dur}ms cubic-bezier(.3,.8,.3,1) ${delay}ms`;
    requestAnimationFrame(() => { path.style.strokeDashoffset = 0; });
    /* La longueur est mesurée au zoom courant. Si on la laisse, tout changement
       de zoom rallonge le tracé sans rallonger le tiret : la ligne se coupe.
       On repasse en trait plein dès l'animation terminée. */
    setTimeout(() => {
      path.style.transition = '';
      path.style.strokeDasharray = 'none';
      path.style.strokeDashoffset = '0';
    }, delay + dur + 60);
  }
  return pl;
}

function drawRoute(cur, animate = true) {
  routeLayer.clearLayers();
  const { steps, dest } = cur;
  let delay = 0;

  /* les stations consécutives forment UN tracé métro (animation continue) ;
     la marche qui part de la dernière station est dessinée juste après */
  let i = 0;
  while (i < steps.length) {
    const s = steps[i];
    if (!s.path) { i++; continue; }
    if (s.kind !== 'station') { drawAnimated(s.path, styleFor(s.kind), delay, 600, animate); delay += 250; i++; continue; }

    const pts = [s.coord];
    let j = i;
    while (steps[j + 1] && steps[j + 1].kind === 'station') { j++; pts.push(steps[j].coord); }
    drawAnimated(pts, { ...styleFor('station'), color: NET[s.line].color }, delay, 1400, animate);
    delay += 1400;
    if (steps[j].path) { drawAnimated(steps[j].path, styleFor('walk'), delay, 600, animate); delay += 250; }
    i = j + 1;
  }

  /* stations, origine, destination */
  steps.filter(s => s.kind === 'station').forEach(s => {
    const big = s.first || s.last;
    L.circleMarker(s.coord, { radius: big ? 7 : 4.5, color: NET[s.line].color, weight: big ? 4 : 3, fillColor: '#fff', fillOpacity: 1 })
      .addTo(routeLayer).bindTooltip(s.name, { direction: 'top', offset: [0, -6] });
  });
  steps.filter(s => s.kind === 'concho' || s.kind === 'off').forEach(s => {
    L.circleMarker(s.coord, { radius: 5, color: AMBER, weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(routeLayer);
  });
  L.circleMarker(dest, { radius: 7, color: '#12151C', weight: 4, fillColor: '#fff', fillOpacity: 1 }).addTo(routeLayer);
  L.circleMarker([ORIGIN.lat, ORIGIN.lon], { radius: 6, color: '#0A3D91', weight: 3, fillColor: '#0A3D91', fillOpacity: 1 }).addTo(routeLayer);

  const all = steps.flatMap(s => s.path || [s.coord]);
  if (animate) fitPath(all, { maxZoom: 15 });
}

/* ---------------- écran 1 : accueil ---------------- */
function renderHome() {
  $('#originName').textContent = ORIGIN.name.split('· ')[1] || ORIGIN.name;
  $('#quickList').innerHTML = Object.entries(ROUTES).map(([k, r]) => `
    <button class="q-item" data-route="${k}">
      <span class="q-emoji">${r.icon}</span>
      <span class="q-txt"><b>${r.label}</b><span>${r.sub}</span></span>
      <span class="q-go">›</span>
    </button>`).join('');
  $$('.q-item').forEach(b => b.onclick = () => openRoute(b.dataset.route));
  $('#dataNote').innerHTML =
    `<b>${RUTAS_STATS.total}</b> rutas de conchos y guaguas cargadas · fuente ${RUTAS_STATS.fuente} (${RUTAS_STATS.actualizado})`;
  routeLayer.clearLayers(); liveLayer.clearLayers();
  /* cadre tout le réseau dans la bande visible au-dessus de la sheet */
  fitPath(Object.values(NET).flatMap(l => l.stations.map(s => [s.lat, s.lon])), { maxZoom: 12.5 });
}

/* ---------------- écran 2 : itinéraire ---------------- */
function renderRouteSheet(cur) {
  const { route, mins, price, steps } = cur;
  const walkSteps = steps.filter(s => s.kind === 'walk');
  let wi = 0;
  $('#routeTitle').textContent = route.label;
  $('#routeSub').textContent = 'desde ' + (ORIGIN.name.split('· ')[1] || ORIGIN.name);
  $('#routeTime').textContent = mins + ' min';
  const eta = new Date(Date.now() + mins * 60000);
  $('#routeMeta').textContent = `llegada · ${eta.getHours()}:${String(eta.getMinutes()).padStart(2, '0')}`;
  $('#routePrice').textContent = 'RD$ ' + price;

  $('#legsList').innerHTML = route.legs.map((l, i) => {
    const lastLeg = i === route.legs.length - 1;
    let badge = '', title = '', note = '', tags = '', extra = '', dashed = true;
    if (l.type === 'walk') {
      badge = `<div class="leg-badge walk">🚶</div>`;
      const w = walkSteps[wi++];
      title = `Caminar hasta ${l.to}`; note = l.note || '';
      tags = `<span class="tag">${w.mins} min</span><span class="tag">${Math.round(w.dist / 10) * 10} m</span>`;
    }
    if (l.type === 'metro') {
      const seg = legStations(l); dashed = false;
      badge = `<div class="leg-badge" style="background:${NET[l.line].color}">${l.line.replace('L', '')}</div>`;
      title = `${NET[l.line].name} · dirección ${l.dir}`;
      note = `${seg[0].name} → ${seg[seg.length - 1].name}`;
      tags = `<span class="tag">${seg.length - 1} paradas</span><span class="tag">${l.mins} min</span><span class="tag">RD$ ${l.price}</span>`;
    }
    if (l.type === 'concho') {
      const r = rutaById(l.ruta);
      badge = `<div class="leg-badge concho">🚐</div>`;
      title = `Ruta <b class="ruta-code">${l.ruta}</b> · ${r ? r.tipo.toLowerCase() : 'concho'}`;
      note = l.corridor + (l.note ? ' — ' + l.note : '');
      tags = `<span class="tag warn">≈ ${l.mins} min · sin horario fijo</span>` + (r ? `<span class="tag">RD$ ${r.costo} efectivo</span>` : '');
      extra = r ? `<div class="ruta-card">
          <div class="rc-row"><span>Operador</span><b>${r.op}</b></div>
          <div class="rc-row"><span>Vehículos en ruta</span><b>${r.veh}</b></div>
          <div class="rc-row"><span>Servicio</span><b>${r.horario} · ${r.dias} d/sem</b></div>
          <div class="rc-src">dato oficial INTRANT · actualizado ${r.upd}</div>
        </div>` : '';
    }
    if (l.type === 'arrive') { badge = `<div class="leg-badge flag">◎</div>`; title = l.name; note = 'Destino'; }
    return `<div class="leg">
      <div class="leg-rail">${badge}${lastLeg ? '' : `<div class="leg-stem ${dashed ? 'dashed' : ''}"></div>`}</div>
      <div class="leg-body"><div class="leg-title">${title}</div>
        ${note ? `<div class="leg-note">${note}</div>` : ''}${tags ? `<div class="leg-tags">${tags}</div>` : ''}${extra}
      </div></div>`;
  }).join('');
}

function openRoute(key) {
  current = buildRoute(key);
  $('#geoNote').className = 'geo-note show';
  $('#geoNote').textContent = 'trazando calles…';

  renderRouteSheet(current);
  show('route');
  drawRoute(current, true);
}

/* ---------------- écran 3 : trajet en cours ---------------- */
let liveIdx = 0, liveTimer = null, animId = null, liveSession = 0;
let doneLine = null, progLine = null, hotLine = null, doneCoords = [];
const DUR = { walk: 3200, station: 2100, concho: 3800, off: 1800, flag: 0 };
const METRO_BUDGET = 11000;   // durée totale visée pour la partie métro, quel que soit le nombre d'arrêts

/* Une ligne de 12 stations ne doit pas prendre 12 × 2,1 s. On répartit un
   budget fixe entre les arrêts, avec un plancher pour rester lisible. */
function stepDuration(step) {
  if (step.kind !== 'station') return DUR[step.kind] ?? 2000;
  const n = current.nStations || 1;
  return Math.max(620, Math.min(DUR.station, METRO_BUDGET / n));
}

let starting = false;
async function startLive() {
  if (starting || !current) return;
  starting = true;
  const { steps } = current;
  $('#startBtn').textContent = 'Trazando calles…';
  await Promise.race([current.ready, new Promise(r => setTimeout(r, 4000))]);
  $('#startBtn').textContent = 'Iniciar viaje';
  starting = false;
  if (!$('#screen-route').classList.contains('is-active')) return;   // l'utilisateur est parti entre-temps

  $('#arrivedCard').classList.remove('show');
  $('#stepsList').innerHTML = steps.map((s, i) => {
    const lineBadge = s.kind === 'station' && s.first ? `<span class="badge-inline" style="background:${NET[s.line].color}">${s.line}</span>` : '';
    const transferBadge = s.transfer && !s.first ? `<span class="badge-inline" style="background:#0A3D91">corresp.</span>` : '';
    const rutaBadge = s.kind === 'concho' && s.ruta ? `<span class="badge-inline" style="background:${AMBER};color:#3B2A00">${s.ruta.id}</span>` : '';
    const icon = { walk: '🚶 ', concho: '🚐 ', off: '⬇︎ ', flag: '◎ ' }[s.kind] || '';
    const label = s.kind === 'concho' ? s.corridor : s.name;
    return `<div class="step" data-i="${i}">
      <div class="step-rail"><div class="node ${s.kind === 'station' ? '' : s.kind}"></div>${i === steps.length - 1 ? '' : '<div class="stem"></div>'}</div>
      <div class="step-body"><div class="step-name">${icon}${label}${rutaBadge}${lineBadge}${transferBadge}</div><div class="step-sub">${s.sub || ''}</div></div>
    </div>`;
  }).join('');

  drawRoute(current, false);   // tracé complet, sans animation : plus aucun
                               // stroke-dasharray résiduel sur cet écran
  liveLayer.clearLayers();
  camZoom = null;
  doneCoords = [];
  const doneStyle = { color: DONE, weight: 7, opacity: .9, lineCap: 'round', lineJoin: 'round' };
  hotLine  = L.polyline([], { color: BRAND, weight: 16, opacity: .18, lineCap: 'round', lineJoin: 'round' }).addTo(liveLayer);
  doneLine = L.polyline([], doneStyle).addTo(liveLayer);   // segments terminés — écrit une fois par étape
  progLine = L.polyline([], doneStyle).addTo(liveLayer);   // segment en cours — écrit à chaque frame

  if (meMarker) map.removeLayer(meMarker);
  meMarker = L.marker(steps[0].coord, {
    icon: L.divIcon({ className: '', html: '<div class="me-dot pulse" id="meDot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
    zIndexOffset: 1000
  }).addTo(map);

  liveIdx = 0;
  show('live');
  requestAnimationFrame(() => goStep(0, true));
}

function stopLive() {
  liveSession++;                                   // invalide toute boucle en cours
  clearTimeout(liveTimer); liveTimer = null;
  if (animId) cancelAnimationFrame(animId); animId = null;
}

function goStep(i, first = false) {
  stopLive();
  liveIdx = i;
  const { steps } = current;
  const s = steps[i];
  renderLive(first);

  if (!s.path) return arrive();

  /* segment courant en surbrillance + cadrage sur ce segment */
  const color = s.kind === 'station' ? NET[s.line].color : s.kind === 'concho' ? AMBER : WALK;
  hotLine.setLatLngs(s.path); hotLine.setStyle({ color });
  const mid = s.path[Math.floor(s.path.length / 2)] || s.coord;
  followTo(mid, s.kind, first);

  /* le point glisse le long du chemin, proportionnellement à la distance */
  const meta = pathMeta(s.path);
  const dur = stepDuration(s);
  const session = liveSession;
  let t0 = null;                     // calé sur le premier timestamp de rAF,
                                     // pour ne pas mélanger deux horloges
  const dot = $('#meDot'); if (dot) dot.classList.toggle('walk', s.kind === 'walk' || s.kind === 'off');
  const tick = now => {
    if (session !== liveSession || !meMarker) return;   // boucle périmée (écran quitté, skip, relance)
    if (t0 === null) t0 = now;
    const t = Math.min(1, (now - t0) / dur);
    const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;    // ease in-out
    const { pt, idx } = pointAt(s.path, meta, e);
    meMarker.setLatLng(pt);
    progLine.setLatLngs([...s.path.slice(0, idx + 1), pt]);
    if (t < 1) animId = requestAnimationFrame(tick);
    else {
      doneCoords = doneCoords.concat(s.path);
      doneLine.setLatLngs(doneCoords);        // une seule écriture, en fin d'étape
      progLine.setLatLngs([]);
      liveTimer = setTimeout(() => { if (session === liveSession) goStep(i + 1); }, dur < 1000 ? 90 : 320);
    }
  };
  animId = requestAnimationFrame(tick);
}

function scrollToStep(el, fast = false) {
  const box = $('#stepsList');
  box.scrollTo({ top: Math.max(0, el.offsetTop - (box.clientHeight - el.offsetHeight) / 2),
                 behavior: fast ? 'auto' : 'smooth' });
}

function renderLive(first = false) {
  const { steps, mins } = current;
  const s = steps[liveIdx];
  const next = steps[liveIdx + 1];
  const color = s.kind === 'station' ? NET[s.line].color : (s.kind === 'concho' || s.kind === 'off') ? AMBER : s.kind === 'flag' ? '#12151C' : WALK;

  /* barre du haut : pastille de ligne + texte */
  $('#liveTop').style.borderLeftColor = color;
  const chip = $('#liveLine');
  chip.className = 'line-chip ' + (s.kind === 'station' ? '' : s.kind);
  chip.style.background = s.kind === 'station' ? color : '';
  chip.textContent = s.kind === 'station' ? s.line : s.kind === 'concho' ? (s.ruta ? s.ruta.id : '🚐') : s.kind === 'walk' || s.kind === 'off' ? '🚶' : '◎';

  if (s.kind === 'walk') {
    $('#liveKicker').textContent = `A pie · ${s.mins} min · ${Math.round(s.dist / 10) * 10} m`;
    $('#liveNext').textContent = s.to;
  } else if (s.kind === 'concho') {
    $('#liveKicker').textContent = s.ruta ? `Ruta ${s.ruta.id} · RD$ ${s.ruta.costo} efectivo` : 'Concho';
    $('#liveNext').textContent = s.corridor;
  } else if (s.kind === 'off') {
    $('#liveKicker').textContent = 'Bájate aquí, luego a pie';
    $('#liveNext').textContent = s.name.replace('Bájate en ', '');
  } else if (s.kind === 'flag') {
    $('#liveKicker').textContent = 'Destino';
    $('#liveNext').textContent = s.name;
  } else if (s.last) {
    $('#liveKicker').textContent = `${NET[s.line].name} · estás en`;
    $('#liveNext').textContent = s.name + ' — bájate';
  } else {
    $('#liveKicker').textContent = `${NET[s.line].name} → ${s.dir} · próxima`;
    $('#liveNext').textContent = next ? next.name : s.name;
  }

  /* alerte « prépare-toi » : 2 arrêts avant la descente du métro */
  const lastStationIdx = steps.map(x => x.kind === 'station' && x.last).lastIndexOf(true);
  const band = $('#alertBand'), delta = lastStationIdx - liveIdx;
  if (s.kind === 'station' && delta >= 0 && delta <= 2) {
    band.textContent = delta === 0 ? '⬇︎ Bájate ahora · ' + s.name : `⬇︎ Prepárate para bajar · ${delta} parada${delta > 1 ? 's' : ''}`;
    band.classList.add('show');
  } else band.classList.remove('show');

  /* progression */
  const p = liveIdx / (steps.length - 1);
  $('#lpFill').style.width = (p * 100).toFixed(1) + '%';
  $('#lpFill').style.background = color;
  const remain = Math.max(1, Math.round(mins * (1 - p)));
  $('#liveRemain').textContent = remain + ' min restantes';
  const eta = new Date(Date.now() + remain * 60000);
  $('#liveEta').textContent = 'llegada ' + eta.getHours() + ':' + String(eta.getMinutes()).padStart(2, '0');

  /* liste */
  const els = $$('#stepsList .step');
  els.forEach((el, i) => {
    el.classList.toggle('is-done', i < liveIdx);
    el.classList.toggle('is-now', i === liveIdx);
    const node = el.querySelector('.node'), stem = el.querySelector('.stem');
    node.classList.toggle('done', i < liveIdx);
    node.classList.toggle('now', i === liveIdx);
    node.style.borderColor = i === liveIdx ? color : (i < liveIdx ? '#DED7C7' : '#CFC7B6');
    node.style.boxShadow = i === liveIdx ? `0 0 0 5px ${color}28` : 'none';
    if (stem) stem.classList.toggle('done', i < liveIdx);
  });
  const fast = stepDuration(s) < 1000;
  requestAnimationFrame(() => { if (els[liveIdx]) scrollToStep(els[liveIdx], fast); });
}

function arrive() {
  stopLive();
  $('#alertBand').classList.remove('show');
  hotLine && hotLine.setLatLngs([]);
  progLine && progLine.setLatLngs([]);
  $('#arrivedTxt').textContent = current.route.label + ' · RD$ ' + current.price + ' en total';
  $('#arrivedCard').classList.add('show');
}

/* ---------------- navigation ---------------- */
function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('is-active', s.id === 'screen-' + id));
  if (id !== 'live') {
    stopLive();
    liveLayer.clearLayers();
    if (meMarker) { map.removeLayer(meMarker); meMarker = null; }
    $('#alertBand').classList.remove('show');
    $('#arrivedCard').classList.remove('show');
  }
  if (id !== 'route') $('#geoNote').classList.remove('show');
  if (id === 'home') renderHome();

/* lien direct pour démo/capture : index.html#route=alcarrizos  ou  #route=alcarrizos&live */
(() => {
  const h = new URLSearchParams(location.hash.slice(1));
  const key = h.get('route');
  if (!key || !ROUTES[key]) return;
  setTimeout(() => { openRoute(key); if (h.has('live')) setTimeout(startLive, 1500); }, 2100);
})();
  if (id === 'route' && current) { drawRoute(current, false); fitPath(current.steps.flatMap(s => s.path || [s.coord]), { maxZoom: 15 }); }
}

$('#startBtn').onclick = startLive;
$('#skipBtn').onclick = () => {
  if (!current || liveIdx >= current.steps.length - 1) return;
  doneCoords = doneCoords.concat(current.steps[liveIdx].path || []);
  doneLine.setLatLngs(doneCoords);
  progLine.setLatLngs([]);
  goStep(liveIdx + 1);
};
$('#fakeSearch').onclick = () => $('#quickList').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
$$('[data-back]').forEach(b => b.onclick = () => show(b.dataset.back));

renderHome();

/* lien direct pour démo/capture : index.html#route=alcarrizos  ou  #route=alcarrizos&live */
(() => {
  const h = new URLSearchParams(location.hash.slice(1));
  const key = h.get('route');
  if (!key || !ROUTES[key]) return;
  setTimeout(() => { openRoute(key); if (h.has('live')) setTimeout(startLive, 1500); }, 2100);
})();

/* ------------------------------------------------------------------
   Metro SD — red de metro
   Estaciones y coordenadas: OpenStreetMap, relaciones route=subway
   operator=OPRET (data/metro-osm.json). 16 + 23 = 39 estaciones.
   Colores según las etiquetas OSM (L1 azul, L2 rojo) — verificar en el
   plano de estación.
------------------------------------------------------------------ */

const NET = {
  L1: {
    name: 'Línea 1',
    color: '#0072CE',
    stations: [
      { id: 'centro-de-los-heroes', name: "Centro de los Héroes", lat: 18.450863, lon: -69.927442 },
      { id: 'francisco-alberto-caamano-deno', name: "Francisco Alberto Caamaño Deñó", lat: 18.455524, lon: -69.924026 },
      { id: 'amin-abel-hasbun', name: "Amín Abel Hasbún", lat: 18.459159, lon: -69.916314 },
      { id: 'joaquin-balaguer', name: "Joaquín Balaguer", lat: 18.464597, lon: -69.909895 },
      { id: 'casandra-damiron', name: "Casandra Damirón", lat: 18.471231, lon: -69.912042 },
      { id: 'profesor-juan-bosch', name: "Profesor Juan Bosch", lat: 18.476688, lon: -69.913765 },
      { id: 'juan-pablo-duarte', name: "Juan Pablo Duarte", lat: 18.481625, lon: -69.914344, interchange: ['L2'] },
      { id: 'manuel-arturo-pena-batlle', name: "Manuel Arturo Peña Batlle", lat: 18.485797, lon: -69.914489 },
      { id: 'pedro-livio-cedeno', name: "Pedro Livio Cedeño", lat: 18.493864, lon: -69.915031 },
      { id: 'los-tainos', name: "Los Taínos", lat: 18.499986, lon: -69.915434 },
      { id: 'maximo-gomez', name: "Máximo Gómez", lat: 18.507784, lon: -69.915803 },
      { id: 'hermanas-mirabal', name: "Hermanas Mirabal", lat: 18.517915, lon: -69.915005 },
      { id: 'jose-francisco-pena-gomez', name: "José Francisco Peña Gómez", lat: 18.525344, lon: -69.916231 },
      { id: 'gregorio-luperon', name: "Gregorio Luperón", lat: 18.529447, lon: -69.908494 },
      { id: 'gregorio-urbano-gilbert', name: "Gregorio Urbano Gilbert", lat: 18.540381, lon: -69.904331 },
      { id: 'mama-tingo', name: "Mamá Tingó", lat: 18.547017, lon: -69.901102 }
    ]
  },
  L2: {
    name: 'Línea 2',
    color: '#C8102E',
    stations: [
      { id: 'pablo-adon-guzman', name: "Pablo Adón Guzmán", lat: 18.519642, lon: -70.010412 },
      { id: 'freddy-gaton-arce', name: "Freddy Gatón Arce", lat: 18.510458, lon: -70.008278 },
      { id: '27-de-febrero', name: "27 de Febrero", lat: 18.502609, lon: -69.999409 },
      { id: 'franklin-mieses-burgos', name: "Franklin Mieses Burgos", lat: 18.496447, lon: -69.991075 },
      { id: 'pedro-martinez', name: "Pedro Martínez", lat: 18.485749, lon: -69.978185 },
      { id: 'maria-montez', name: "María Montez", lat: 18.478676, lon: -69.968186 },
      { id: 'pedro-francisco-bono', name: "Pedro Francisco Bonó", lat: 18.479811, lon: -69.962002 },
      { id: 'francisco-gregorio-billini', name: "Francisco Gregorio Billini", lat: 18.481439, lon: -69.954473 },
      { id: 'ulises-francisco-espaillat', name: "Ulises Francisco Espaillat", lat: 18.481988, lon: -69.946564 },
      { id: 'pedro-mir', name: "Pedro Mir", lat: 18.483717, lon: -69.940761 },
      { id: 'freddy-beras-goico', name: "Freddy Beras-Goico", lat: 18.482536, lon: -69.93084 },
      { id: 'juan-ulises-garcia-saleta', name: "Juan Ulises García Saleta", lat: 18.48192, lon: -69.920474 },
      { id: 'juan-pablo-duarte', name: "Juan Pablo Duarte", lat: 18.481451, lon: -69.91455, interchange: ['L1'] },
      { id: 'coronel-rafael-tomas-fernandez-dominguez', name: "Coronel Rafael Tomás Fernández Domínguez", lat: 18.48178, lon: -69.906826 },
      { id: 'mauricio-baez', name: "Mauricio Báez", lat: 18.48762, lon: -69.904575 },
      { id: 'ramon-caceres', name: "Ramón Cáceres", lat: 18.492897, lon: -69.899218 },
      { id: 'horacio-vasquez', name: "Horacio Vásquez", lat: 18.495716, lon: -69.896161 },
      { id: 'manuel-de-jesus-galvan', name: "Manuel de Jesús Galván", lat: 18.49974, lon: -69.889886 },
      { id: 'eduardo-brito', name: "Eduardo Brito", lat: 18.504354, lon: -69.883934 },
      { id: 'ercilia-pepin', name: "Ercilia Pepín", lat: 18.50986, lon: -69.876057 },
      { id: 'rosa-duarte', name: "Rosa Duarte", lat: 18.510123, lon: -69.86954 },
      { id: 'trina-de-moya-de-vasquez', name: "Trina de Moya de Vásquez", lat: 18.509887, lon: -69.863421 },
      { id: 'concepcion-bona', name: "Concepción Bona", lat: 18.505239, lon: -69.857748 }
    ]
  }
};

/* Punto de partida de la demo */
const ORIGIN = { name: 'Mi ubicación · Naco', lat: 18.4780, lon: -69.9190 };

/* Destinos de la demo. Cada uno = una lista de tramos (legs).
   type: 'walk' | 'metro' | 'concho' | 'arrive'
   - Los tramos 'concho' referencian un código de ruta REAL (rutas.js,
     generado desde el CSV del INTRANT): tarifa, horario, operador y
     cantidad de vehículos salen del dato oficial.
   - stop / offCoord = parada donde se sube / se baja del concho.
   - Las caminatas y los conchos se trazan por las calles (Valhalla/OSM);
     el metro va en línea recta entre estaciones (es subterráneo).        */
const ROUTES = {
  alcarrizos: {
    label: 'Los Alcarrizos',
    sub: 'Santo Domingo Oeste',
    icon: '🏠',
    dest: [18.5185, -70.0290],
    legs: [
      { type: 'walk',  mins: 9,  to: 'Juan Pablo Duarte', note: 'Por la Av. Máximo Gómez' },
      { type: 'metro', line: 'L2', from: 'juan-pablo-duarte', to: 'pablo-adon-guzman',
        dir: 'Pablo Adón Guzmán', mins: 18, price: 20 },
      { type: 'walk',  mins: 3,  to: 'Parada de minibuses', note: 'Salida oeste de la estación' },
      { type: 'concho', ruta: 'M-27B', corridor: 'Av. Duarte → Los Alcarrizos',
        mins: 22, stop: [18.5200, -70.0118], off: 'Cruce Los Alcarrizos', offCoord: [18.5182, -70.0262],
        note: 'Sin horario fijo · sale cuando se llena' },
      { type: 'walk',  mins: 5,  to: 'Los Alcarrizos centro' },
      { type: 'arrive', name: 'Los Alcarrizos' }
    ]
  },
  mamating: {
    label: 'Mamá Tingó',
    sub: 'Villa Mella · terminal L1',
    icon: '🎓',
    dest: [18.5512, -69.9042],
    legs: [
      { type: 'walk',  mins: 9,  to: 'Juan Pablo Duarte', note: 'Por la Av. Máximo Gómez' },
      { type: 'metro', line: 'L1', from: 'juan-pablo-duarte', to: 'mama-tingo',
        dir: 'Mamá Tingó', mins: 21, price: 20 },
      { type: 'walk',  mins: 6,  to: 'Centro de Villa Mella' },
      { type: 'arrive', name: 'Mamá Tingó' }
    ]
  },
  colonial: {
    label: 'Zona Colonial',
    sub: 'Parque Colón',
    icon: '⛪️',
    dest: [18.4729, -69.8835],
    legs: [
      { type: 'walk',  mins: 9,  to: 'Juan Pablo Duarte', note: 'Por la Av. Máximo Gómez' },
      { type: 'metro', line: 'L1', from: 'juan-pablo-duarte', to: 'centro-de-los-heroes',
        dir: 'Centro de los Héroes', mins: 11, price: 20 },
      { type: 'walk',  mins: 4,  to: 'Parada de carros', note: 'Av. Independencia, acera sur' },
      { type: 'concho', ruta: 'C-1', corridor: 'Av. Independencia → Parque Independencia',
        mins: 13, stop: [18.4562, -69.9262], off: 'Parque Independencia', offCoord: [18.4716, -69.8920],
        note: 'Se para donde le pidas · paga al bajar' },
      { type: 'walk',  mins: 7,  to: 'Parque Colón' },
      { type: 'arrive', name: 'Zona Colonial' }
    ]
  }
};

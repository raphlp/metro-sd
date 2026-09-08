# Metro SD — prototype

Prototype indépendant d'un planificateur de trajets multimodal pour le Grand
Santo Domingo : métro, téléphérique, et le transport informel (conchos, guaguas)
que ni Moovit ni Google Maps ne couvrent.

> **Projet indépendant, sans aucune relation avec OPRET ni avec le Metro de
> Santo Domingo.** Maquette de démonstration, pas une application officielle.

## Le problème

Il existe des applications de transport à Saint-Domingue, mais aucune ne couvre
ce qui représente l'essentiel de la mobilité réelle : les conchos et les guaguas.
Pas d'arrêts fixes, pas d'horaires, pas d'itinéraires publiés — juste des
corridors connus et un savoir oral.

Vérifié dans OpenStreetMap : sur tout le Grand Santo Domingo, une seule ligne de
bus urbaine est cartographiée. Et dans la base mondiale Mobility Database, la
République dominicaine compte **un seul flux GTFS** — celui de Santiago de los
Caballeros, pas celui de la capitale.

## Ce que fait la maquette

Trois écrans cliquables : choix d'une destination, itinéraire tracé sur la carte,
puis trajet en cours avec le défilement des arrêts et la position qui avance.

- **39 stations** de métro (L1 et L2), coordonnées issues des relations
  `route=subway` d'OpenStreetMap
- **262 rutas** de conchos et guaguas avec tarif, horaires, opérateur et nombre
  de véhicules — données officielles de l'INTRANT
- Trajets à pied et en concho tracés **par les rues** (Valhalla / OSM) ; le métro
  en ligne droite entre stations, puisqu'il est souterrain

## Structure

```
prototype/     la maquette (HTML/CSS/JS, aucune dépendance à installer)
  index.html   les trois écrans
  data.js      réseau métro + itinéraires de démonstration
  rutas.js     généré depuis le CSV INTRANT — ne pas éditer à la main
  app.js       carte Leaflet, routage, simulation du trajet
data/          données sources (CSV INTRANT, export OSM du métro)
tools/         build-rutas.mjs — régénère prototype/rutas.js depuis le CSV
```

## Développement

Aucune installation. Ouvrir `prototype/index.html`, ou servir le dossier :

```bash
python3 -m http.server 8000 --directory prototype
```

Régénérer les données de rutas après une mise à jour du CSV de l'INTRANT :

```bash
node tools/build-rutas.mjs
```

Liens directs pratiques pour les démonstrations :
`#route=alcarrizos` ouvre l'itinéraire, `#route=colonial&live` lance le trajet.

## Sources

- Stations de métro — OpenStreetMap, relations `route=subway` opérateur OPRET
- Rutas de conchos et guaguas — INTRANT via [datos.gob.do](https://datos.gob.do)
- Fond de carte — Esri Light Gray Canvas
- Calcul d'itinéraire piéton et routier — Valhalla (OpenStreetMap)

## Limites connues

Le tracé des conchos sur la carte relie deux points par la route la plus
plausible : **la géométrie réelle des 262 rutas n'existe dans aucune source
publique**. C'est précisément le trou que ce projet cherche à combler.

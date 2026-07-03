# Mattis Travel Map

Eine kleine lokale Reisekarte: Länder markieren, Karte einfärben, Welt- und Kontinent-Fortschritt sehen.

## Start

```bash
python3 -m http.server 5173
```

Danach im Browser öffnen:

```text
http://localhost:5173
```

Die Markierungen werden im Browser per `localStorage` gespeichert.

## Daten

- Ländergrenzen: Natural Earth `ne_110m_admin_0_countries.geojson`
- Kartenrendering: D3 v7, lokal unter `assets/vendor/d3.v7.min.js`

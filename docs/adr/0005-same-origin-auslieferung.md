# 0005 – Same-Origin-Auslieferung

Status: Vorgeschlagen (Umsetzung in Schritt 10)
Datum: 2026-11-23
Bezug: SPEC §13

## Kontext

Die PWA und die API sollen ohne CORS und mit einer einzigen HTTPS-Adresse laufen, auch für die QR-URLs.

## Entscheidung

Die API liefert das Web-Build mit aus (`@fastify/static`), davor Caddy für HTTPS. Entwicklung: Vite-Proxy auf `/api`; E2E: `vite preview` mit Proxy.

## Alternativen

Getrennte Hosts mit CORS: mehr Konfiguration, zusätzliche Angriffsfläche, zwei Zertifikate.

## Folgen

Ein Container für App und API. Service Worker darf `/api/*` nie beantworten (ist so konfiguriert). CSP und Security-Header werden am Proxy gesetzt.

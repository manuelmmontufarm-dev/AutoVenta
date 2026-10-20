repo: manuelmmontufarm-dev/AutoVenta
branch: main
path: hub/src

## Last sync
date: 2026-09-25T01:49:05Z

### Updated in this project
- Recreated the current Hub shell (rail, topbar, racing details) and Inbox with fixture data
- «Taller» redesign: Armazón, Inbox, Conversación, Pipeline (two 24 h boards), Cotizador, Métricas, Ajustes, Configuración técnica, placa; 390 versions of Inbox, Conversación, Pipeline
- Working model of shell + Inbox with desktop/phone tweak
- Cotizador rebuilt on the original 3-column layout (filters · product cards with photo · action panel) from hub/src/screens/Cotizador.tsx

## Screen map
| Screen | Repo files |
| --- | --- |
| Hub actual - Inbox.dc.html | hub/index.html, hub/src/App.tsx, hub/src/screens/Inbox.tsx, hub/src/components/ui.tsx, hub/src/components/icons.tsx, hub/src/components/racing-details.tsx, hub/src/components/admin-key.tsx, hub/src/components/tour.tsx, hub/src/components/version-badge.tsx, hub/src/design/tokens.css, hub/src/design/themes/showroom-gp.css |
| hub-data.js | hub/src/data/mock/fixtures.ts, hub/src/data/types.ts, hub/src/lib/format.ts |
| Hub Taller.dc.html | (new design) hub/src/App.tsx, hub/src/screens/Inbox.tsx, hub/src/screens/TicketDetail.tsx, hub/src/screens/Pipeline.tsx, hub/src/screens/Cotizador.tsx, hub/src/screens/Dashboard.tsx, hub/src/screens/Ajustes.tsx, hub/src/screens/Settings.tsx, hub/src/components/icons.tsx, hub/src/data/mock/mockSource.ts |
| Hub Taller.dc.html (4a AutoVenta Hub) | app/site/index.html |
| Hub Taller - Modelo.dc.html | (new design, interactive) hub/src/App.tsx, hub/src/screens/Inbox.tsx |

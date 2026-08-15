# Deploy

> Dit bestand is straks de migratiehandleiding naar Vercel. Houd het actueel
> tijdens het bouwen, niet achteraf.

## Huidige omgeving
- Hosting: Hostinger
- Database: Supabase (gratis tier)

## Environment variables
| Naam | Waarvoor | Server/Client |
|---|---|---|
| | | |

## Build
```bash
npm ci
npm run build
```
Output: `[VUL IN]`

## Draaien
`[VUL IN — static serve of node server + poort]`

## Vercel-blockers
Alles wat nu Hostinger-specifiek is en straks aangepast moet worden:
- [ ]

## Backup vóór migratie
```bash
pg_dump "$SUPABASE_DB_URL" > backup-$(date +%F).sql
```

-- 0063 — Een commitment device krijgt eindelijk een lengtegrens (QS8-121)
--
-- ⚠️ Gevonden bij het losmaken van `commitmentSchema` uit `api.ts`:
--    `commitments.body` had géén enkele lengte-CHECK. De grenzen 3 en 500
--    bestonden uitsluitend in het Zod-schema, dus uitsluitend op de client.
--    Onwrikbare regel 3 zegt "alle input servergevalideerd"; hier was dat een
--    aanname. Wie rechtstreeks tegen PostgREST praat, kon een body van
--    willekeurige lengte wegschrijven.
--
-- ⚠️ Dit is een commitment device: domeinregel 5 en sinds 22-08 ook de
--    vraaggrens uit CLAUDE.md. Juist daar hoort de server te controleren en niet
--    het formulier.
--
-- ⚠️ `btrim()` in de CHECK, want het schema doet `.trim()`. Zonder dat is
--    '   x   ' server-side geldig en client-side niet — en dan verschilt de app
--    van de database precies waar hij dat niet mag.
--
-- ⚠️ De grens telt in codepunten (`char_length`), en het schema telt met
--    `telTekens()` hetzelfde. Zou het schema `.min(3)` houden, dan telde het
--    UTF-16-eenheden en lieten twee emoji de client passeren terwijl Postgres ze
--    weigert — de bug uit QS8-118, hier dan nieuw geïntroduceerd.
--
-- Idempotent: de constraint wordt eerst gedropt. Twee keer draaien is een no-op.
--
-- ROLLBACK:
--   alter table public.commitments drop constraint if exists commitments_body_len;
--
-- Geen dump vooraf nodig: `commitments` is leeg (0 rijen, nagemeten 22-08-2026)
-- en deze migratie voegt alleen een controle toe.

alter table public.commitments
  drop constraint if exists commitments_body_len;

alter table public.commitments
  add constraint commitments_body_len
  check (char_length(btrim(body)) >= 3 and char_length(btrim(body)) <= 500);

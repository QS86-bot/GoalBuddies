-- 0068 — Een commitment-afbeelding is een https-link, ook volgens de database (M3)
--
-- ⚠️ **Wat er misging.** `commitmentSchema.image_url` gebruikt `z.string().url()`,
--    en in zod 4 is dat géén schema-allowlist. Nagemeten met de versie in deze
--    repo (4.4.3):
--
--      "javascript:alert(1)"               -> geldig
--      "data:text/html,<script>x</script>" -> geldig
--      "file:///etc/passwd"                -> geldig
--
--    En server-side stond er niets: 0063 zette wel een CHECK op `body`, maar op
--    `image_url` nul validatie.
--
-- ⚠️ **Waarom dit nu moet en niet later.** Een commitment wordt per domeinregel
--    11 leesbaar voor de begunstigde groep zodra de straf verschuldigd wordt.
--    Komt er een scherm dat `image_url` als link of `<img>` rendert — op web —
--    dan is een opgeslagen `javascript:`-URL opgeslagen XSS richting je
--    groepsgenoten. Vandaag is dat onbereikbaar: `app/doel/[id].tsx` stuurt
--    altijd `null` en er is geen renderpad.
--
--    Maar dit is wél de wijziging die dat schema onder test brengt, en de test
--    legde de te ruime regel vast als "correct". Een test die het gat
--    bekrachtigt is erger dan geen test: de volgende die hier komt, leest hem
--    als een besluit.
--
-- ⚠️ **CHECK én Zod, niet één van beide.** Zod is de eerste lijn en geeft de
--    nette foutmelding; de CHECK is de lijn die ook geldt voor `service_role`,
--    voor een toekomstige tweede schrijver en voor een rechtstreekse
--    PostgREST-aanroep die het schema overslaat. Zelfde redenering als
--    domeinregel 7: de regel is pas afgedwongen als de dátabase hem afdwingt.
--
-- ⚠️ Alleen `https:`. Niet `http:`, want een gemengde-inhoudslink laadt op web
--    toch niet, en een afbeelding over onversleutelde verbinding lekt aan de
--    netwerkzijde wélk commitment iemand heeft. NULL blijft toegestaan — geen
--    afbeelding is de normale situatie.
--
-- Idempotent: `drop constraint if exists` + `add constraint`.
-- Veilig op een gevulde tabel: `commitments` bevat vandaag 0 rijen, en de
-- constraint wordt `not valid` toegevoegd en daarna gevalideerd, zodat een
-- eventuele bestaande rij de migratie niet omver trekt maar zichtbaar wordt.
--
-- ROLLBACK:
--   alter table public.commitments drop constraint if exists commitments_image_url_https;

alter table public.commitments
  drop constraint if exists commitments_image_url_https;

alter table public.commitments
  add constraint commitments_image_url_https
  check (image_url is null or image_url ~ '^https://[^[:space:]]+$')
  not valid;

alter table public.commitments
  validate constraint commitments_image_url_https;

comment on constraint commitments_image_url_https on public.commitments is
  'Migratie 0068: alleen https. z.string().url() in zod 4 laat javascript:, '
  'data: en file: door, en een commitment is leesbaar voor de begunstigde groep '
  'zodra de straf verschuldigd wordt (domeinregel 11).';

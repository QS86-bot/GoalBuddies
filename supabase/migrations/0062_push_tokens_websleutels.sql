-- 0062 — Web push: de twee sleutels van een PushSubscription (QS8-114)
--
-- Een `PushSubscription` is geen string maar een endpoint plus twee sleutels.
-- Het endpoint gaat in `token` — dan doet de bestaande UNIQUE(token) precies de
-- deduplicatie die web push nodig heeft en werkt `on conflict (token)` in
-- `registreer_push_token()` ongewijzigd door.
--
-- ⚠️ Waarom niet de hele JSON in `token`. Dan is de sleutel de exacte
--    JSON-string en niet de identiteit van het abonnement. `toJSON()` bevat
--    `expirationTime`, dat van null naar een getal kan gaan; de string verandert,
--    de `on conflict` vuurt niet, en dezelfde browser krijgt een tweede rij —
--    dus twee meldingen, zonder fout en zonder rode test.
--
-- ⚠️ `platform` stond al toe op 'web' (0053). Dit vult alleen aan wat er voor dat
--    platform bij hoort.
--
-- Idempotent: `if not exists` op de kolommen, en de constraint wordt eerst
-- gedropt. Twee keer draaien is een no-op.
--
-- ROLLBACK:
--   alter table public.push_tokens drop constraint if exists push_tokens_websleutels;
--   alter table public.push_tokens drop column if exists p256dh;
--   alter table public.push_tokens drop column if exists auth;
--
-- Geen dump vooraf nodig: de tabel is leeg (0 rijen, nagemeten 22-08-2026) en
-- deze migratie voegt alleen toe. De rollback gooit niets weg wat er eerder was.

alter table public.push_tokens
  add column if not exists p256dh text,
  add column if not exists auth   text;

comment on column public.push_tokens.p256dh is
  'Web push: de publieke ECDH-sleutel van de abonnee (RFC 8291). Null voor ios/android.';
comment on column public.push_tokens.auth is
  'Web push: het authenticatiegeheim van de abonnee (RFC 8291). Null voor ios/android.';

-- De sleutels horen bij precies één platform, en alle drie de kolommen moeten
-- het daarover eens zijn. Gelijkheid van twee beweringen, niet twee losse
-- insluitingen: web zónder sleutels is net zo fout als native mét.
alter table public.push_tokens
  drop constraint if exists push_tokens_websleutels;

alter table public.push_tokens
  add constraint push_tokens_websleutels
  check ((platform = 'web') = (p256dh is not null and auth is not null));

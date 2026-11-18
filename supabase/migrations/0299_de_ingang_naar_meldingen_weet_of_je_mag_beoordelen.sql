-- 0299_de_ingang_naar_meldingen_weet_of_je_mag_beoordelen.sql — de client mag
-- vragen "beoordeel ik ergens iets?", zodat de ingang naar /meldingen er altijd
-- staat voor wie mag beoordelen, ook als er niets wacht — QS8-705.
--
-- ROLLBACK-PAD:
--   revoke execute on function public.moderatiepoort() from public, anon, authenticated;
--   (zet de comment terug op de tekst van 0297; de functie zelf verandert niet)
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Quinten zocht /meldingen op de groepspagina en vond hem niet op Profiel.
-- De kaart "Er wacht een melding" (QS8-586) verschijnt alleen als
-- `openstaande_meldingen()` een rij geeft. Een beheerder met een lege wachtrij en
-- een gewone gebruiker krijgen allebei nul rijen, dus voor beiden is de ingang
-- onzichtbaar, en de beheerder weet niet dat hij bestaat.
--
-- ⚠️ **Wat de client níet mag doen is zelf een rol raden** (zie `app/meldingen.tsx`:
--    een rolcontrole in de schermlaag is een tweede waarheid naast de RPC). De
--    enige vraag die klopt is er een aan de database, en die bestaat al:
--    `moderatiepoort()` uit 0297 (M3) is exact "beoordeelt deze sessie ergens
--    iets?". Hij is alleen nooit aan `authenticated` gegeven, want hij was een
--    kostenpoort binnen `openstaande_meldingen()`.
--
-- ⚠️ **Dit is geen nieuwe functie en dus geen nieuwe logica.** Alleen de
--    uitvoerrechten verschuiven. Een nieuwe wrapper had een tweede definitie
--    betekend die uit elkaar kan lopen met de poort die `openstaande_meldingen()`
--    zelf gebruikt; nu is het dezelfde functie, en 🔎 de gegenereerde types kennen
--    hem al (`moderatiepoort: { Args: never; Returns: boolean }`), dus er is geen
--    typecorrectie en geen handwerk in `database.types.ts`.
--
-- ⚠️ **Wat hij prijsgeeft en aan wie.** Eén boolean over de aanroeper zelf: de
--    functie neemt geen argumenten en leest `auth.uid()`. Hij zegt niets over een
--    ander, dus domeinregel 7 is niet in beeld, en `anon` krijgt hem niet
--    (`auth.uid()` is dan null; toegang weigert al op uitvoerrecht).
--
-- ⚠️ **Hij is een kostenpoort en blijft dat.** "true" betekent: platformbeheerder
--    óf beheerder van minstens één groep waar je niet inactief in bent. Dat kan
--    breder zijn dan wat er te beoordelen valt (een beheerder van een groep
--    zonder meldingen), en dat is gewenst voor een ingang: de vraag is "mag ik
--    hier kijken", niet "wacht er iets". Wat er te zien is, bepaalt nog steeds
--    uitsluitend `openstaande_meldingen()`.
--
-- Idempotent: `create or replace` van een bestaand lichaam is niet nodig; een
-- grant en een comment zijn herhaalbaar.
-- ---------------------------------------------------------------------------

revoke execute on function public.moderatiepoort() from public, anon, authenticated;
grant  execute on function public.moderatiepoort() to authenticated;

comment on function public.moderatiepoort() is
  'Beoordeelt deze sessie ergens iets? Kostenpoort voor openstaande_meldingen() '
  'en, sinds 0299, door de client leesbaar voor de ingang naar /meldingen. Eén '
  'boolean over de aanroeper zelf. Staat niets toe wat de routes niet al '
  'toestaan — QS8-586/0297 M3, QS8-705/0299.';

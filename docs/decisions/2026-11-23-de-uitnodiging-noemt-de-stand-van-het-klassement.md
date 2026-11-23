# De uitnodiging noemt de stand van het klassement — QS8-801, migratie 0341

**Datum:** 23-11-2026 · **Issue:** QS8-801 · **Vervolg op:** QS8-798 (PR #806)

## Wat er was

📏 Op main `6f2d5ebe` gaf `invite_preview()` acht sleutels terug en geen
`klassement_aan`. Na #806 zegt het uitnodigingsscherm daarom alleen dat een groep
*standaard* met een klassement begint. Sinds A57 (0333) is het klassement een
schakelaar op de groep, dus "standaard" kan voor díe groep onwaar zijn.

## Wat er nu is

- **0341** voegt `'klassement_aan', g.klassement_aan` toe aan het antwoord van
  `invite_preview()`. Eén `create or replace`, het lichaam van 0277 woordelijk
  overgenomen. Handtekening en returntype blijven gelijk: geen drop, geen nieuwe
  grant, het anon-plafond van `scripts/adviseur-controle.mjs` blijft 1.
- Het scherm kiest met `uitnodigingKlassementTekst()` uit drie zinnen: aan, uit,
  of de standaardtekst van #806 als de server het veld niet noemt.

## Keuzes

1. **Ook zonder account.** Het veld staat naast `zichtbaarheid` (0080) en om
   dezelfde reden: wie meedoet, laat de groep zijn in deze groep verdiende punten
   zien, en dat hoort vóór de knop te staan. Domeinregel 7, vraag 1: uit één
   boolean over de groep valt geen week van een lid af te leiden.
2. **Onbekend is de standaard, niet "uit".** Een oudere server die het veld niet
   stuurt, krijgt de tekst van #806. "Uit" zou een stand verzinnen, en de
   geruststellende kant op.
3. **De zin bij "uit" zegt dat aanzetten de oude punten meeneemt.** `points_ledger`
   bewaart de `group_id` altijd (A57), dus wie meedoet met een groep zonder
   klassement, kan zijn punten later toch in een klassement zien staan. Dat is
   een belofte (grens 1), en de bevestiging van `zet_groepsklassement()` noemt
   het ook.
4. **De zin bij "uit" zegt niet "een beheerder kan het aanzetten".** Voor een
   teamgroep en een automatisch gevormde groep kan dat nooit (CHECK's
   `groups_team_geen_klassement` en `groups_automatisch_geen_klassement`), en
   het antwoord geeft met opzet niet prijs welke soort groep het is.

## Pad terug

De kop van 0341 draagt het rollback-pad: het lichaam van 0277 terugzetten. De
client valt dan vanzelf terug op de standaardtekst.

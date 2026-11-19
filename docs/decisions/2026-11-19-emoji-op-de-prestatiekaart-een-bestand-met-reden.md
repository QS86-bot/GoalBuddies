# Emoji op de prestatiekaart: een bestand met reden, nooit een map

QS8-732, 19-11-2026. Voert de uitzondering uit die Quinten in QS8-722 besloot (emoji alleen op prestaties, naast de
vectorpictogrammen; mijn advies was alleen vectoren). Aanvulling vijfde ronde: de gebruiker kan ze uitzetten.

## Wat gebouwd is

- `src/schermen/prestaties/prestatie-emoji.ts`: vaste lijst `BADGE_EMOJI` (medaille, ster, schild, vlam, trofee) en
  `emojiVoorPrestatie(badge, behaald, emojiAan)`, de ene plek waar "toon je een emoji" beslist wordt.
- `Prestatiescherm.tsx` toont de emoji in een eigen `Text` met `aria-hidden` en `importantForAccessibility="no-hide-descendants"`;
  de naam van de prestatie staat in de rij en in het toegankelijkheidslabel van de rij. Geen emoji midden in een zin.
- De voorkeur is `useUiterlijk().voorkeur.emoji` (kolom uit QS8-729, schakelaar uit QS8-731). Uit: `null`, dus geen emoji-teken.
- `scripts/emoji-controle.mjs` heeft `UITZONDERINGEN`: pad, reden en toegestane tekens.

## Waarom zo

- **Eén bestand, geen map.** Een mapuitzondering verruimt elk bestand dat er later bij komt, en dat is hoe een standaard
  verschuift zonder dat iemand het besloot. De controle werpt bij een ingang die geen `.ts(x)`-pad is.
- **Ook de tekens staan in het register.** Een lijst die alleen op bestand toelaat, laat de emoji-set stil groeien binnen dat
  bestand. Een zesde teken is rood; een test houdt de lijst en het register aan elkaar gelijk.
- **Alleen behaald.** Vergrendeld is het gedimde vectorpictogram (domeinregel 7: geen teken voor wat je mist).
- **Geen prestatie die een gemiste week verraadt** (zoals "freeze gebruikt"): die bestaat niet; `BADGE_EMOJI` is een
  `Record<Badge, string>` en de badgelijst bevat er geen.

## Gemeten (met de hand gebroken)

Emoji in een ander bestand in dezelfde map: rood. Zesde teken in het toegestane bestand: rood. Register-ingang voor een map:
controle werpt. Vergrendeld toont emoji: test rood. Scherm negeert de voorkeur: test rood.

## Aannames, niet gemeten

- Systeem-emoji zien er acceptabel uit op alle toestellen en versies (de schakelaar is de uitweg).
- Geen gerenderde-kaart-test: de testopstelling heeft geen React Native-renderer. De belofte "uit = geen emoji-teken" is
  vastgelegd op de beslisser en op de naad (het scherm krijgt zijn emoji alleen uit die beslisser met `voorkeur.emoji`).
  Een renderertest is een vervolg als die opstelling er komt.
- `🛡️` draagt een variatieselector; het register telt alleen het pictografische teken.

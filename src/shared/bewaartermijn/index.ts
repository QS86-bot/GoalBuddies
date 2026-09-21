/**
 * Hoe lang de server een gedeelde bijlage bewaart — QS8-396 (0235), QS8-408
 * (0250) en QS8-411 (0251).
 *
 * **Besluit van Quinten: 21 dagen, voor foto's én documenten.** Op 09-09-2026
 * voor de chatfoto, op 10-09-2026 voor het document — en bij dat tweede besluit
 * met zoveel woorden: *"geen eigen constante en geen tweede knop. Twee
 * constanten met dezelfde stand is een halve familie, en dat is in dit project
 * de duurdere vorm."*
 *
 * ⚠️⚠️ **Er stonden hier tot 10-09-2026 twee constanten, en dat was een
 *    afwijking van dat besluit.** `CHATDOC_BEWAARDAGEN` is met QS8-411 weg; de
 *    documentpas leest dezelfde waarde als de fotopas. Wie ze ooit uit elkaar
 *    wil trekken, doet dat als besluit en niet als bijvangst — en leest eerst
 *    waarom ze bij elkaar staan.
 *
 * ⚠️⚠️ **Een kopie van `bijlage_bewaartermijn()` en geen bron.** De database is
 *    de grendel: de twee opruimpassen lezen die functie, niet dit getal. Deze
 *    constante bestaat om het in de interface te kunnen zéggen. Lopen de twee
 *    uiteen, dan belooft het scherm een andere termijn dan de server aanhoudt —
 *    allebei de onderdelen kloppen en het geheel liegt, precies de naadfout van
 *    onwrikbare regel 18. `tests/rls/chatfoto-bewaartermijn.test.ts` en
 *    `tests/rls/chatdoc-bewaartermijn.test.ts` leggen ze naast elkaar — één per
 *    opruimpas, allebei tegen dezelfde functie.
 *
 * ⚠️ **Waarom in `shared` en niet in `modules/buddies`, met dezelfde reden als
 *    `shared/categorieen`.** `shared/ui/Foto.tsx` en `shared/ui/Document.tsx`
 *    zetten de tekst neer die er staat waar de bijlage stónd, en `shared` mag
 *    geen module aanspreken — de barrel van `modules/buddies` trekt de
 *    Supabase-client mee, en dan is geen enkel UI-component los te testen.
 *    `modules/buddies` exporteert hem door, dus voor elke bestaande lezer
 *    verandert er niets.
 *
 * ⚠️ **Geen tijdberekening.** Dit is een getal en geen "vandaag": correctheids-
 *    regel 7 gaat over week- en cyclusrekenwerk, en een leeftijd in dagen valt
 *    daar niet onder — om dezelfde reden dat de opruimpassen in SQL mogen staan.
 */
export const BIJLAGE_BEWAARDAGEN = 21;

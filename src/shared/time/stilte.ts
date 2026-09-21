/**
 * Stille uren — het venster waarin een gebruiker geen meldingen wil ontvangen.
 *
 * ⚠️ **Waarom dit in `shared/time` staat en niet in de notificatiejob.**
 *    Correctheidsregel 7: geen enkele tijdberekening buiten deze module. Een
 *    venster dat over middernacht heen loopt is precies het soort rekenwerk dat
 *    er op twee plekken anders uit gaat zien zodra iemand het ter plekke oplost.
 *
 * ⚠️ **De eenheid is een heel uur, en dat is geen afronding maar de werkelijke
 *    precisie.** De notificatiejob draait één keer per uur en kent van de
 *    gebruiker alleen `partsIn(tz, nu).hour`. Een venster van 22:30 tot 07:15
 *    zou doen alsof er halve uren bestaan die niemand kan waarnemen. Zie
 *    `docs/decisions/`, het besluitdocument bij QS8-92.
 */

/**
 * Ligt `uur` binnen het stille venster `[van, tot)`?
 *
 * `van === tot` is een **leeg** venster en niet een venster van 24 uur: een
 * gebruiker die stilte van 22:00 tot 22:00 instelt, bedoelt aantoonbaar niets,
 * en "de hele dag stil" is beter uit te drukken door alle soorten uit te zetten.
 * Zo blijft er ook geen stand bestaan waarin niemand ooit iets krijgt zonder dat
 * hij dat per soort gekozen heeft.
 *
 * @param uur Het lokale uur van de ontvanger, 0–23.
 * @param van Het eerste stille uur, 0–23. `null` betekent: geen stille uren.
 * @param tot Het eerste uur dat weer luid is, 0–23. `null` betekent: geen stille uren.
 */
export function inStilteVenster(
  uur: number,
  van: number | null,
  tot: number | null,
): boolean {
  if (van === null || tot === null) return false;
  if (van === tot) return false;

  // Een venster dat niet over middernacht loopt: 01:00–06:00.
  if (van < tot) return uur >= van && uur < tot;

  // ⚠️ En het geval waar dit voor bestaat: 22:00–07:00. Twee stukken, en een
  //    vergelijking met `&&` geeft hier altijd `false` — de klassieke fout.
  return uur >= van || uur < tot;
}

/**
 * Het eerstvolgende uur waarop het weer luid is, gegeven een uur in het venster.
 *
 * Bestaat om de gebruiker te kunnen vertellen wanneer een onderdrukte melding
 * alsnog komt, in plaats van hem te laten raden.
 */
export function eersteLuideUur(van: number | null, tot: number | null): number | null {
  if (van === null || tot === null || van === tot) return null;
  return tot;
}

/**
 * Het uur waarop een melding die op `uur` gepland stond, daadwerkelijk gaat.
 *
 * ⚠️ **Waarom verschuiven en niet weigeren — het besluit van QS8-406.** `nudge`
 *    en `cycle_summary` vuren op één specifiek uur. Valt dat uur in het stille
 *    venster, dan zou de melding die dag helemaal niet gaan: zet iemand zijn
 *    herinnering op 23:00 met stilte van 22:00 tot 07:00, dan krijgt hij er
 *    **nooit** meer een, en niets wordt daar rood van (regel 18, vraag 5).
 *
 *    De voor de hand liggende reparatie is een validatie die de combinatie
 *    weigert. Die is hier afgewezen: hij zou twee kolommen moeten bewaken die
 *    van twee kanten bewegen — je kunt de stille uren dichtzetten en dáárna je
 *    herinneringsuur verzetten, en die route staat open zolang `reminder_time`
 *    een gewone kolomgrant heeft. Een slot met een deur ernaast is in dit
 *    project al twee keer duur geweest (QS8-327, QS8-352).
 *
 *    Door de twee te laten samenstellen bestaat er geen ongeldige combinatie
 *    meer om tegen te houden. De prijs — je krijgt hem om 07:00 in plaats van om
 *    23:00 — staat op het scherm, afgeleid uit déze functie, zodat die zin niet
 *    uit de pas kan lopen met wat er gebeurt.
 */
export function verschovenUur(
  uur: number | null,
  van: number | null,
  tot: number | null,
): number | null {
  if (uur === null) return null;
  return inStilteVenster(uur, van, tot) ? (eersteLuideUur(van, tot) ?? uur) : uur;
}

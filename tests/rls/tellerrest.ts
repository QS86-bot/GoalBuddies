/**
 * Wat de suite in `dagtellers` achterlaat — QS8-442.
 *
 * ⚠️⚠️ **Dit is een eigenschap van het gehéél en daarom staat hij in de
 *    teardown.** Elk van de honderdvierenzestig bestanden ruimt zijn eigen
 *    sleutels op; geen van de honderdvierenzestig kan zien of er ná de hele run
 *    nog iets staat dat de vólgende run raakt. Regel 18 vraag 1: daar waar twee
 *    correcte onderdelen aan elkaar knopen, hoort de toets.
 *
 * ⚠️⚠️ **Waarom uitgerekend deze tabel.** `dagtellers` is met opzet gebouwd om
 *    een `delete` te overleven — hij telt de handelingen die er wáren en niet de
 *    rijen die er staan (QS8-399, migratie 0233). De gewone fixture-opruiming
 *    doet er daardoor niets aan: een rij hangt niet aan een gebruiker of groep
 *    die `removeTestUsers()` weghaalt, maar aan een tekstsleutel die niemand
 *    bezit.
 */

/**
 * ⚠️ **De grens is "varieert per run" en niet "is opgeruimd".** Een sleutel die
 *    per run verschilt is rommel en geen gif: de volgende run maakt een andere
 *    en botst er nooit mee. Een sleutel die elke run dezelfde is, telt gewoon
 *    door — en `dagtellers` overleeft een delete met opzet (QS8-399).
 *
 * ⚠️⚠️ **Twaalf hexadecimale tekens achter elkaar, en niet de uuid-vorm.** Die
 *    eerste versie stond hier en was te smal: `proefCode()` maakt óók een waarde
 *    per run — `label` + de twaalf tekens van de runprefix — en dat is géén
 *    uuid. 📏 Aangetroffen bij de eerste échte teardown: de fixture
 *    `mijnmap/submap` in `chatfotobucket.test.ts` is met opzet **geen** uuid,
 *    want dat bestand toetst juist dat een pad zonder uuid de teller niet doet
 *    omvallen. Die mag dus wél per run variëren, maar niet naar een uuid.
 *    Twaalf hex dekt allebei de hulpmiddelen: de staart van een uuid en de
 *    prefix van een `proefCode()`.
 *
 * ⚠️ **Wat hij niet ziet:** een vaste sleutel die toevallig twaalf hextekens
 *    draagt (`deadbeefcafe`). De markering is een signaal en geen bewijs; dat
 *    staat hier opgeschreven in plaats van weggelaten.
 *
 * 📏 Het gemeten geval waar dit mee begon: `groep | g = 8` stond er na elke
 *    volle run, tussen twintig rijen die wél per run verschilden.
 */
export const PER_RUN_MARKERING = /[0-9a-f]{12}/i;

/** De sleutels die elke run dezelfde zijn — geëxporteerd om te kunnen voeden. */
export function vasteSleutels(sleutels: readonly string[]): string[] {
  return sleutels.filter((sleutel) => !PER_RUN_MARKERING.test(sleutel));
}

/** De melding, of `null` als de suite niets giftigs achterliet. */
export function restMelding(sleutels: readonly string[]): string | null {
  const vast = vasteSleutels(sleutels);
  if (vast.length === 0) return null;

  return [
    `De RLS-suite liet ${vast.length} tellerrij(en) achter met een sleutel die elke run dezelfde is:`,
    ...vast.map((s) => `  ${s}`),
    '',
    'Zo\'n rij telt bij de vólgende run gewoon door, en `dagtellers` overleeft een',
    'delete met opzet (QS8-399). Geef de fixture een `proefId()` of `proefCode()`,',
    'zodat zijn sleutel per run verschilt — zie QS8-442.',
    '',
    'Staat er nog rommel van vóór die reparatie: `truncate dagtellers` op de',
    'teststack, of bouw hem opnieuw op met `npm run rls:stack`.',
  ].join('\n');
}

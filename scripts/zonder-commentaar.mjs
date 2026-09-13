/**
 * De knip die commentaar uit JS- en TS-bron haalt — QS8-446.
 *
 * ⚠️⚠️ **Dit is een grendel en geen hulpfunctie, en CLAUDE.md zegt dat met
 *    zoveel woorden.** Elke bronzeef in dit project leunt erop: hij bepaalt wat
 *    er *code* heet en wat *uitleg*. Knipt hij te veel weg, dan blijft de zeef
 *    groen terwijl de belofte breekt — en dat is precies wat een zeef nooit mag.
 *
 * 📏 **Het gemeten geval (QS8-412).** De vorm `bron.replace(/\/\/[^\n]*\/g, '')`
 *    eet alles op ná de `//` van een URL:
 *
 *      bron   : const x = 'https://opslag/x'; Linking.openURL(x);
 *      blind  : const x = 'https:
 *
 *    Dezelfde knip stond toen in twee testbestanden en was in allebei blind.
 *    Bij het ijken werd de suite rood op een ándere toets dan de grendel die de
 *    mutatie noemde, en de bedoelde grendel bleef groen.
 *
 * ⚠️ **De regelvorm hieronder is juist de vorm die dát overleeft**: hij kijkt of
 *    de **regel** met `//` begint en knipt niet midden in een regel. Een URL
 *    staat nooit aan het begin van zijn regel, een regelcommentaar wel.
 *
 * ⚠️ **Waarom blokken eerst en per regex.** `/* … *\/` dekt zowel JSDoc als de
 *    JSX-vorm `{/* … *\/}`. Bij die tweede blijven `{` en `}` staan; dat is voor
 *    een zeef onschadelijk — wat telt is dat de tékst eruit is.
 *
 * ⚠️⚠️ **Hij vervangt een blok door één spatie en niet door evenveel
 *    regeleindes.** Wie regelnúmmers meldt, heeft de tweede vorm nodig, want
 *    anders wijst zijn melding naar de verkeerde regel — `gedeelde-identiteit-
 *    controle.mjs` doet dat en houdt daarom met reden zijn eigen knip. Zie het
 *    register in `scripts/knip-controle.mjs`.
 *
 * ⚠️ **`.mjs` en niet `.ts`, zodat beide bomen hem kunnen importeren.**
 *    `scripts/` is plain JS en kan geen `.ts` uit `tests/` halen; andersom kan
 *    wel. Dat is dezelfde vorm als het psql-register (QS8-414): twee bomen
 *    mogen elk hun eigen standaard hebben, zolang ze er elk maar één hebben —
 *    hier is het er zelfs één voor allebei.
 *
 * ⚠️ Geïjkt in `tests/scripts/zonder-commentaar.test.ts`, met de URL-vorm erin.
 *    **Een knip zonder die toets is een aanname.**
 */
export function zonderCommentaar(bron) {
  return bron
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((regel) => !regel.trimStart().startsWith('//'))
    .join('\n');
}

/**
 * De kiezers: wat het platform aan bytes aanlevert — QS8-423.
 *
 * ⚠️⚠️ **Waarom dit een eigen laag is en geen map in `shared/ui`.** Tot
 *    11-09-2026 stonden `kiesFoto()` en `kiesDocument()` in `src/shared/ui`, en
 *    dat leverde een knoop op die geen van beide lagen kon oplossen: de hooks
 *    die ze gebruiken hebben óók de keuring van hun eigen domein nodig
 *    (`keurChatfoto`, `keurChatdoc`, `tekenChatdoc`), en die woont in
 *    `modules/buddies`. 📏 Gemeten: `shared/ui` importeerde daardoor drie keer
 *    de datalaag, en de lintregel dekte alleen de ómgekeerde richting.
 *
 *    Naar `modules/buddies` verhuizen loste niets op — dan importeert de
 *    datalaag `shared/ui`, en dát is precies wat `eslint.config.js` sinds
 *    QS8-207 verbiedt. De knoop zat in de aanname dat een fotokiezer UI is.
 *
 * ⚠️ **Een kiezer is geen UI.** Hij rendert niets, draagt geen label en kent
 *    geen toon — de drie dingen die `shared/ui` volgens zijn eigen lintmelding
 *    bezit. Hij opent een systeemvenster en geeft bytes terug. Dat is een
 *    **platformvermogen**, en `kiesFoto.ts` schreef dat zelf al op: *"een
 *    fotokiezer is geen module-communicatie maar een platformvermogen; hij
 *    hoort in de laag die het platform al kent."* Die zin klopte; alleen de
 *    laag bestond nog niet.
 *
 * ⚠️ **Wat deze laag wél mag importeren:** `expo-*` en andere shared-modules.
 *    `modules/**` mag niet, en dát is sinds QS8-423 een lintregel — geen
 *    gewoonte. ⚠️ Een import uit `shared/ui` is **niet** afgedwongen en hoort
 *    er evenmin: dan is de knoop terug, één niveau verderop. Dat staat hier als
 *    afspraak en niet als grendel, en het verschil hoort te blijken uit deze
 *    zin in plaats van uit een rode lint die er niet is.
 *
 * ⚠️ De hooks die deze kiezers aan een domein knopen wonen bij dat domein:
 *    `modules/buddies/react.ts` (chat) en `modules/completions/react.ts`
 *    (bewijsfoto). Zie `docs/decisions/2026-09-11-een-kiezer-is-geen-ui.md`.
 */
export { kiesFoto, type Fotokeuze, type Fotofoutsleutel } from './kiesFoto';
export { kiesDocument, teGroot, type Documentkeuze, type Documentfoutsleutel } from './kiesDocument';
export type { Gekozenbijlage } from './verzendbijlage';
export { naarVerzending } from './verzendbijlage';

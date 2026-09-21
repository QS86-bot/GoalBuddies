# Een belofte-test die een comment tevredenstelt — QS8-568

**21-09-2026.** Vijf belofte-tests bleven groen als je de belofte
uitcommentarieerde.

De vorm is een **bevestigende aanwezigheidstoets op ruwe bron**:

```ts
const inhoud = readFileSync(SCHERM, 'utf8');
expect(inhoud).toContain('magOvernemenUitDagzetten(');
```

De belofte is *"dit scherm roept die poort aan"*. Wat er getoetst wordt is *"die
tekenreeks staat in het bestand"* — en dat is óók waar als de aanroep
uitgecommentarieerd is. Bij een tijdelijke uitschakeling blijft de naam juist
wél staan, in de comment.

## Waarom dit zwaarder weegt dan dezelfde vorm in `scripts/`

QS8-567 repareerde vier **controles** met deze fout. Dit is `tests/beloftes/`, en
de Solo-fase-regel zegt dat tests *de enige review die bestaat* zijn. Een
belofte-test die met een commentaarregel te bevredigen is, bewaakt niets — en
`dagzet-privacy` bewaakt de grens tussen privé (domeinregel 9) en
groepszichtbaar.

## 📏 De meting

Het issue noemde **twee** gemeten gevallen en **drie** ongemeten kandidaten. Alle
drie de kandidaten zijn nagemeten, en alle drie falen ze open. Het zijn er dus
vijf.

| bestand | mutatie | vóór | ná |
|---|---|---|---|
| `dagzet-privacy.test.ts` | `magOvernemenUitDagzetten(` uitgecommentarieerd | groen | 1 rood |
| idem | `setDid(voorstel)` uitgecommentarieerd | groen | 1 rood |
| `doel-in-meerdere-groepen.test.ts` | `deling.kies_eerst` uitgecommentarieerd | groen | 1 rood |
| idem | `deling.uitleg_open` hernoemd | groen | 1 rood |
| `wachten-op-de-coach.test.ts` | `voortgangsweergave(` uitgecommentarieerd | groen | 1 rood |
| idem | `wachtstand(` uitgecommentarieerd | groen | 1 rood |
| `herinnering.test.ts` | `herinneringVelden` uitgecommentarieerd | groen | 1 rood |
| `de-vragenlijst-wordt-niet-twee-keer-gesteld.test.ts` | de rem `!profielLaadt` uitgecommentarieerd | groen | 1 rood |
| idem | `coach.al_ingevuld` uitgecommentarieerd | groen | 1 rood |

⚠️ **De "vóór"-kolom is gemeten en niet aangenomen.** Bij `herinnering` is de
mutatie mét én zonder de reparatie gedraaid: zonder blijft hij groen op 8, mét
gaat hij rood op 1. Dat is de eis uit CLAUDE.md — een rood is pas jóuw rood als
je "ervoor" ook gemeten hebt.

## ⚠️⚠️ Eén mutatie mat niets, en dat lag aan de mutatie

📏 De eerste poging bij `herinnering` hernoemde `herinneringVelden` naar
`herinneringVeldenX` en gaf **nul** rood. De reparatie was niet stuk: de toets
luidt `toContain('export function herinneringVelden')`, en
`herinneringVeldenX` **bevat** die tekenreeks als voorvoegsel. De mutatie raakte
de grendel dus nooit.

Zelfde klasse als de andere nullen in dit project: een ijking die zijn geval
langs de grendel voert in plaats van erdoorheen. Met `veldenVoorDeHerinnering`
als nieuwe naam gaat hij wél rood.

⚠️ Dat prefix-gedrag blijft bestaan en is hier **geen** defect: de belofte is
*"de schrijver bestaat nog"*, en een schrijver die anders heet bestaat nog.

## De keuze: knippen op de leesplek, niet per toets

Vier van de vijf bestanden lezen hun bron één keer voor een heel blok. De knip
staat daarom op de leesplek en niet bij elke `expect`:

- hij dekt ook de toetsen die er later bij komen, en dat is precies waar deze
  klasse vandaan komt;
- de zeven-functies erboven krijgen hun vormen los aangeboden en veranderen niet
  van gedrag — een knip binnenín zou die ijking juist stiller maken.

De knip zelf is de gedeelde `zonderCommentaar` uit `scripts/zonder-commentaar.mjs`
(QS8-446), doorgegeven via `tests/beloftes/roept-aan.ts`. Geen achttiende kopie.

Voor `magOvernemenUitDagzetten` is het `roeptAan()` geworden in plaats van
`toContain`: die eist een aanroep mét haakjes en houdt met een negatieve
vooruitblik een langere naam buiten de deur.

### ⚠️ Bij `wachten-op-de-coach` knipt hij op twee plekken

Daar bepaalt de bron óók **wie** er getoetst wordt: `WACHTERS` is elk scherm dat
`fetchJob(` bevat. Een scherm dat dat alleen in een comment noemt, wacht nergens
op en zou twee grendels moeten halen die niet over hem gaan.

📏 Nagemeten dat de knip de lijst niet stil laat krimpen — die zou dan minder
bewaken zonder dat iemand het ziet: **3 schermen ruw, 3 geknipt**
(`app/doel/coach/[id].tsx`, `app/doel/plan.tsx`, `app/doel/weekdoelen/[id].tsx`).

## Criterium 4: verdient dit een grendel? — ja, en niet in dit issue

Het issue vroeg dit te *overwegen* en waarschuwde dat een blinde eis in
`tests/beloftes/` ruis wordt. Die afweging is nu te maken met een getal in plaats
van een vermoeden.

📏 Gemeten ná deze vijf reparaties: van de **49** lezende bestanden knippen er
**28** en **21** niet. Van die 21 dragen er **12** de gevaarlijke vorm — een
bevestigende `toContain`/`toMatch` op een variabele met ongeknipte
bestandsinhoud:

```
7  weekpas-bereikt-je            3  onboarding-eindigt-ergens     1  aanmeldscherm
5  onboarding-schrijft-niets-over 2  datumopmaak                  1  de-rls-suite-meet-of-valt-om
4  avatar                         2  pushdienst-allowlist         1  een-profielveld-is-te-wijzigen
4  de-tijdzone-volgt-het-apparaat                                 1  elke-soort-passeert-de-poort
4  tabbalk-bovenaan
```

Twaalf bestanden met exact deze vorm is geen ruis maar een bevinding, en
CLAUDE.md is er duidelijk over: *een reparatie die de instanties opruimt en het
mechanisme laat staan, groeit terug*.

⚠️ **Maar de grendel kan niet vóór die twaalf landen.** Hij zou meteen rood
staan, of met twaalf registerrijen waarvan niemand de reden gemeten heeft — en
een register met ongemeten rijen is precies de vorm die dit project elders
afwijst. Elk van die twaalf vraagt zijn eigen mutatie om te weten of hij open
faalt; de vijf hierboven kostten er negen.

Dat is dus een eigen afgebakend issue en geen bijvangst hier — **QS8-574**.
Zelfde reden als *"één afgebakend issue per feature"* in CLAUDE.md, en het is
bewust een issue geworden en geen zin in een dossierrij: dat laatste is de vorm
die bij QS8-527 drie weken bleef staan.

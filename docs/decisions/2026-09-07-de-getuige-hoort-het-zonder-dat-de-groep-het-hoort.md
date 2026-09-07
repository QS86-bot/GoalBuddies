# De getuige hoort het, zonder dat de groep het hoort — QS8-298

**07-09-2026.** Migratie 0174. Deel 2 van QS8-292, dat bewust bij het
leesoppervlak stopte.

## De vijfde meldingsoort gaat over een ander, en dat is nieuw

Tot vandaag waren er vier soorten in `notifications_sent.kind`, en de kop van
`regels.ts` zei er iets bij dat als een grens gelezen hoort te worden:

> Er is geen soort die zegt dat een ander iets gemist heeft, en die mag er ook
> niet komen.

`commitment_witness` is de eerste die wél over een ander gaat: hij vertelt je dat
de inzet van iemand anders verschuldigd is geworden — en dus dat die persoon zijn
streefdatum niet gehaald heeft.

**Dat kan op precies één grond.** Domeinregel 7 noemt zelf één uitzondering:
*"een straf die de gebruiker zelf vooraf heeft ingesteld en bevestigd."*

## Drie dingen dragen die grond, en geen ervan mag weg

1. **De eigenaar heeft deze getuige zélf aangewezen** en het commitment
   bevestigd (`confirmed_at`, domeinregel 5). Er is geen pad waarlangs iemand
   ongevraagd getuige wordt — `bewaak_begunstigde()` (0168) bewaakt dat, ook
   tegen `service_role`.
2. **De melding gaat pas af bij `status = 'due'`.** Dezelfde grens als
   `commitment_zichtbaar_voor_persoon()` en als domeinregel 11. Vóór dat moment
   weet de getuige van niets, en dat blijft zo — anders is de inzet zélf al een
   mededeling.
3. **Er gaat niets naar de groep.** Dit is een pushmelding aan één persoon. Via
   de groepschat zou de hele groep horen wat expliciet naar één iemand ging, en
   dat is precies de verruiming die QS8-228 níét maakte.

⚠️ **Wat dit dus niet is.** Geen precedent voor een melding over een gemiste
week, een verbroken reeks of een achterstand. Daar zit geen vooraf bevestigde
afspraak onder. Wie hier een tweede soort aan wil hangen, wijst eerst aan welke
van deze drie punten hij kan invullen — kan hij dat niet, dan is het antwoord
nee.

## Wat er niet in het bericht staat

De tekst is letterlijk de zin die `meld_commitment()` al in de groepschat zet:
*"De inzet die <naam> zelf heeft ingesteld, is verschuldigd geworden."* Eén
gebeurtenis, één formulering — twee zinnen voor hetzelfde ding is hoe een toon
uit elkaar loopt.

Geen doeltitel, geen bedrag, geen wat-hij-misliep. Dezelfde regel als bij
`approval_request` en bij systeemberichten (beslisdocument 002 §3): een melding
staat op een vergrendeld scherm dat iemand anders kan meelezen, en een melding is
bovendien een kopie die de autorisatie overleeft waaronder hij gemaakt is.

`getuigenissen_voor()` geeft daarom ook niet méér terug dan het commitment-id en
de naam — niet omdat de job de rest niet gebruikt, maar omdat wat een functie
teruggeeft morgen in een bericht kan belanden. Die grens staat onder test in
`tests/rls/getuigemelding.test.ts`.

## De aanname die niet klopte, en waarom dit een migratie is

QS8-292 schreef: *"een notificatietype vraagt alleen een migratie als het een
systeembericht wordt; als het een pushmelding is, niet."* Nagemeten:

```
notifications_sent_kind_bekend ->
  CHECK (kind = ANY (ARRAY['nudge','approval_request',
                           'approval_received','cycle_summary']))
```

`notifications_sent.kind` is een allowlist. Zonder rij in `notifications_sent` is
er geen ontdubbeling, en dan stuurt de uurjob dezelfde melding elke ronde
opnieuw. De CHECK is dus geen formaliteit maar de plek waar de ontdubbeling op
leunt.

⚠️ **En die CHECK was een kopie zonder naad-test.** `Melding` in `regels.ts`
stond er al sinds EPIC 11 naast, de twee liepen niet uit de pas — maar er was
niets dat het gemerkt zou hebben. `tests/rls/meldingsoorten.test.ts` legt ze nu
naast elkaar, allebei uitgelezen en geen van beide overgetypt.

## Twee ijkingen die niet werkten, en wat ze opleverden

⚠️ **De zelfgetuige-grens was niet te ijken.** `and g.owner_id <> p_user_id` uit
`getuigenissen_voor()` halen leverde géén rode test op: `bewaak_begunstigde()`
laat zo'n rij niet ontstaan, dus de eigenaar was simpelweg nergens
`beneficiary_user_id`. De test was groen om een andere reden dan hij zei — regel
18, vraag 3, in zijn zuiverste vorm. De opstelling die de trigger even uitzet en
de rij tóch neerzet, is wat de conjunct wél ijkt. Twee sloten op één belofte, en
nu allebei apart te ijken.

⚠️ **De kolomgrens ook niet, en om een bekende reden.** `create or replace` kan
een returntype niet wijzigen, dus de mutatie werd stil niet toegepast en de test
bleef groen. Met een `drop` ervoor werd hij rood. Dezelfde valkuil als bij
QS8-292 en dezelfde als de drop-uitzondering bij onwrikbare regel 20.

⚠️ **En eentje bij de naad-test:** de eerste poging brak zowel de afleiding als
de beschikbaarheidsvraag, waarop de suite zich netjes oversloeg in plaats van
rood te worden. Een ijking die zijn geval door een eerdere grendel voert, bewaakt
niets van wat hij belooft.

## De keten is pas rond na een deploy

Stap 1 t/m 3 (migratie, regels, job) staan. Stap 4 vraagt Quintens machine:

```
npx supabase functions deploy notificaties
```

**Tot die deploy doet deze feature niets** — precies de bug die QS8-292 beschreef
en die dit issue kwam repareren. Zolang de oude Edge Function draait, stelt
niemand de vraag `getuigenissen_voor()`. Regel 18, vraag 5: elk schakeltje af, de
keten onderbroken.

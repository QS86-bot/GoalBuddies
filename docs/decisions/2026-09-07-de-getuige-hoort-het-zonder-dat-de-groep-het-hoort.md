# De getuige hoort het, zonder dat de groep het hoort — QS8-298

**07-09-2026.** Migratie 0178. Deel 2 van QS8-292, dat bewust bij het
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

1. **De eigenaar heeft deze getuige zélf aangewezen**, en er is geen pad
   waarlangs iemand daar ongevraagd in belandt: `commitments_insert` eist
   `shares_group_with_user(beneficiary_user_id)`, `bewaak_begunstigde()` (0168)
   verbiedt zelfgetuige én het leeghalen van de kolom en bindt ook
   `service_role`, en de kolomgrant laat `authenticated` na de insert alleen
   `body`, `image_url` en `status` bijwerken.

   ⚠️ **Hier stond eerst "en het commitment bevestigd (`confirmed_at`)", en dat
   was een grendel die niet bestaat.** 📏 `confirmed_at` is `not null` zonder
   default — de kolom ís altijd gevuld, dus de conjunct die erop toetste kon
   nooit onwaar zijn en dus ook nooit rood worden. De echte bevestiging leeft in
   de UI. Conjunct eruit, zin eruit. Een opgeschreven grendel die niet bestaat is
   duurder dan geen grendel: de volgende lezer bouwt erop.
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

## Wat de security-review erbij zette

De eerste versie ging niet door de review, en de drie bevindingen zijn alle drie
zelf nagemeten voordat ze verwerkt werden (onwrikbare regel 19).

### Het venster schoof niet op, en zou dat nooit gaan doen

`getuigenissen_voor()` had alleen `limit 50`, met in de migratiekop de zin
*"zelfde vorm als `te_beoordelen_voor()`"*. Dat was onwaar: 0054 heeft een
`not exists (… completion_approvals …)` en dáárdoor schuift zijn venster op.
Zonder die conjunct levert de functie elke ronde dezelfde vijftig oudste rijen,
slaat de job ze allemaal over, en komt nummer 51 nooit aan.

📏 En dat heelt zichzelf niet: geen enkele functie in `public` zet
`status = 'resolved'` — `wikkel_commitments_af()` raakt alleen `set`, en
`commitments_update` heeft `using (status = 'set' …)`. Een straf die eenmaal
verschuldigd is blijft dat, dus het venster zou voor altijd vastzitten.

⚠️ **De duurste regel stond niet in de code maar in de kop.** Een zin die zegt
dat iets "dezelfde vorm heeft als" iets anders, is een bewering die niemand
toetst. Zelfde les als bij 0172, waar een testcommentaar een invariant beweerde
die niet klopte.

### Vijftig meldingen die de ontvanger niet kan weigeren

📏 Gemeten: er is een dagquotum op groepen, toetredingen, AI-jobs en weekdoelen,
maar **niet op `goals`** — `goals_insert` telt niet en geen van de drie triggers
op die tabel telt. `commitments_een_open_per_soort` is per doel, dus één
groepsgenoot kan vijftig doelen aanmaken met elk één straf en de dag erna
vijftig pushmeldingen op andermans vergrendelscherm laten landen.

De ontvanger kan er niets tegen doen: de getuigenrol weigeren kan niet
(`bewaak_begunstigde()` verbiedt het leeghalen en hij heeft geen UPDATE-recht),
er is geen opt-out per meldingsoort, en `reminder_enabled` geldt alleen voor de
nudge. Zijn enige uitweg is álle meldingen uitzetten.

Dat is onwrikbare regel 5 in dezelfde vorm als spam-uitnodigingen. **Vijf per
etmaal per ontvanger**, in de functie en niet in de job — dezelfde plek als waar
0054 zijn grenzen zet. Een legitieme achterstand druppelt eruit, want de
anti-join laat het venster nu opschuiven.

⚠️ **Repareer die twee nooit los van elkaar.** Zonder de anti-join begrenst het
ontbreken van het venster deze aanval per ongeluk op vijftig; met alleen de
anti-join wordt hij onbegrensd.

### De groepsband moet er nog zijn

`te_beoordelen_voor()` toetst lidmaatschap, `getuigenissen_voor()` deed dat niet.
Wie de groep verliet bleef pushmeldingen krijgen over de verstreken deadlines van
iemand die hij achter zich had gelaten.

De grond onder deze melding is *"de eigenaar heeft deze persoon zélf
aangewezen"*, en die aanwijzing kon alleen omdat er een groepsband was. Verdwijnt
die band, dan verdwijnt de grond — dus de toets erbij. Voor een nieuw oppervlak
is beschermd het antwoord tot iemand het tegendeel besluit.

⚠️ **De eerste versie van die toets was strenger dan de invariant en dus fout.**
Hij keek naar `goal_group_links`, omdat 0054 dat doet — maar dáár slaat het op de
voltooiing die de groep beoordeelt. Hier is de invariant
`shares_group_with_user()`, en die eist alleen dat eigenaar en getuige één groep
delen; een doel hóéft aan geen enkele groep te hangen. De testopstelling viel er
meteen over, en dat was terecht: de conjunct sloot een geldige getuigenis uit.
Overgenomen van `shares_group_with_user()` staat er nu ook `<> 'inactive'` en
niet `= 'active'` — een lid met een adempauze is nog steeds een groepsgenoot.

⚠️ **`getuigenissen()` (0169) toetste dit niet**, dus wie vertrok zag zijn
getuigenis nog wél als hij de app opende. Dat was het oppervlak van QS8-292 en
niet van dit issue; het stond als QS8-306. De richting klopte wel: niet duwen is
minder dan niet tonen, dus de kant die hier gekozen is, was de veilige.

⚠️ **Opgelost op 07-09-2026 met migratie 0182 (QS8-306), en niet alleen in de
functie.** Het leesrecht zelf komt uit de policy van 0168 en die keek evenmin
naar lidmaatschap; een reparatie in alleen `getuigenissen()` had het blok
leeggemaakt en de rij open gelaten. Waarom deze kant gekozen is, wat er níet
gebeurt (de aanwijzing wordt opgeschort, niet vernietigd) en waarom er een
`security definer`-helper bij hoort, staat in
`docs/decisions/2026-09-07-de-band-droeg-de-aanwijzing.md`.

## De keten is pas rond na een deploy

Stap 1 t/m 3 (migratie, regels, job) staan. Stap 4 vraagt Quintens machine:

```
npx supabase functions deploy notificaties
```

**Tot die deploy doet deze feature niets** — precies de bug die QS8-292 beschreef
en die dit issue kwam repareren. Zolang de oude Edge Function draait, stelt
niemand de vraag `getuigenissen_voor()`. Regel 18, vraag 5: elk schakeltje af, de
keten onderbroken.

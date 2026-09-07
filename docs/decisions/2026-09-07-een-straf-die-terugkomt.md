# Een straf die terugkomt, en de melding die al verstuurd was

**07-09-2026 — QS8-308, migratie 0177.**

## De toestand

Migratie 0174 (QS8-307) houdt een straf tegen zolang er een open
deadline-verzoek staat, met een grens van een week op dat uitstel. Antwoordt de
groep pas op dag negen, dan is de straf al verschuldigd geworden en schuift de
goedkeuring alleen `target_date` op. Gemeten:

```
A1 rollover        | 1
A2 straf           | due
B1 bob keurt goed  | ok: true, moved: true
B2 straf           | due      <- bleef staan
B3 streefdatum     | +30 dagen
```

Domeinregel 11 zegt: *een straf treedt alleen in werking bij een verstreken
deadline.* Die is dat na de verschuiving niet meer.

## Besluit 1 — terugzetten, en niet de goedkeuring weigeren

De andere kant is overwogen: `beslis_deadline_verzoek()` had kunnen weigeren
zodra de straf al `due` staat, met een melding in de trant van "te laat".

**Afgewezen.** Dat laat de eigenaar betalen voor de traagheid van zijn buddy, en
dat is precies wat 0171 bij de verlooptak niet wilde: *een verzoek dat bij het
indienen geldig was, mag niet stranden doordat een buddy er een week over doet.*
Het akkoord van een buddy is bovendien exact de rem die A7 voorschrijft; wie die
rem haalt, hoort er geen straf aan over te houden dat er een week overheen ging.

⚠️ **Dit is geen uitkoopknop, en dat is de toets die telt.** De eigenaar kan het
niet alleen:

- er moet een ánder actief lid ja zeggen (0175, `geen_beslisser`);
- de gevraagde datum moet nog in de toekomst liggen (0171, `verzoek_verlopen`);
- er mag hooguit één open verzoek per doel staan
  (`deadline_requests_een_open_per_doel`, 0032);
- en een deadline verschuiven kost sowieso geen punten (A43) — de rem is het
  akkoord en niet een minpunt.

Alleen een `penalty` die op `due` staat komt terug. `resolved` en `cancelled`
zijn eindstanden en blijven staan: die terughalen zou geschiedenis herschrijven,
en dat verbiedt domeinregel 6.

## Besluit 2 — geen tweede melding

De getuige heeft een pushmelding gekregen dat de inzet verschuldigd werd. Er
gaat géén bericht achteraan dat het toch niet doorgaat.

**Waarom niet:**

1. **Het beeld in de app corrigeert zichzelf.** `getuigenissen()` toont alleen
   commitments met een status uit `commitment_zichtbaar_voor_persoon()` —
   gemeten: `{due, resolved}`. Zodra de straf terug op `set` staat, verdwijnt hij
   uit het blok van de getuige. Wat er stond klopt niet meer en staat er ook
   niet meer. Daar staat een test op.
2. **Een tweede push is een tweede duw.** Domeinregel 5 zegt dat een
   consequentie nooit stilzwijgend aangaat; hij zegt niet dat elke correctie een
   melding verdient. Een bericht over de tegenslag van een ánder is bovendien
   precies het oppervlak waar domeinregel 7 om terughoudendheid vraagt.
3. **Het zou een migratie op een tweede allowlist vragen.**
   `notifications_sent.kind` kent vier waarden; een vijfde soort is een eigen
   besluit en geen bijvangst van deze reparatie.

⚠️ **De voorwaarde waaronder dit besluit vervalt:** zodra
`commitment_zichtbaar_voor_persoon()` een status erbij krijgt waardoor de
getuige de straf óók op `set` ziet staan. Dan blijft er een verkeerde regel bij
hem staan en is de vraag over de melding opnieuw aan de orde. De test *"en de
getuige ziet hem daarna niet meer staan"* wordt op dat moment rood, en dat is
de bedoeling: hij bewaakt de aanname waarop dit besluit rust.

## De naad in het auditspoor

`noteer_commitment()` (trigger `commitments_audit`) schrijft bij elke
statuswijziging een rij, en zijn `case` viel voor alles wat geen `cancelled` of
`resolved` is terug op `'triggered'`, met de commentaarregel "unlocked en due"
erbij. Een terugzet van `due` naar `set` zou daar dus als **triggered** in het
spoor belanden: het tegenovergestelde van wat er gebeurde, in precies de tabel
die het moet vastleggen.

De trigger was correct voor de overgangen die hij kende, de nieuwe overgang is
correct, en de naad ertussen was een `else` die alles opving. Regel 18 vraag 1.

⚠️ Bij het ijken bleek dat ook meteen de scherpste van de twee grendels:
haal het terugzetblok weg en drie tests worden rood; haal alleen de
`reverted`-tak weg en er wordt er precies één rood — de kolom klopt dan wel en
het spoor liegt. Eén mutatie voor allebei zou dat verschil niet hebben laten
zien.

`reverted` staat sinds deze migratie in `commitment_events_type_valid`. Het
rollback-pad kan die waarde niet terugdraaien zolang er rijen mee staan, en dat
hoort zo: het spoor is append-only.

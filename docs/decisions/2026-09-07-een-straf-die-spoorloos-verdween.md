# Een straf die spoorloos verdween

**07-09-2026.** QS8-331, migratie 0189.

## Wat er stuk was

📏 Gemeten op de lokale stack, als `authenticated` eigenaar en met precies de
kolommen die de client mag schrijven:

```
straf vooraf        1        auditregels vooraf   1
verwijder_doel()    {"ok": true}
straf na            0        auditregels na       0
```

Binnen de bedenktijd van 24 uur kon een eigenaar een doel met een straf
aanmaken, die straf bevestigen, en daarna het doel verwijderen. Achteraf was er
geen enkel spoor dat de straf ooit bestaan had — `commitments_goal_id_fkey` is
`on delete cascade` en `commitment_events_commitment_id_fkey` óók.

Dat botst met twee domeinregels tegelijk. **Domeinregel 5**: een commitment
device moet auditeerbaar zijn, en een spoor dat met één knop meeverdwijnt is dat
niet. **Domeinregel 6**: geschiedenis corrigeer je met een correctie-record en
niet door hem te overschrijven.

## Waarom de bestaande poort te smal was

0058 blokkeert wat `commitment_zichtbaar_voor_groep()` teruggeeft — `unlocked`,
`due`, `resolved`. De redenering daar: die standen heeft de groep gezien, en dan
wis je geschiedenis die niet meer alleen van jou is.

⚠️ **Maar de vraag is niet wie het gezien heeft, maar of het gebeurd is.**
📏 `commitments.confirmed_at` is `NOT NULL`, dus élke rij in die tabel is per
constructie een vastgelegde afspraak, met een auditregel van
`noteer_commitment()` erbij. Een straf op `set` is bevestigd; dat niemand anders
hem kan lezen maakt hem niet ongebeurd.

De poort gaat daarom van *"een stand die de groep ziet"* naar *"er hangt een
commitment aan dit doel"*.

## De drie richtingen

| Richting | Oordeel |
|---|---|
| **1.** `commitment_events` niet mee laten cascaderen | ⚠️ Levert een spoor op dat **niemand kan lezen**: de enige weg terug van een auditregel naar zijn onderwerp is `commitment_id`, en `commitment_events_select` hangt aan de straf. Met een nullable kolom en een verwijderde straf staat er een rij zonder context. De letter van domeinregel 6 gehaald, de bedoeling niet. |
| **2.** Weigeren zolang er een commitment aan het doel hangt | ✅ **Gebouwd.** Zelfde vorm als de bestaande weigeringen, en de uitweg bestaat al. |
| **3.** Archiveren in plaats van verwijderen | Niet nodig — dat ís al de regel. `verwijder_doel()` is de uitzondering: hij bestaat sinds 0046 voor een doel dat je per ongeluk aanmaakte, en alleen binnen de bedenktijd. |

⚠️ **Richting 2 past in een patroon dat er al staat.** `verwijder_doel()` weigert
al bij een groepskoppeling, weekdoelen en geboekte punten, en de meldingen bij de
laatste twee zeggen letterlijk *"Archiveer het in plaats van het te verwijderen."*
Dit is het derde geval in dezelfde vorm, met dezelfde uitweg.

## De prijs, en die is echt

Wie binnen de bedenktijd een straf aan een doel hangt, kan dat doel daarna niet
meer verwijderen — **ook niet na het intrekken van die straf.** Een ingetrokken
straf is `cancelled` en blijft als rij staan.

Dat is met opzet en het is de kern van de keuze: juist de intrekking is het spoor
dat domeinregel 5 wil bewaren. Zou `cancelled` niet meetellen, dan is
intrekken-dan-verwijderen precies de omweg die deze migratie sluit. De uitweg is
archiveren, en die is omkeerbaar.

⚠️ **Ook een beloning telt mee.** `noteer_commitment()` schrijft voor beide
soorten een auditregel, dus de geschiedenis die domeinregel 6 bedoelt is er ook
bij een `reward`. Een smallere poort op alleen `penalty` zou een tweede
onderscheid introduceren dat de tabel zelf niet maakt.

## De ijking

Drie mutaties, elk op een verse stack en elk vooraf met een `grep` op het bestand
en een `pg_get_functiondef`-controle op de database bevestigd. Het bereik is
`straf-houdt-zijn-spoor.test.ts` **plus** `epic9.test.ts` — samen 25 tests:

| Mutatie | Wat er rood werd |
|---|---|
| de nieuwe poort helemaal weg | 4 — de 3 belofte-tests **plus** `epic9 › laat een doel met een afgegaan commitment niet meer weggooien` |
| de poort altijd waar (`if true`) | 1 — **precies de must-allow** |
| de `commitment_in_werking`-tak weg | 1 — **precies de epic9-test** |

⚠️ De derde is de belangrijkste: hij bewijst dat de specifieke melding van 0058
nog steeds onder test staat en niet is opgeslokt door de bredere poort erboven.

⚠️⚠️ **Hier stonden drie andere mutaties, en één ervan bewees niets** — gevonden
door de security-reviewer en daarna zelf nagemeten. Twee dingen waren mis. De
tabel zei "3 rood" waar er 4 zijn: de `epic9`-test valt binnen het bereik van
deze wijziging en telt mee, en de commit-boodschap zei dat wél goed. En de rij
"terug naar de smalle poort van 0058" was **niet te onderscheiden** van de rij
erboven: de `commitment_in_werking`-tak staat al bóven de nieuwe poort, dus die
mutatie levert dezelfde functie op als hem weghalen — hij voert zijn geval door
een pad dat een eerdere grendel al afvangt, precies de val die CLAUDE.md bij
regel 18 beschrijft. De vervanger is de mutatie die het verschil wél maakt.

⚠️ **Elke ijking draait op een opnieuw opgebouwde stack.** Dat is geen
voorzichtigheid maar een les van dezelfde dag: bij QS8-326 gaf een ronde een
groene uitslag die niets betekende, doordat een bewerking van het testbestand
halverwege afbrak en niets wegschreef terwijl de toelichting wél bleef staan.

## Wat hier niet in zit

* **QS8-333** — een getuige die zijn account verwijdert, laat een verschuldigde
  straf stuurloos achter. Dat is het tweede geval waarin een verwijdering een
  straf raakt, en het is een andere weging: daar verdwijnt de *getuige* en niet
  het *spoor*.
* **QS8-335 — de eigenaar die zijn eigen account verwijdert.** Gevonden door de
  security-reviewer op deze branch en daarna zelf nagemeten:
  `verwijder_mijn_account()` eindigt op `delete from auth.users`, en daarachter
  cascadeert `profiles → goals → commitments → commitment_events` — vier keer
  `confdeltype = 'c'`, gemeten in `pg_constraint`. De functie noemt `commitment`
  nul keer, dus er is geen poort, geen bedenktijd en geen statustoets. 📏 Op de
  verse stack: 1 straf en 1 auditregel vooraf, `{"ok": true}`, 0 en 0 erna.

  ⚠️⚠️ **Dit is de reden dat de kop van het testbestand versmald is.** Die zei
  "een bevestigde straf verdwijnt niet zonder spoor", en alle vier de tests
  bleven groen terwijl díé zin via deze route breekt — regel 18 vraag 3, en
  precies de fout waar dit project zeven keer aan betaald heeft. De reparatie
  hier is niet de route dichtzetten (dat is QS8-335 en het vraagt een besluit
  over het wisrecht) maar de belofte niet groter laten zijn dan wat ze
  waarmaakt.
* **QS8-321 en QS8-322** — of een straf überhaupt intrekbaar hoort te zijn, en of
  te laat afronden hem hoort te laten vervallen. Allebei grens 1, en allebei
  gelabeld `wacht-op-Quinten`. Deze migratie verandert daar niets aan: ze zorgt
  er alleen voor dat wat er gebeurt, opgeschreven blijft.

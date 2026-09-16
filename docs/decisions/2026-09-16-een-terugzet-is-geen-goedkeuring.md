# Een terugzet is geen goedkeuring

**16-09-2026** — sluit de reviewrij van 15-09-2026 over `pg_restore --data-only`
op `completion_approvals`.

## Wat er aan de hand was

`0275` liet de trigger op goedkeuringen ook toetsen of de voltooiing nog de
actieve is. Dat is voor levend verkeer precies goed. Maar bij een groep met
`approval_rule = 'quorum'` is een goedkeuring op een inmiddels vervángen
voltooiing niet zeldzaam — het is de gewone gang van zaken:

1. Bob keurt goed → de week blijft `pending` (1 van 2)
2. Alice dient opnieuw in → de eerste voltooiing wordt vervangen
3. die eerste draagt nu een volkomen legitieme goedkeuring

`dien_opnieuw_in()` ruimt die goedkeuring niet op, en dat hóórt ook niet:
voltooiingen en goedkeuringen zijn append-only (domeinregel 6).

📏 **Nagemeten op 16-09-2026, end to end**, in een teruggedraaide transactie: die
rij is daarna niet meer terug te schrijven.

```
ERROR:  Deze voltooiing is vervangen door een nieuwere en is niet meer goed te keuren
CONTEXT:  PL/pgSQL function fill_approval_subject() line 71 at RAISE
```

Een vólledige `pg_restore` gaat goed — triggers zitten in de post-data-sectie,
dus de rijen staan er al vóór de trigger bestaat. Het gaat alleen mis bij een
`--data-only` terugzet van juist deze tabel, en dat is precies wat je doet om één
migratie ongedaan te maken.

## Het besluit: de trigger blijft zoals hij is

**De trigger heeft gelijk.** Wie hem verzacht om een terugzet te laten slagen,
verzwakt een autorisatiegrens (domeinregel 3) voor een operationeel gemak. Wat
ontbrak was niet een uitzondering maar dat iemand het wíst.

De remedie is Postgres' eigen mechanisme, en die is gemeten:

```bash
pg_restore --data-only --disable-triggers -t completion_approvals ...
```

📏 Allebei de vormen werken — `--disable-triggers` en handmatig
`set session_replication_role = replica`.

## ⚠️ De prijs van die remedie, en waarom domeinregel 3 twee sloten heeft

Met de triggers uit valt domeinregel 3 in tweeën uiteen. 📏 Gemeten:

| grens | waar hij zit | overleeft een terugzet met triggers uit |
|---|---|---|
| je keurt nooit jezelf goed | CHECK `completion_approvals_not_self` | **ja** |
| alleen een lid van dezelfde groep keurt goed | trigger `fill_approval_subject()` | **nee** |

Onder `session_replication_role = replica` weigert een zelfgoedkeuring nog
steeds, en komt een **wildvreemde** als goedkeurder er wél doorheen.

Dat is geen defect maar de eigenschap die `CLAUDE.md` bij domeinregel 3 vraagt:
*afgedwongen in RLS **én** met een database-constraint, niet alleen in de UI*.
Een CHECK wordt getoetst tegen de rij, wie hem ook schrijft — `security definer`,
`service_role`, `COPY` en `pg_restore` komen er geen van allen langs. Precies
daarom staat de helft die het zwaarst weegt in een CHECK en niet alleen in een
trigger.

**Gevolg voor de handleiding:** je zet alleen je eigen dump terug, nooit data van
buiten. Dat staat nu in `docs/DEPLOY.md` §2.9a.

## Wat dit niet is

- **Geen wijziging aan 0275 of aan de trigger.** Er is geen migratie bij.
- **Geen uitzondering voor `service_role` of voor een hersteltak in de trigger.**
  Dat zou de grens verplaatsen naar wie de hersteltak aanroept, en dat is precies
  het soort verruiming dat een standaard laat verschuiven zonder besluit.
- **Geen aanbeveling om `--disable-triggers` standaard te gebruiken.** Hij hoort
  bij één tabel en bij één handeling, en de tabel hierboven zegt wat je ermee
  opgeeft.

## Hoe het vastligt

`tests/rls/goedkeuring-terugzetten.test.ts`, vier tests, elk in een
`begin … rollback`: de weigering zelf, de remedie, de CHECK die standhoudt, en de
lidmaatschapsgrens die wegvalt.

📏 Alle vier apart geijkt, en de drie mutaties treffen elk wat ze moeten treffen:

| mutatie | wat er rood wordt |
|---|---|
| clausule 4 uitgeschakeld (`and false and …`) | **alleen** de weigeringstest |
| de CHECK gedropt | **alleen** de zelfgoedkeurtest |
| de trigger op `always` | de drie replica-tests — de remedie werkt dan niet meer |

⚠️ De eerste mutatie moest de tekst `superseded_by is not null` láten staan: de
gate van dat bestand proeft dáárop om te zien of 0275 wel toegepast is. Hem
weghalen had de gate laten werpen in plaats van de test rood gemaakt — dezelfde
val als bij de ijking van `domeinregel3_bewaking()` eerder die dag.

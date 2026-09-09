# Een test die maar één kant op kijkt

**Datum:** 09-09-2026 · **Issue:** QS8-369 · **Migratie:** 0214

## De vraag die niemand stelde

`tests/rls/remdekking.test.ts` bestaat sinds 08-09 en doet precies wat hij
belooft: hij wordt rood zodra een `*_dagplafond`-trigger geen `*_rem` voor zich
heeft. Hij is met zes mutaties geijkt, hij heeft een zelftoets tegen gratis
groen, en hij heeft die middag nog een echte fout gevonden.

En hij kon `push_tokens` niet zien.

📏 Gemeten op de lokale stack: veertien tabellen droegen een `*_dagplafond`,
en `push_tokens` had **geen enkele niet-interne trigger**. Elke test was groen.

Het verschil zit in de vorm van de vraag:

| vraag | te beantwoorden met | wat je ervoor nodig hebt |
|---|---|---|
| heeft elk plafond een rem? | wat er ís | de veertien tellers aflopen |
| mist er een plafond? | wat er **niet** is | weten waar er een had moeten staan |

De eerste vraag stelt zichzelf: je hebt een lijst, je loopt hem af. De tweede
niet — daarvoor moet je eerst een verzameling opbouwen die nergens bestaat, en
precies dat is de reden dat niemand hem stelde. Onwrikbare regel 18 vraag 5 in
zijn zuiverste vorm: **de keten is onderbroken terwijl elk schakeltje af is.**

## De verzameling die nergens bestond

`tests/rls/plafonddekking.test.ts` bouwt hem nu op, in de database en niet uit
de migratiebestanden. Twee routes waarlangs een client een tabel kan laten
groeien:

1. **Rechtstreeks** — `authenticated` heeft INSERT op de tabel of op een kolom.
2. **Via een RPC** — een `security definer`-functie die `authenticated` mag
   uitvoeren en die in de tabel schrijft.

⚠️⚠️ **De eerste route is bijna verkeerd gemeten, en dat is de les die het
verst draagt.** De eerste versie vroeg `has_table_privilege('authenticated', …,
'INSERT')` — de voor de hand liggende functie — en die gaf **nul** tabellen.

Dat is geen bug in Postgres maar de vorm van dit project: 0046 doet

```sql
revoke insert on public.goals from authenticated;
grant  insert (owner_id, title, description, …) on public.goals to authenticated;
```

en er zijn er meer. Het recht op tabelniveau is er niet; het recht per kolom
wel. `has_table_privilege` is dan `false` en `has_any_column_privilege` is
`true`.

📏 Nagemeten: **twintig** tabellen hebben een kolomgrant en **nul** een
tabelgrant. Twaalf daarvan hebben geen enkele andere route. Een register dat op
de eerste meting gebouwd was, had er twaalf te weinig in gehad — en had
groen gestaan, want een lege verzameling levert een lege lijst met gaten op.

⚠️ Dit is dezelfde klasse als de fout die het register moet vangen: **een
meting die nul teruggeeft, ziet eruit als een geruststelling.** Vandaar dat de
zelftoets in dat bestand een exact getal is (29 groeibaar, 15 met plafond) en
geen ondergrens. Bij `> 10` hadden er negentien kunnen wegvallen.

## Het register is geen ontsnapping

Veertien tabellen zijn groeibaar zonder plafond, en dat mag — als er een
**gemeten** reden is dat een client ze niet kan laten groeien. Twaalf hebben er
een: een sleutel die het aantal rijen bindt (`UNIQUE (approval_id)`,
`PRIMARY KEY (group_id)`), of een grens in de RPC zelf (`meldingen_over()`,
`create_group()` op tien per etmaal).

Twee hebben er géén, en die dragen daarom een issuenummer in plaats van een
zin:

- **`breathers`** (QS8-373) — `plan_adempauze()` begrenst de lengte van een
  pauze en de overlap, maar niet hoe ver vooruit hij mag beginnen. 📏 200
  niet-overlappende pauzes op één doel gingen er alle 200 in.
- **`group_events`** (QS8-374) — elke schrijver heeft een `unchanged`-toets,
  maar heen en weer zetten verandert elke keer wél iets. 📏 200 keer
  `zet_groepsontdekbaarheid()` heen en weer gaf 200 rijen.

⚠️ **Dat onderscheid moet leesbaar blijven in het register zelf.** Een reden
zonder getal en zonder issuenummer is een aanname die als besluit leest, en
daar is een aparte test voor — dezelfde eis die `review:controle` aan een
Laag-rij stelt met `**Wordt zwaarder als:** …`. En het register wordt ook de
ándere kant op getoetst: een regel voor een tabel die inmiddels een plafond
heeft, of die niet meer te laten groeien is, wordt rood. Zonder die helft
groeit het stil dicht.

## En toen bracht de reparatie zelf een gat binnen

De nette weigering in `registreer_push_token()` luidde eerst:

```sql
if not exists (select 1 from push_tokens where token = trim(p_token))
   and (mijn tokens in het laatste etmaal) >= pushtokens_plafond() then
  return jsonb_build_object('ok', false, 'reason', 'te_veel_tokens');
end if;
```

De gedachte: een token die al bestaat, maakt geen rij bij, dus die mag het
plafond niet raken. Dat klopt voor je **eigen** token. Het klopt niet voor die
van een ander: de `on conflict (token) do update` eronder schrijft `user_id =
excluded.user_id`, dus die rij **verhuist naar jou** en telt wél mee.

📏 Gemeten, met een aanvaller op zijn eigen plafond van 20:

```
bestaat niet -> {"ok": false, "reason": "te_veel_tokens"}
bestaat wel  -> ERROR 23514: Te veel pushtokens in één dag
                (0 erbij, 21 in het laatste etmaal, plafond 20)
```

Twee dingen tegelijk mis. De ruwe 23514 is terug in precies het geval waarvoor
die tak bestaat — `0 erbij` bewijst dat de transitietabel leeg was en de
telling tóch op 21 stond, dus de rij wás verhuisd. En het verschil tussen die
twee antwoorden leest van een willekeurige tokenstring af óf hij bestaat.

⚠️ Dat is een **bestaansorakel**, en het is er een die vandaag niet bestaat:
zonder plafond geeft élke aanroep `ok: true`. De reparatie bracht hem binnen.
Dezelfde vorm die `blokkeer()` en `vraag_lidmaatschap_aan()` met zoveel woorden
dichtzetten — "één antwoord voor bestaat niet en bestaat wel, anders is deze
functie een aftastinstrument".

De reparatie is één conjunct:

```sql
if not exists (select 1 from push_tokens
                where token = trim(p_token) and user_id = v_uid)
```

Daarmee zegt de voorwaarde wat ze bedoelt — *is deze rij al van mij?* — en
geven alle drie de gevallen het goede antwoord:

| geval | telling | antwoord |
|---|---|---|
| eigen token opnieuw, op het plafond | verandert niet | `ok: true` |
| nieuw token, op het plafond | +1 | `te_veel_tokens` |
| andermans token, op het plafond | +1 (verhuist) | `te_veel_tokens` |

## Wat hiervan blijft

1. **Een test die één richting bewaakt, noemt in zijn kop welke.** Anders leest
   hij als dekking van het onderwerp, en dat is hij niet.
2. **Vraag bij een grendel op een verzameling ook: wie bepaalt de verzameling?**
   `remdekking` nam de tellers als gegeven. De verzameling zelf was het gat.
3. **Een meting die nul teruggeeft, is verdacht tot je hem gevoed hebt.**
   `has_table_privilege` gaf nul en dat leek een schoon huis.
4. **Meet wat je reparatie erbij zet, niet alleen wat ze dichtzet.** Het orakel
   is niet gevonden door de code te lezen — de redenering erachter klopte
   grammaticaal — maar door de twee gevallen naast elkaar te draaien.

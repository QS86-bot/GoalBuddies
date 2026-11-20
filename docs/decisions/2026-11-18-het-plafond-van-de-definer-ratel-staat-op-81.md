# Het plafond van de definer-ratel staat op 81, en de vijf erbij zijn de buddywachtrij

**Datum:** 18-11-2026
**Issue:** QS8-181 (vervolg op de reactie van de orchestrator op QS8-686)
**Status:** gebouwd; `adviseur:controle` zelf is niet gedraaid (vraagt een token)
**Raakt:** `scripts/adviseur-controle.mjs`, `tests/scripts/adviseur-controle.test.ts`

## 1. Wat er aan de hand was

`npm run adviseur:controle` was rood, door Quinten lokaal gedraaid:

- `authenticated_security_definer_function_executable`: plafond 76, de adviseur
  meldt er **81**.
- `auth_leaked_password_protection`: de allowlist-rij wees niets meer aan, en een
  rij die niets aanwijst is per ontwerp rood.
- `anon_security_definer_function_executable` = 1 (`invite_preview`): bekend en
  ongewijzigd.

## 2. Welke vijf zijn erbij gekomen — gemeten, en de aanname klopte niet

De orchestrator nam aan dat het ging om 0272 (`zoek_mensen`, `vindbaar_voor_mij`)
en 0296 (`handel_melding_af`, `openstaande_meldingen`, `is_platform_beheerder`).

**Dat is niet gemeten, en de datums pleiten ertegen.** 0272 is van 14-09-2026 en
stond op productie vóór 24-09 (productie was op 17-09 gelijk aan de map). Voor
0296 is dat niet vast te stellen: 22-09 is de datum van het besluit in zijn kop,
`docs/WERKVOORRAAD.md` boekt QS8-586 (0296 t/m 0298) onder 24-09, en de
git-geschiedenis is platgeslagen. Of zijn drie functies in de 76 zaten, is dus
een aanname.

📏 Wat wél gemeten is: de 81 uit `get_advisors` (productie, alleen lezen, 18-11
20:15 UTC) naast de `grant`-regels van de buddywachtrij van QS8-233. Productie
staat op **0302**, `origin/main` stond op 18-11 op **0298**; de wachtrij stond op
productie en nog niet op `main`. ⚠️ **Bijgewerkt 20-11-2026 (batch INT, op last van de
security-review):** `origin/main` bevat inmiddels 0299 t/m 0314, en de wachtrij zit erin
als 0299, 0301, 0302 en 0306; de hernummering van QS8-641 is dus niet meer aan de orde.
De vijf functies zijn daarmee in de code te vinden. Die wachtrij geeft `authenticated`
precies **vijf** lintregels, allemaal in de lijst van 81.

⚠️ **Wat dit niet bewijst.** De lijst van 24-09 zelf is er niet meer, dus "76
exact deze 76" is afgeleid uit het getal en niet vergeleken per naam. Wat wél
vaststaat: de vijf onderstaande zijn nieuw ten opzichte van elk moment vóór 0299,
en ze verklaren het verschil precies.

## 3. Per functie: is de grant bedoeld

Alle vijf: `security definer`, `set search_path = public, pg_temp`, en een
`revoke all ... from public, anon, authenticated` gevolgd door een expliciete
`grant execute ... to authenticated` in de migratie. Het recht is dus besloten en
niet geërfd, wat `tests/rls/functiegrants.test.ts` vraagt.

| functie | migratie | toets op `auth.uid()` | wat de aanroeper ziet of kan | groepsgrens, domeinregel 7 | oordeel |
| --- | --- | --- | --- | --- | --- |
| `buddyzoekopdrachten_over()` | wachtrij, eerste migratie | `null` geeft 0 (faalt dicht) | alleen het eigen aantal vrije aanvragen vandaag, een getal | niets groepszichtbaars | bedoeld |
| `zoek_buddies_aan(uuid, boolean)` | 0299, herzien in 0301, 0302 en 0306 | `null` geeft een uitzondering | alleen een eigen doel (`owner_id = auth.uid()`), schrijft één eigen wachtrijrij; "bestaat niet" en "is niet van jou" geven één antwoord | niets groepszichtbaars; de plafonds (3 wachtend, 10 groepen, 5 per dag) staan onder een advisory-lock per gebruiker | bedoeld |
| `zoek_buddies_uit(uuid)` | 0299 | `null` geeft een uitzondering | alleen de eigen rij van het eigen doel, `for update`; een al gekoppelde rij wordt niet geraakt (`already_matched`) | niets groepszichtbaars | bedoeld |
| `buddyzoek_stand(uuid)` | 0301, herzien in 0306 | via `eigenaarsdatum(auth.uid())` en `g.owner_id = auth.uid()` | status, "nog nodig" (afgekapt op 0 tot 2), tijdstempels en `group_id` van het eigen verzoek | geen identiteit van wachtende anderen, alleen een afgekapt getal | bedoeld |
| `buddyzoek_stand(uuid, date)` | 0301 (wrapper) | idem, via de eenargumentige versie | idem; `p_vandaag` wordt weggegooid, dus de client kan de bandberekening niet meer sturen | idem | bedoeld; wrapper mag weg zodra de client de eenargumentige versie aanroept |

Eén ding is hier **grens 1** van de Beslisbevoegdheid en dat staat al onder
`p_bevestigd` in `zoek_buddies_aan()`: in de rij stappen koppelt je doel later aan
een groep, en dat zet de beoordeelbaarheidsgrendel om. De functie weigert zonder
bevestiging (`not_confirmed`). Dit besluit verandert daar niets aan.

⚠️ **Wat ik niet heb gemeten.** Ik heb de functielichamen van 0299, 0301 en 0302
gelezen en niet tegen een draaiende database uitgevoerd; `tests/rls/` is niet
tegen productie gedraaid (opdracht). Dat de RLS-toetsen van QS8-233 deze grenzen
bewaken staat in hun eigen aflevering, niet hier.

Geen enkele functie gaf aanleiding om te stoppen: geen grant zonder besluit, geen
groepszichtbaar lek, geen kolom die RLS niet kan beperken.

## 4. Wat er veranderd is

1. `hoogstens: 76` wordt **81**, met een reden die de datum, de gemeten stand en
   de vijf namen noemt, en die de foute aanname van de orchestrator benoemt.
2. De rij `auth_leaked_password_protection` is **weg**. De adviseur meldt hem niet
   meer (gemeten in dezelfde `get_advisors` van 18-11). Komt hij terug, dan is hij
   nieuw en wordt hij rood; daar staat nu een toets op.
3. Het blijft een ratel: 82 is rood en 80 is rood (te ruim). De ijking staat in
   `tests/scripts/adviseur-controle.test.ts`.

⚠️ **"Niet meer gemeld" is niet "gerepareerd"** (QS8-411). Op 17-11 is besloten dat Quinten
beide wachtwoordschakelaars in het dashboard zet (QS8-234/216); of dat gedaan is,
is niet gemeten. Het past wel bij het verdwijnen. Maar de adviseur kan ook zwijgen om een andere reden, bijvoorbeeld
het abonnement. Dat is een aanname en geen meting; `npm run wachtwoord:controle`
met een token is de plek waar de schakelaar zelf gelezen wordt. De rij weghalen
schrijft QS8-141 daarom niet weg: dat issue blijft de plek voor die meting.

## 5. De meting van de ijking

Plafond met de hand teruggezet, en gekeken welke toets omvalt:

| plafond | wat omviel |
| --- | --- |
| 76 | negen toetsen, waaronder de stand van 18-11, en "82e definer-functie" |
| 82 | vier: de stand van 18-11 (het plafond staat dan te ruim), "82e definer-functie" (de ratel laat 82 door), de daling naar 80 en "een uitzondering die niets meer aanwijst" (die ziet naast de rij ook het te ruime plafond) |

Op 76 vallen er negen om omdat 81 meldingen dan allemaal onverwacht zijn. Op 82
is het smaller, en dáár zie je de bedoelde grendels: de bovengrens (82e), de
ondergrens (80) en de stand zelf.

## 6. Wat dit omkeert, en wat nog openstaat

- De toetsfixture van 24-09 hield `auth_leaked_password_protection` er met opzet
  in (`docs/decisions/2026-09-24-de-allowlist-bewoog-niet-mee.md`). Dat is hier
  teruggedraaid: de fixture was groen terwijl de echte controle rood stond.
- ⚠️ **Mogelijk is leaked-password protection alleen op een betaald
  Supabase-abonnement beschikbaar** (uit het geheugen van de reviewer, niet
  geverifieerd). Dan zwijgt de adviseur omdat de functie er niet is, en is "de
  schakelaar staat aan" de minst waarschijnlijke verklaring. Eén keer in het
  dashboard kijken beslist dit; de uitkomst hoort op QS8-141.
- Twee passages in andere documenten zijn nu achterhaald en worden door de
  batchsessie bijgewerkt (ER-rij in de afleverregel): `docs/ENGINEER-REVIEW.md`
  zegt dat de leaked-password-rij op de allowlist staat, `docs/VOLGENDE-SESSIE.md`
  zegt dat de schakelaar uit staat.

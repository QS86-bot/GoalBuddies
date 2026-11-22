# Het plafond van de definer-ratel staat op 105, en elke functie erbij staat bij naam

**Datum:** 22-11-2026
**Issue:** QS8-181 (restwerk, opdracht van de orchestrator van week 48, logboek QS8-785)
**Status:** gebouwd; `adviseur:controle` zelf is niet gedraaid (vraagt een token)
**Raakt:** `scripts/adviseur-controle.mjs`, `tests/scripts/adviseur-controle.test.ts`
**Vorige stand:** `docs/decisions/2026-11-18-het-plafond-van-de-definer-ratel-staat-op-81.md`

## 1. De meting

📏 `get_advisors` (security) op productie `wehgocadxehottiiyvsc`, alleen lezen,
22-11-2026 18:40 UTC. Productie staat op **0337**
(`supabase_migrations.schema_migrations`), `origin/main` op `b636a3bd`.

| regel | aantal | allowlist |
| --- | --- | --- |
| `authenticated_security_definer_function_executable` | **105** | `hoogstens` was 81 |
| `anon_security_definer_function_executable` | 1 (`invite_preview`) | `hoogstens: 1`, ongewijzigd |
| `security_definer_view` | 3 (`mijn_profiel`, `group_visible_streaks`, `mijn_doelvelden`) | drie sleutels, ongewijzigd |
| `rls_enabled_no_policy` | 3 (`dagtellers`, `invite_events`, `invite_preview_limits`) | drie sleutels, ongewijzigd |

Er is niets anders gemeld. De enige afwijking van de allowlist is dus het aantal
definer-functies: 105 waar het plafond op 81 stond.

## 2. Welke 24 erbij kwamen — per naam, en hoe dat bepaald is

Voor elk van de 105 handtekeningen is de **eerste** migratie gezocht die de
functie aanmaakt (`create [or replace] function public.<naam>(`). 81 ervan
komen uit 0298 of eerder plus de vijf van de buddywachtrij (0299); **24** komen
uit 0309 t/m 0336. 105 − 24 = 81, precies de stand van 18-11.

⚠️ **Wat dit niet bewijst.** De lijst van 18-11 is niet per naam bewaard, net zo
min als die van 24-09. Dat precies deze 24 het verschil zijn is afgeleid uit de
migratiegeschiedenis en het getal, niet vergeleken met een eerdere lijst. Om
dat de volgende keer wél te kunnen, staat de volledige lijst van 105 in §6.

Op productie is voor alle 24 gemeten (`pg_proc`, `has_function_privilege`):
`prosecdef`, `set search_path` aanwezig (`public, pg_temp`; bij `maak_teamgroep`
`public, pg_catalog, pg_temp`), `authenticated` mag uitvoeren, `anon` niet.

## 3. Per functie

Bron: `pg_get_functiondef()` op productie, 22-11-2026. "Grant" is de migratie
die na een `revoke ... from public, anon, authenticated` met zoveel woorden
`grant execute ... to authenticated` geeft.

| functie | grant | toets | wat de aanroeper ziet of kan | domeinregel 7 | oordeel |
| --- | --- | --- | --- | --- | --- |
| `deel_prestatie(p_group_id uuid, p_badge text)` | 0309 | `auth.uid()`, eigen badge, `is_group_member()`, teamtoets | plaatst één systeembericht over de eigen prestatie | alleen een positief signaal, op eigen handeling, zonder titel of niveau | bedoeld |
| `weekbelofte_begunstigde_bekend(p_groep uuid, p_getuige uuid)` | 0314 | eigen actief lidmaatschap van `p_groep`; getuige moet een groep met de aanroeper delen | één boolean | zegt alleen of de aanroeper die groep of getuige mag kiezen; geen stand van een ander | bedoeld |
| `is_organisatielid(p_organization_id uuid)` | 0316 | `auth.uid()` | één boolean over de aanroeper zelf | niets over een ander | bedoeld |
| `maak_organisatie(p_naam text)` | 0316, herhaald in 0337 | `auth.uid()`, toelating via `organisatie_aanmakers` (0337), dagteller | maakt een organisatie met zichzelf als beheerder | niets groepszichtbaars | bedoeld |
| `organisatie_uitnodigcode(p_organization_id uuid)` | 0316 | `is_organisatiebeheerder()` | de code van de eigen organisatie | niets over een lid | bedoeld |
| `organisatieleden(p_organization_id uuid, p_limit integer, p_na_user_id uuid)` | 0316 | `is_organisatielid()`, gepagineerd, hoogstens 50 | naam en rol van actieve leden | geen voortgang, geen doelen | bedoeld |
| `verlaat_organisatie(p_organization_id uuid)` | 0316 | eigen actief lidmaatschap vóór de lock | zet het eigen lidmaatschap op inactief | niets over een ander | bedoeld |
| `vernieuw_organisatiecode(p_organization_id uuid, p_intrekken boolean)` | 0316 | `auth.uid()`, `is_organisatiebeheerder()`, dagteller | nieuwe of ingetrokken code | niets over een lid | bedoeld |
| `word_organisatielid(p_code text)` | 0316 | `auth.uid()`, dagteller, één antwoord voor onbekend/ingetrokken | wordt zelf lid | niets over een ander | bedoeld |
| `zet_organisatielid_uit(p_organization_id uuid, p_user_id uuid)` | 0316 | `is_organisatiebeheerder()`, niet zichzelf, alleen een `member` | zet een lid uit en roteert de code | geen bericht, niets groepszichtbaars | bedoeld |
| `maak_teamgroep(p_organization_id uuid, p_naam text, p_huddledag smallint, p_tz text, p_zichtbaarheid text)` | 0317 | `is_organisatiebeheerder()`, daglimiet | maakt een teamgroep, standaard beschermd | niets over een lid | bedoeld |
| `benoem_organisatiebeheerder(p_organization_id uuid, p_user_id uuid)` | 0318 | `is_organisatiebeheerder()` vóór en na de lock, dagteller | rol van een actief lid naar beheerder | spoor in `organization_role_events`, geen bericht | bedoeld |
| `treed_terug_als_organisatiebeheerder(p_organization_id uuid)` | 0318 | `is_organisatiebeheerder()`, niet de laatste | eigen rol naar lid | idem | bedoeld |
| `maak_teamdoel(p_group_id uuid, p_titel text, p_streefdatum date, p_beschrijving text)` | 0319 | `is_group_member()` van een teamgroep, één antwoord voor geen-lid en geen-team | maakt een teamdoel | niets over een ander | bedoeld |
| `neem_aandeel(p_team_goal_id uuid, p_titel text)` | 0319 | `is_group_member()`, eigen lidmaatschap `for share` | maakt een eigen doel als aandeel | het aandeel blijft van de eigenaar (0321) | bedoeld |
| `teambalk(p_team_goal_id uuid)` | 0320 | `mag_groep_lezen()`; anders `null` | één getal: gedane stappen van het team | ⚠️ **niet schoon:** in een team van twee trekt een lid zijn eigen stappen af en leest hij de voortgang, en dus ook de stilstand, van de ander (security-review M1). Door Quinten op 18-11 geaccepteerd als "alleen goed nieuws"; de voorwaarde die het Laag hield is met 0321 uitgekomen, en `docs/ENGINEER-REVIEW.md` voert het sindsdien als **Middel** (rij "`teambalk()` in een team van twee") | bewust geaccepteerd, niet "niets over een ander"; voorgelegd aan de orchestrator, zie §4a |
| `aandeel_wacht_op_teamgenoot(g uuid)` | 0321 | aanroeper én eigenaar actief lid van de teamgroep, niet het eigen doel | boolean: wacht dit aandeel op een goedkeuring | `pending` is een positief signaal; het goedkeurvenster van besluit 5 | bedoeld |
| `is_aandeel_van_een_ander(g uuid)` | 0321 | `auth.uid()` alleen om zichzelf uit te sluiten; **geen lidmaatschapstoets** | boolean: is dit doel een aandeel van iemand anders | geen stand, geen voortgang; `true` sluit juist af | bedoeld, zie §4 |
| `organisatieteams(p_organization_id uuid, p_limit integer, p_na_id uuid)` | 0324 | `is_organisatielid()`, gepagineerd | id en naam van niet-gearchiveerde teams | niets over een lid | bedoeld |
| `straf_teamband_klopt_voor_mij(p_goal_id uuid)` | 0325 | lidmaatschap via `straf_teamband_klopt(p_goal_id, auth.uid())`; de tweeargumentige variant heeft bewust géén grant | boolean | geen stand of tekst van een straf; zie §4 | bedoeld, zie §4 |
| `keur_teamdoel_goed(p_team_goal_id uuid)` | 0326 | `is_group_member()`, nooit de eigen aanvraag (ook CHECK en trigger) | rondt het teamdoel af, boekt de teambonus | bericht zonder persoon of titel; bonus alleen in `points_ledger` van de eigenaar | bedoeld |
| `vraag_teamdoel_afronding(p_team_goal_id uuid)` | 0326 | `is_group_member()` | vraagt afronding aan | niets over een ander | bedoeld |
| `lid_van_levende_groep(gid uuid)` | 0333 | `auth.uid()`, actief lid, niet gearchiveerd | boolean over de aanroeper zelf | niets over een ander | bedoeld |
| `zet_groepsklassement(p_group_id uuid, p_aan boolean, p_bevestigd boolean)` | 0336 | `is_group_admin()`, bevestiging verplicht, soortreden alleen voor wie mag lezen | zet het klassement aan of uit, met spoor en bericht | het bericht noemt geen punten of titel; de drie grendels van A57 blijven | bedoeld |

Voor 23 van de 24 geldt: de grant is besloten, er is een toets op `auth.uid()`
of op lidmaatschap, en er komt geen gemiste week, verbroken reeks of
achterstand van een ander lid uit. **`teambalk()` haalt de laatste toets niet
zonder voorbehoud** (§4a).

## 4. Twee policyhelpers die één bit over een uuid geven

`is_aandeel_van_een_ander(g)` toetst geen lidmaatschap: elke ingelogde
gebruiker die een doel-uuid kent, hoort of dat doel een teamaandeel van iemand
anders is. `straf_teamband_klopt_voor_mij(p_goal_id)` geeft voor een
buitenstaander hetzelfde bit (`false` voor een aandeel, `true` voor elk ander
doel).

Waarom dat hier toch "bedoeld" heet:

- **De grant is nodig.** 📏 Op productie roept de **invoker**-functie
  `group_overview()` `is_aandeel_van_een_ander()` aan, en de policies
  `commitments_select` en `commitments_insert` roepen
  `straf_teamband_klopt_voor_mij()` aan. Beide lopen onder de rol van de
  aanroeper; zonder `execute` voor `authenticated` breken ze.
- **Het bit is geen stand.** Het zegt iets over de soort van een doel, niet
  over de voortgang ervan.

⚠️ **Twee argumenten die in de eerste versie stonden, houden geen stand**
(security-review L1). "Faalt dicht" gaat over hoe een policy de uitkomst
gebruikt; het orakel zit in de rechtstreekse RPC. En "een uuid is niet te
raden" doet er niet toe: doel-uuids staan in `goal_group_links`, en in het
goedkeurvenster van 0321 is de `goals`-rij van een aandeel met `owner_id`
leesbaar. Een (oud-)teamgenoot kan zo afleiden wie een aandeel heeft en wie
niet meedoet, en het bit blijft `true` na loskoppelen (0332). Daarmee is de
voorwaarde van de bestaande Laag-rij "`is_aandeel_van_een_ander()` is
uitvoerbaar voor `authenticated`" in `docs/ENGINEER-REVIEW.md` waarschijnlijk
al uitgekomen; `straf_teamband_klopt_voor_mij()` heeft daar nog geen rij. Een
vast antwoord voor wie geen lid en geen eigenaar is, is een migratie en een
besluit, geen bijvangst: ER-rij in de afleverregel.

## 4a. `teambalk()` en de opdracht

De opdracht zegt: een functie die geen tegenslag-toets haalt is een bevinding
en geen plafondverhoging. `teambalk()` is dat strikt genomen: in een team van
twee is de stilstand van de ander af te lezen. Maar het is geen nieuwe
bevinding. Het is besloten (Quinten, 18-11), staat open als Middel in
`docs/ENGINEER-REVIEW.md`, en de grant is de functie zelf: zonder grant is er
geen teambalk.

Het plafond staat in deze tak op 105, mét `teambalk()`. Of het 104 moet zijn
(en `adviseur:controle` rood blijft tot het besluit herzien is), is aan de
orchestrator voorgelegd; deze tak merget niet vóór dat antwoord.

## 4b. Twee bijvangsten van de review

- **`lid_van_levende_groep(gid uuid)` heeft de grant niet nodig.** 📏 Op
  productie (22-11) roept alleen `groep_klassement()` hem aan, en die is
  definer; geen policy gebruikt hem. Een `revoke ... from authenticated` in een
  vervolgmigratie brengt het plafond naar 104. Geen migratie in deze opdracht.
- **`zet_groepsklassement()` heeft geen dagteller** (📏 productie, 22-11). Een
  beheerder kan onbeperkt aan en uit zetten, met elke keer een systeembericht.
  Blijft binnen de eigen groep.

Beide als ER-rij in de afleverregel.

## 5. Wat er veranderd is, en de ijking

1. `hoogstens: 81` wordt **105**. De reden noemt de datum, de stand van
   productie en alle 24 handtekeningen, gegroepeerd per grant-migratie.
2. Nieuwe toets in `tests/scripts/adviseur-controle.test.ts`: de 24
   handtekeningen staan elk in de reden, en `hoogstens` is 81 + 24.
3. De bestaande toetsen gaan van 81/82/80 naar 105/106/104.

Met de hand gebroken, en gekeken wélke toets omviel:

| mutatie | wat omviel |
| --- | --- |
| plafond 104 | tien toetsen: elke toets op de gemeten stand (105 meldingen boven 104), plus "24 functies" |
| plafond 106 | vijf: de stand van 22-11 (te ruim), "106e definer-functie" (de ratel laat 106 door), "24 functies", de daling naar 104 en "een uitzondering die niets meer aanwijst" |
| `lid_van_levende_groep(gid uuid)` uit de reden | precies één: "noemt lid_van_levende_groep(gid uuid) in de reden" |

⚠️ **Wat de nieuwe toets niet is.** Hij leest de reden en niet productie; de
ratel telt nog steeds aantallen en geen namen (ER-rij van PR #742, ongewijzigd).
Eén functie weg en één erbij blijft dus groen in `adviseur:controle`.

⚠️ **Ongemeten: het antwoordformaat.** `get_advisors` via de MCP-tool gaf op
22-11 **gegroepeerde** lints: per regel één object met `count` en `findings`,
zonder `cache_key`. `normaliseer()` kent de vorm `{ result: { lints } }` maar
verwacht één lint per bevinding met een `cache_key`. Wat de Management API (de
bron van het script) vandaag teruggeeft, is zonder token niet te meten. Geeft
die ook gegroepeerde lints, dan wordt de controle **rood** (de zes sleutels
vinden niets, de regels tellen 1) en niet stil groen: hij faalt luid. Staat als
ER-rij.

## 6. De 105, zoals `get_advisors` ze op 22-11-2026 meldde

Zodat de volgende meting per naam kan vergelijken in plaats van uit het getal
af te leiden.

- `aandeel_wacht_op_teamgenoot(g uuid)`
- `ai_verbruik()`
- `annuleer_adempauze(p_id uuid)`
- `archiveer_groep(p_group_id uuid, p_bevestigd boolean)`
- `benoem_organisatiebeheerder(p_organization_id uuid, p_user_id uuid)`
- `berichten_over()`
- `beslis_deadline_verzoek(p_request_id uuid, p_akkoord boolean, p_note text)`
- `beslis_lidmaatschapsverzoek(p_request_id uuid, p_naar text)`
- `blokkeer(p_user uuid)`
- `buddyzoek_stand(p_goal_id uuid)`
- `buddyzoek_stand(p_goal_id uuid, p_vandaag date)`
- `buddyzoekopdrachten_over()`
- `create_group(group_name text, huddle_day smallint, tz text, zichtbaarheid text)`
- `dagafvinkingen_over()`
- `deblokkeer(p_user uuid)`
- `deel_prestatie(p_group_id uuid, p_badge text)`
- `deelt_groep_met_eigenaar(g uuid)`
- `deelt_open_groep_met_doel(g uuid)`
- `dien_opnieuw_in(p_weekly_goal_id uuid, p_achieved_level text, p_note text, p_attachment_url text)`
- `getuigenissen()`
- `groep_helden(p_group_id uuid, p_limit integer, p_offset integer)`
- `groep_klassement(p_group_id uuid, p_limit integer, p_offset integer)`
- `groep_teller(p_group_id uuid)`
- `groepsdatum(gid uuid)`
- `handel_melding_af(p_report_id uuid, p_status text)`
- `heropen_groep(p_group_id uuid, p_bevestigd boolean)`
- `herorden_mijlpalen(p_goal_id uuid, p_ids uuid[])`
- `herorden_weekplan(p_goal_id uuid, p_ids uuid[])`
- `herstel_stuurloze_straf(p_commitment_id uuid, p_actie text, p_getuige uuid, p_bevestigd boolean)`
- `invite_preview(code text)`
- `is_aandeel_van_een_ander(g uuid)`
- `is_group_admin(gid uuid)`
- `is_group_member(gid uuid)`
- `is_organisatielid(p_organization_id uuid)`
- `is_platform_beheerder()`
- `join_group_with_code(code text)`
- `ketting_stand(p_group_id uuid, p_period_start date)`
- `keur_teamdoel_goed(p_team_goal_id uuid)`
- `lid_van_levende_groep(gid uuid)`
- `lid_van_open_groep(gid uuid)`
- `lidmaatschapsverzoeken_over()`
- `maak_organisatie(p_naam text)`
- `maak_teamdoel(p_group_id uuid, p_titel text, p_streefdatum date, p_beschrijving text)`
- `maak_teamgroep(p_organization_id uuid, p_naam text, p_huddledag smallint, p_tz text, p_zichtbaarheid text)`
- `mag_groep_lezen(gid uuid)`
- `meld(p_group_id uuid, p_subject_id uuid, p_message_id uuid, p_reden text, p_toelichting text)`
- `meldingen_over()`
- `mijn_bevestigingsstanden(p_weekly_goal_ids uuid[])`
- `mijn_blokkades()`
- `mijn_datum()`
- `neem_aandeel(p_team_goal_id uuid, p_titel text)`
- `ontdek_groepen(p_categorie text, p_taal text, p_limit integer, p_offset integer)`
- `openstaande_meldingen(p_limit integer, p_na_at timestamp with time zone, p_na_id uuid)`
- `organisatie_uitnodigcode(p_organization_id uuid)`
- `organisatieleden(p_organization_id uuid, p_limit integer, p_na_user_id uuid)`
- `organisatieteams(p_organization_id uuid, p_limit integer, p_na_id uuid)`
- `plan_adempauze(p_goal_id uuid, p_starts_cycle date, p_ends_cycle date)`
- `registreer_push_token(p_token text, p_platform text, p_p256dh text, p_auth text)`
- `rond_doel_af(p_goal_id uuid)`
- `rotate_invite_code(p_group_id uuid)`
- `schuif_weekdoel_door(p_weekly_goal_id uuid, p_cycle_start_date date)`
- `set_invite_revoked(p_group_id uuid, p_revoked boolean)`
- `shares_group_with_goal(g uuid)`
- `shares_group_with_user(other uuid)`
- `sluit_weekdoel_af(p_weekly_goal_id uuid)`
- `start_weekplanstap(p_step_id uuid, p_cycle_start_date date)`
- `straf_teamband_klopt_voor_mij(p_goal_id uuid)`
- `straffen_bij_uitstelverzoek(p_goal_ids uuid[])`
- `teambalk(p_team_goal_id uuid)`
- `treed_terug_als_organisatiebeheerder(p_organization_id uuid)`
- `trek_deadline_verzoek_in(p_request_id uuid)`
- `trek_goedkeuring_in(p_approval_id uuid)`
- `vereiste_goedkeuringen(p_group_id uuid, p_owner uuid)`
- `verlaat_groep(p_group_id uuid, p_bevestigd boolean, p_nieuwe_beheerder uuid)`
- `verlaat_organisatie(p_organization_id uuid)`
- `vernieuw_organisatiecode(p_organization_id uuid, p_intrekken boolean)`
- `verwijder_doel(p_goal_id uuid)`
- `verwijder_lid(p_group_id uuid, p_user_id uuid, p_bevestigd boolean)`
- `verwijder_mijn_account()`
- `verwijder_weekdoel(p_weekly_goal_id uuid)`
- `verzoekers_eerder_lid(p_group_id uuid)`
- `vindbaar_voor_mij(other uuid)`
- `vraag_ai_job(p_kind text, p_goal_id uuid, p_input jsonb)`
- `vraag_deadline_verschuiving(p_goal_id uuid, p_group_id uuid, p_new_date date, p_reason text)`
- `vraag_lidmaatschap_aan(p_group_id uuid, p_bericht text)`
- `vraag_teamdoel_afronding(p_team_goal_id uuid)`
- `weekbelofte_begunstigde_bekend(p_groep uuid, p_getuige uuid)`
- `weekdoelen_over()`
- `weekpas_standen(p_goal_ids uuid[])`
- `weekplanstappen_over()`
- `weekreacties_over()`
- `word_organisatielid(p_code text)`
- `zet_doelstatus(p_goal_id uuid, p_gearchiveerd boolean)`
- `zet_groepsklassement(p_group_id uuid, p_aan boolean, p_bevestigd boolean)`
- `zet_groepsontdekbaarheid(p_group_id uuid, p_naar boolean, p_bevestigd boolean)`
- `zet_groepszichtbaarheid(p_group_id uuid, p_naar text, p_bevestigd boolean)`
- `zet_huddledag(p_group_id uuid, p_dag smallint, p_oude_start date, p_nieuwe_start date, p_bevestigd boolean)`
- `zet_organisatielid_uit(p_organization_id uuid, p_user_id uuid)`
- `zet_streefdatum(p_goal_id uuid, p_date date)`
- `zet_taakzichtbaarheid(p_taak uuid, p_group_id uuid)`
- `zet_week_startdag(p_dag smallint, p_oude_start date, p_nieuwe_start date)`
- `zichtbare_reeksen_van_groep(p_group_id uuid)`
- `zoek_buddies_aan(p_goal_id uuid, p_bevestigd boolean)`
- `zoek_buddies_uit(p_goal_id uuid)`
- `zoek_mensen(p_term text, p_limit integer, p_offset integer)`


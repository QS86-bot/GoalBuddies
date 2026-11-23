# Een weggeklikte uitnodiging komt terug na aan en uit — QS8-784

Datum: 22-11-2026. Vervolg op QS8-666 deel 3b-2 (`docs/decisions/2026-11-22-de-uitnodigingskaart-van-het-klassement.md`), die de
kaart zonder wegklikknop bouwde.

## Besluiten van Quinten waar dit op leunt
- P3 c (A57): de uitnodigingskaart is **wegklikbaar per beheerder**, alleen de eigen rij leesbaar en schrijfbaar (domeinregel 7).
- 22-11-2026 (reactie op QS8-784, via de hoofdorchestrator): **de kaart komt terug na aan → uit**, voor elke beheerder van die groep.

## Wat de bouw koos
1. **Een eigen tabel `klassement_uitnodiging_weg (user_id, group_id, weggeklikt_op)`, geen kolom op `group_members`.** Die rij is
   voor groepsgenoten leesbaar, en RLS kan geen kolommen beperken. Vorm, grants en foreign key (naar `group_members (group_id,
   user_id)`, met cascade) zijn die van `groep_demping` (0305).
2. **Vier policies, alle vier `user_id = auth.uid()`, zonder groepstak.** De INSERT eist bovendien `is_group_admin(group_id)` en een
   klassement dat uit staat. UPDATE en DELETE dragen `is_group_member()` voor `archiefleesgat()`. Grants: `select`, `insert
   (user_id, group_id)`, `delete`; geen `update`.
3. **"Terug na aan → uit" is een trigger op `groups`, en geen regel in `zet_groepsklassement()`.** 📏 Gemeten op main 42beea69: drie
   routes zetten `klassement_aan` bij een bestaande groep om (`zet_groepsklassement()` beide kanten op, `zet_groepszichtbaarheid()`
   naar open zet hem aan, `zet_groepsontdekbaarheid()` zet hem uit). Een reset in alleen de eerste mist "open maken → weer uit".
   De trigger hangt aan de kolom, herdefinieert geen bestaande functie (geen registerdrift) en vangt ook een vierde schrijver.
4. **De trigger wist bij élke wissel, niet alleen bij uit → aan.** Een beheerder met een verouderd scherm kan net vóór een wissel
   naar "aan" wegklikken; zijn rij mag de volgende "uit" niet overleven. Dit kwam uit de spec-planner en staat onder test.
5. **De trigger is geen `security definer`.** Elke schrijver is een definer-RPC (de eigenaar slaat RLS over) of `service_role`;
   `authenticated` kan de kolom niet zetten (kolomrevoke 0333 en `pin_groepsklassement()`). Komt er een invoker-pad bij, dan wist
   hij alleen de eigen rij, en moet hij definer worden. Dat staat in de kop van de migratie.
6. **Een mislukte lezing toont de kaart.** De kaart zet niets; bij twijfel de kant die iets laat zien (anders dan de demping,
   waar een liegende schakelaar erger is). Een mislukte wegklik zet de kaart terug met een foutregel.
7. **De query staat in `klassement-weg.ts` met alleen type-imports**, zodat de RLS-toets dezelfde twee verzoeken onder een
   echte JWT afspeelt als het scherm (regel 18, de naad).

## Toetsing
- `tests/rls/klassement-uitnodiging-weg.test.ts`: tien gevallen op een lokale stack, groen. Met de hand gebroken per grendel;
  wélke test omviel staat in de kop van het bestand. De DELETE-policy alléén verruimen blijft groen: een `delete … where` raakt
  alleen rijen die de SELECT-policy toont, dus de eigen-rij-SELECT is een tweede slot. Met beide verruimd valt de wistest om.
- `src/modules/buddies/klassement-plek.test.ts`: `weggeklikt` verbergt alleen de uitnodiging, nooit een lijst of een fout.

## Aannames
- Een lid dat vertrekt blijft in `group_members` staan (status `inactive`), dus de cascade vuurt dan niet: de rij blijft, alleen
  voor hem leesbaar. Wordt hij later weer beheerder, dan blijft de kaart weg tot de volgende wissel. Onschadelijk, niet gebouwd.
- Een beheerder die teruggezet wordt tot lid houdt zijn rij; hij ziet de kaart als lid toch niet.
- Wat een organisatiebeheerder ziet: `is_group_admin()` is sinds 0317 ook waar voor hem, maar een teamgroep toont de kaart nooit
  (`kanKlassementZetten`), en de foreign key eist een lidmaatschap.
- Niet gemeten: het uiterlijk op een toestel (wel schermafdrukken op web, 390 en 1280).

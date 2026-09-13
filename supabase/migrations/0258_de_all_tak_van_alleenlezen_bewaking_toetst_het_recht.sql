-- 0258_de_all_tak_van_alleenlezen_bewaking_toetst_het_recht.sql — de `ALL`-tak
-- van `alleenlezen_bewaking()` toetst het schrijfrecht in plaats van het aan te
-- nemen (QS8-458).
--
-- ROLLBACK-PAD:
--   CREATE OR REPLACE FUNCTION public.alleenlezen_bewaking() ... (de versie uit
--   0148, met `when 'ALL' then true`). Geen tabel, kolom, policy of grant
--   gewijzigd — alleen het lichaam van deze functie.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Middel-rij 428 uit `docs/ENGINEER-REVIEW.md` (03-09-2026), op 13-09
--    nagemeten tegen `pg_get_functiondef()`. De rij klopte nog.
--
--    `alleenlezen_bewaking()` meldt policy-helften die hard op `false` staan
--    **terwijl `authenticated` het recht nog heeft** — want dán is de policy de
--    grendel en niet de grant. Dat onderscheid is de reden dat deze functie
--    bestaat. Voor `DELETE` en voor de kolom-commando's werd dat recht ook echt
--    getoetst; voor `ALL` stond er `true`.
--
-- ⚠️ **Waarom dat erger is dan een ruisrij.** Een fixture die op deze uitslag
--    leunt zou bij zo'n policy een weigering krijgen uit de **grant** en niet uit
--    de **policy** — en dan is hij permanent groen terwijl de policy wagenwijd
--    openstaat. Dat is letterlijk de klasse waar deze functie voor gebouwd is.
--
-- ---------------------------------------------------------------------------
-- Wat er vandaag waar is, en waarom dit tóch nu gebeurt
-- ---------------------------------------------------------------------------
--
-- 📏 Vier `ALL`-policies in `public` — `daily_moves_write`, `goal_interviews_all`,
--    `milestones_write`, `week_reviews_write` — en **geen enkele** heeft een
--    `false`-helft. De reproductie uit de reviewrij geeft daarom vóór én na een
--    `revoke` nul rijen: er is niets te melden.
--
-- ⚠️ **De escalatievoorwaarde van rij 428 is dus niet afgegaan** (*"wordt
--    zwaarder als een `ALL`-policy ooit een `false`-helft krijgt"*). Dat is
--    nagemeten en niet aangenomen. Dit is geen reparatie van een lek maar van een
--    grendel die groen staat om de verkeerde reden — en dat merk je pas op het
--    moment dat je hem nodig hebt.
--
-- ⚠️ **Niet met de bestaande data te ijken**, en daarom staat de ijking in
--    `tests/rls/alleenlezen.test.ts` met een eigen tabel: een `ALL`-policy op
--    `using (false) with check (false)`, in vier rechtenstanden.
--    *"Een controle die je niet kunt voeden, kun je niet ijken."*
--
--    📏 De vier standen, en wat er hoort te komen:
--
--      alle rechten     -> using + check   beide helften dragen
--      alleen select    -> using           alleen lezen komt langs de grant
--      alleen insert    -> check           de using-helft is onbereikbaar
--      geen rechten     -> <niets>         de grant is de grendel
--
-- ⚠️⚠️ **De eerste versie van deze migratie had er drie van de vier fout**, en
--    de test legde dat vast als de bedoelde uitkomst — inclusief een uitgeschreven
--    onderbouwing in deze kop. Dat is de vorm waar CLAUDE.md voor waarschuwt:
--    *"een afwijking die je onderbouwt is duurder dan een die je vergeet"*. De
--    security-review vond het; de meting hierboven is die van de reparatie.
--
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.alleenlezen_bewaking()
 RETURNS TABLE(tabel text, opdracht text, helft text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
  select p.tablename::text, p.cmd::text, h.helft
  from pg_policies p
  cross join lateral (values ('using', p.qual), ('check', p.with_check)) as h(helft, uitdrukking)
  -- ⚠️ **`to_regclass` en niet `format(...)` rechtstreeks, en dat is geen
  --    netheid.** De eerste versie bouwde `'public.' || tablename` en gaf dat
  --    aan `has_table_privilege()`, met `schemaname = 'public'` in dezelfde
  --    `where`. Postgres mag `where`-voorwaarden in elke volgorde uitvoeren, dus
  --    de rechtentoets liep óók op de storage-policies op `objects` — en die
  --    tabel heet `storage.objects`, niet `public.objects`. Resultaat: `relation
  --    "public.objects" does not exist`, en de hele functie viel om.
  --    `to_regclass` geeft `null` waar de naam niet oplost in plaats van te
  --    gooien, en het schema komt nu uit de rij zelf.
  --    ⚠️ Gevonden doordat de test hem aanriep, niet door hem te lezen.
  cross join lateral (
    select to_regclass(format('%I.%I', p.schemaname, p.tablename)) as rel
  ) r
  where p.schemaname = 'public'
    and p.permissive = 'PERMISSIVE'
    and h.uitdrukking = 'false'
    and 'authenticated' = any (p.roles)
    and r.rel is not null
    and case p.cmd
          when 'DELETE' then has_table_privilege('authenticated', r.rel, 'DELETE')
          -- ⚠️⚠️ **Hier stond `true`, en dat was de enige tak die aannam wat de
          --    andere twee meten** — QS8-458, reviewrij 428. De hele functie
          --    bestaat om een `false`-helft te melden waar de **policy** de
          --    grendel is en niet de grant; met `true` meldde deze tak hem ook
          --    als het recht er helemaal niet was.
          --
          -- ⚠️⚠️ **En de eerste reparatie draaide de fout om in plaats van hem
          --    weg te nemen.** Die toetste DELETE, INSERT en UPDATE — en liet
          --    SELECT weg. Voor een bewaking is dat de gevaarlijke kant op: niet
          --    ruis erbij, maar een melding die wegvalt.
          --
          --    📏 Gemeten met een tabel met `for all using (false) with check
          --    (false)`, alle rechten ingetrokken op `select` na:
          --
          --      policy dicht, leesrecht open -> de client leest 0 rijen
          --      policy open,  leesrecht open -> de client leest 1 rij
          --
          --    Alleen de policy verschilt tussen die twee metingen, dus de
          --    **policy** is daar de grendel — en precies dan hoort deze functie
          --    de `using`-helft te melden. De eerste reparatie gaf nul.
          --
          -- ⚠️ **De rechtentoets hoort per hélft te gaan, want dat is wat de rij
          --    teruggeeft.** In Postgres stuurt de `using`-helft van een
          --    `for all` SELECT, UPDATE (de oude rij) en DELETE aan; de
          --    `check`-helft stuurt INSERT en UPDATE (de nieuwe rij) aan. Laat je
          --    `with check` wég, dan gebruikt Postgres `using` óók als check, en
          --    dan draagt die helft de INSERT er nog bij.
          when 'ALL' then case h.helft
              when 'using' then (
                     has_any_column_privilege('authenticated', r.rel, 'SELECT')
                  or has_any_column_privilege('authenticated', r.rel, 'UPDATE')
                  or has_table_privilege('authenticated', r.rel, 'DELETE')
                  or (p.with_check is null
                      and has_any_column_privilege('authenticated', r.rel, 'INSERT'))
                )
              else (
                     has_any_column_privilege('authenticated', r.rel, 'INSERT')
                  or has_any_column_privilege('authenticated', r.rel, 'UPDATE')
                )
            end
          else has_any_column_privilege('authenticated', r.rel, p.cmd)
        end
  order by 1, 2, 3;
$function$;

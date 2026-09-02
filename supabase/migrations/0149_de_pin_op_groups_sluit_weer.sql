-- 0149_de_pin_op_groups_sluit_weer.sql — `guard_group_update()` was `SECURITY
-- DEFINER` en beslist op `current_user`; die twee sluiten elkaar uit.
--
-- ROLLBACK-PAD:
--   `guard_group_update()` terug uit 0144 §2 (identiek, maar met
--   `security definer` in plaats van `security invoker`).
--   ⚠️ Terugdraaien zet de pin weer uit. Er lekt dan nog steeds niets zolang
--      geen van de gepinde kolommen in de UPDATE-kolomgrant staat — maar dan is
--      het weer één grendel waar er twee horen te zijn.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gevonden door de `security-reviewer` op 02-09-2026, tijdens de tweede ronde
-- op QS8-186, en nagemeten voordat er iets veranderde.
--
-- `guard_group_update()` pint een handvol kolommen van `groups` vast tegen een
-- client. Hij begon met:
--
--     if current_user not in ('authenticated', 'anon') then
--       return new;   -- geen pin
--     end if;
--
-- **Maar de functie was zélf `SECURITY DEFINER` en eigendom van `postgres`.**
-- Binnen een definer-functie ís `current_user` de eigenaar, dus daar stond
-- altijd `postgres` — ook wanneer een gewone client de UPDATE deed. De eerste
-- regel nam élke keer de vroege uitgang en er werd nooit iets gepind.
--
-- Gemeten, in een teruggedraaide transactie, mét het kolomrecht dat
-- `authenticated` vandaag niet heeft:
--
--     grant update (status) on groups to authenticated;
--     set local role authenticated;
--     update groups set status = 'sleeping' where id = …;
--
--     status na de update door een client -> sleeping
--     de pin hoort hem op active te houden -> active
--
-- ---------------------------------------------------------------------------
-- 1. Waarom dit ertoe doet terwijl er niets lekt
-- ---------------------------------------------------------------------------
--
-- Geen van de gepinde kolommen staat in de UPDATE-kolomgrant van
-- `authenticated`, en **dát** is wat ze tegenhoudt. Dat werkt. Het probleem is
-- dat het er één grendel is en geen twee, terwijl vier plekken het tegendeel
-- zeggen:
--
--   * **0019 §4 zette de trigger er met zoveel woorden naast als tweede slot** —
--     *"die vangt ook het geval waarin iemand ooit per ongeluk `grant update on
--     groups` uitvoert"*. Dat is precies het geval dat níet gevangen werd.
--   * `scripts/zichtbaarheid-controle.mjs` noemt de functie als bescherming van
--     de A41-kolom `zichtbaarheid`, waarvan CLAUDE.md zegt dat hij voor geen
--     enkele client schrijfbaar is.
--   * `tests/rls/ontdekken.test.ts` schrijft er "Twee grendels" bij.
--   * `scripts/pinuitzonderingen-controle.mjs` onderhoudt een lijst uitzonderingen
--     op een pin die iedereen doorliet.
--
-- ⚠️ **En 0019 had de fout zélf al bijna te pakken**, met een andere diagnose:
--    *"het is een deny-list op rolnaam en hij faalt open: elke rol die niet exact
--    zo heet, mag alle kolommen."* Dat klopte, en de mitigatie — de kolomgrant —
--    was de goede zet. Alleen was de rol die er niet op stond niet een
--    toekomstige custom rol, maar `postgres`: de eigenaar van de functie zelf.
--
-- ⚠️ **0033 §1 leunde erop en trok een onjuiste conclusie.** Daar staat dat
--    `guard_group_update()` "per ongeluk goed" is voor `created_by`, omdat *"een
--    referentiële actie draait als de eigenaar van de tabel"* en de vroege
--    uitgang dus alleen dán genomen wordt. Die uitgang werd voor **iedereen**
--    genomen. De uitkomst voor `created_by` bleef toevallig goed; de redenering
--    was onjuist en staat hier rechtgezet in plaats van dat 0033 herschreven
--    wordt — een migratie is een verslag van wat er toen gebeurde.
--
-- ⚠️ **De grant op `groups` groeit bij elke nieuwe groepsinstelling.** 0144
--    voegde `categorie`, `voertaal` en `omschrijving` toe. Zodra daar één
--    gepinde kolom bij glipt, ving de pin hem niet.
--
-- ---------------------------------------------------------------------------
-- 2. De reparatie is één woord, en dat is met opzet
-- ---------------------------------------------------------------------------
--
-- `security invoker` in plaats van `security definer`. Daarmee is `current_user`
-- weer wát de toets bedoelde: de rol die de UPDATE dóet.
--
--   * een client schrijft rechtstreeks → `authenticated` → de pin gaat om;
--   * `archiveer_groep()`, `zet_groepszichtbaarheid()` en de andere
--     definer-functies → `postgres` → de vroege uitgang, en die functies kunnen
--     hun werk doen na hun éigen toetsing. **Dat is precies de bedoeling van de
--     oorspronkelijke regel**, en daarom verandert er verder niets aan de body.
--   * de rollover onder `service_role` zonder JWT → geen van beide namen → de
--     vroege uitgang, dus `slaap_stille_groepen()` blijft werken.
--
-- ⚠️ **De functie heeft geen verhoogde rechten nodig**: hij leest alleen `old`
--    en `new` en wijst toe. `SECURITY DEFINER` stond er zonder dat er iets was
--    dat het vroeg.
--
-- ⚠️ **Een trigger vuurt ook zonder EXECUTE-recht op zijn functie.** Postgres
--    toetst dat bij `create trigger` en niet bij elke rij, dus de `revoke all
--    ... from public, anon, authenticated` hieronder blijft staan én de trigger
--    blijft werken voor `authenticated`. Gemeten, niet aangenomen.
--
-- ⚠️ **De must-allow-helft is even zwaar getoetst als de pin zelf.** Zou deze
--    wijziging óók de definer-route dichtzetten, dan kan niemand meer een groep
--    archiveren of zijn zichtbaarheid omzetten. `tests/rls/groepspin.test.ts`
--    houdt beide helften vast.

create or replace function public.guard_group_update()
  returns trigger
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  new.id               := old.id;
  new.created_at       := old.created_at;
  new.invite_code      := old.invite_code;
  new.invite_revoked   := old.invite_revoked;
  new.status           := old.status;
  new.last_activity_at := old.last_activity_at;
  new.zichtbaarheid    := old.zichtbaarheid;
  -- QS8-231: ontdekbaarheid is een toestemming en geen instelling.
  new.ontdekbaar       := old.ontdekbaar;

  -- ⚠️⚠️ **De tak van 0060 is hier weg, en dat is gemeten en niet bedacht.**
  --    Daar stond `if old.created_by is null or new.created_by is not null`, om
  --    de overgang *van een oprichter naar geen oprichter* door te laten — de
  --    `on delete set null` die 0033 en 0060 beschrijven.
  --
  --    Die reden is achterhaald door de reparatie hierboven. Deze regel wordt
  --    **alleen nog bereikt door een client**: elke andere schrijver, de
  --    referentiële actie inbegrepen, komt niet voorbij de vroege uitgang. Dat
  --    is nagemeten — bij `delete from auth.users` draait de RI-actie met
  --    `current_user = postgres`.
  --
  --    De tak liet daarmee precies één ding door dat niemand wil: een
  --    beheerder-client die het oprichterschap van zijn eigen groep leegtrekt.
  --    Gemeten met een tijdelijk `grant update (created_by)`: **NULL**, de pin
  --    hield hem niet tegen. Met deze regel onvoorwaardelijk blijft de oprichter
  --    staan, én loopt het verwijderen van een account nog gewoon door.
  new.created_by := old.created_by;

  return new;
end;
$$;

comment on function public.guard_group_update() is
  'Pint de kolommen van groups die geen instelling maar een toestemming zijn. '
  'SECURITY INVOKER en niet DEFINER: de toets is `current_user`, en in een '
  'definer-functie is dat de eigenaar — dan gaat de pin nooit om (QS8-264).';

revoke all on function public.guard_group_update() from public, anon, authenticated;

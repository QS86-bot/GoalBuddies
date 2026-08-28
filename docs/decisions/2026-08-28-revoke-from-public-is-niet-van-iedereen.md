# `revoke ... from public` is in Supabase niet "van iedereen"

**Datum:** 28-08-2026
**Aanleiding:** de controle van 28-08. `seizoensrecap_cijfers()` was voor elke
ingelogde gebruiker aanroepbaar, op productie, terwijl de migratie hem
onmiskenbaar als `service_role`-only bedoelde.

## Wat er misging

0112 schreef:

```sql
revoke all on function public.seizoensrecap_cijfers(uuid, date, date) from public, anon;
grant  execute on function public.seizoensrecap_cijfers(uuid, date, date) to service_role;
```

Supabase draait `alter default privileges ... grant execute on functions to
anon, authenticated, service_role`. Elke nieuwe functie in `public` krijgt dus
drie rechten cadeau. Wie er `public` en `anon` afhaalt, **houdt `authenticated`
over** — precies de rol waaronder iedere ingelogde gebruiker draait.

Honderdtwintig regels verderop in datzelfde bestand staat het wél goed:

```sql
revoke all on function public.maak_seizoensrecaps(timestamptz) from public, anon, authenticated;
```

Eén regel met en één zonder. Dat maakt het een omissie en geen keuze — en het
laat zien dat de juiste vorm bekend was.

## Wat het lekte

De functie is `SECURITY DEFINER` en draagt geen lidmaatschapstoets, anders dan
zijn zusje `ketting_stand()` (`where is_group_member(p_group_id)`). De grant was
dus het énige slot. Wie ooit lid was en het groeps-id nog had, kon per
willekeurig venster de weekdoel- en kettingtellers van die groep opvragen. Met de
ledenlijst die hij al had is dat een aanwezigheidsteller per week — domeinregel 7
langs een omweg, zonder houdbaarheidsdatum.

**Gemeten op productie**, vóór de reparatie:
`has_function_privilege('authenticated', 'seizoensrecap_cijfers(uuid,date,date)', 'execute')` → `true`.

## De regel

**Elke `revoke` op een functie of tabel noemt `authenticated` met zoveel
woorden.** `from public, anon` is onvolledig; `from public, anon, authenticated`
is de vorm. Dit geldt ook voor tabellen: `alter default privileges` deelt daar
dezelfde drie rollen uit — 0101 loste dat al een keer op voor vier tabellen.

## Waarom er géén tweede slot in de functie kwam

`maak_seizoensrecaps()` roept `seizoensrecap_cijfers()` aan als `service_role`,
en daar is `auth.uid()` NULL. Een `is_group_member()`-toets zou de recap voor
élke groep stilzwijgend op nul zetten. **Een tweede slot dat de feature sloopt is
geen tweede slot.**

Het tweede slot is daarom een test, en die staat in
`tests/rls/functiegrants.test.ts`.

## De grendel, en waarom hij generiek is

Eén grant repareren lost één geval op. De klasse is *"een recht dat niemand
besloten heeft"*. `functies_voor_authenticated()` (0115) levert elke functie in
`public` die `authenticated` mag uitvoeren; de test legt die lijst naast de
`grant`-regels in `supabase/migrations/`. Staat een functie in de lijst zonder
dat enige migratie hem gunt, dan komt het recht uit de Supabase-standaard.

⚠️ **De vergelijking staat in de test en niet in de database**, want de database
kent de migratiebestanden niet — en dát is precies de naad die bewaakt moet
worden (regel 18, vraag 1).

⚠️ **In beide richtingen met de hand bewezen.** De grant teruggeven op de lokale
stack maakt béide tests rood, en de generieke noemt `seizoensrecap_cijfers` bij
naam. Intrekken maakt ze weer groen.

⚠️ **Twee valkuilen in de vergelijking zelf, allebei gemeten.** Een eerste versie
las regel voor regel en miste `weekafsluiting_reacties`, waar de grant over twee
regels loopt — een vals alarm dat ik bijna gemeld had. En zonder het commentaar
weg te knippen telt een rollback-kop die `grant execute ...` noemt als een echte
grant. De test plat daarom eerst de witruimte en knipt eerst het commentaar weg.

## Wat dit niet is

Geen verruiming van wat de client mag. `seizoensrecap_cijfers()` was nooit voor
de client bedoeld; de recap bereikt de gebruiker via het systeembericht
`season_recap` in de groepschat, en dat pad is ongewijzigd.

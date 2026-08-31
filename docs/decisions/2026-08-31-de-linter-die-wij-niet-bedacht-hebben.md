# De enige controle die iets kan vinden waar niemand aan gedacht heeft

**Datum:** 31-08-2026
**Aanleiding:** QS8-235, uit de beveiligingsdoorlichting van 31-08
**Raakt:** `scripts/adviseur-controle.mjs`, `tests/scripts/adviseur-controle.test.ts`,
`.claude/commands/audit.md`, `package.json`

## 1. Wat er ontbrak

De poort draait zesentwintig controles. Ze zijn goed, ze zijn geijkt, en ze
toetsen alle zesentwintig **iets wat wij zelf bedacht hebben te toetsen**. Dat is
per definitie een blinde vlek ter grootte van wat we niet bedacht hebben.

Supabase heeft daarnaast een eigen linter over het gedéployde schema. Die is op
31-08-2026 voor het eerst gedraaid — met de hand, in een chat. 53 bevindingen, en
niets in de repo wist dat dit bestond.

## 2. Waarom een allowlist en geen drempel

Alle 53 zijn stuk voor stuk beoordeeld:

| Niveau | Aantal | Oordeel |
|---|---|---|
| ERROR | 2 | `security_definer_view` op `mijn_profiel` en `group_visible_streaks` — `security_invoker = false` ís daar de werking (0089), de schrijfkant is in 0095 dicht |
| INFO | 2 | `invite_events` en `invite_preview_limits`: RLS zonder policy is deny-all, allebei onder test |
| WARN | 1 | `auth_leaked_password_protection` staat uit — QS8-141 |
| WARN | 1 | `invite_preview` is oningelogd bereikbaar — met opzet, sinds 0131 met een limiet (QS8-236) |
| WARN | 47 | definer-functies — QS8-181 |

⚠️ **Dat alles vandaag verklaard is, is precies de reden om het nú vast te
leggen.** Een lijst die volledig verklaard is, is de goedkoopste die er ooit zal
zijn: elke bevinding daarná is per definitie nieuw werk. Zonder deze controle
staat die nieuwe tussen 52 bekende zonder dat iemand hem ziet.

Een drempel ("hoogstens 60 bevindingen") doet dat niet: dan verdwijnt een nieuwe
achter een opgeloste, en het getal zegt niets over wélke.

## 3. Twee vormen van uitzondering, en waarom er twee nodig zijn

- **Op sleutel** (`cache_key`) — precies deze ene bevinding. Gebruikt voor alles
  waar een eigen reden bij hoort.
- **Op regel met een maximum** (`hoogstens`) — deze regel mag zoveel keer
  voorkomen. Alleen voor bevindingen die als groep één open besluit zijn.

⚠️ **Waarom die tweede vorm moet bestaan.** De sleutel van een definer-functie
draagt zijn handtekening: `..._annuleer_adempauze_p_id uuid`. Zevenenveertig losse
sleutels zouden bij elke parameterwijziging rood worden zonder dat er iets nieuws
is — en een controle die rood wordt om niets, leert je hem te negeren.

⚠️ **En waarom de eerste vorm moet blijven.** `rls_enabled_no_policy` staat twee
keer op de lijst, met een eigen sleutel per tabel en níét als groep. Een dérde
tabel met RLS zonder policy is een nieuw besluit en geen herhaling. Dat staat
apart onder test.

## 4. De lijst rot twee kanten op

Een uitzondering die niets meer aanwijst, is een uitspraak die niemand meer
nameet. Daarom is een ongebruikte regel óók rood, en telt `hoogstens` naar
**beneden** mee: zakt het aantal definer-functies van 47 naar 40, dan hoort dat
getal mee te zakken.

⚠️ Zonder die tweede helft is `hoogstens` geen ratel maar een plafond waar je
onder kunt blijven zitten, en dan legt niemand ooit vast wat de stand is.

## 5. De ijking

Elke allowlist-regel is **apart** weggehaald en de controle werd elke keer rood —
per grendel, niet één mutatie voor het geheel:

```
volledige lijst: groen
  ✓ rood zonder security_definer_view_public_mijn_profiel            (1 onverwacht)
  ✓ rood zonder security_definer_view_public_group_visible_streaks   (1 onverwacht)
  ✓ rood zonder rls_enabled_no_policy_public_invite_events           (1 onverwacht)
  ✓ rood zonder rls_enabled_no_policy_public_invite_preview_limits   (1 onverwacht)
  ✓ rood zonder auth_leaked_password_protection                      (1 onverwacht)
  ✓ rood zonder anon_security_definer_function_executable            (1 onverwacht)
  ✓ rood zonder authenticated_security_definer_function_executable  (47 onverwacht)
```

## 6. Wat hier niet getest is, en dat is een grens en geen omissie

`beoordeel()` en `normaliseer()` staan los onder test, met elke vorm die ze moeten
vinden én elke vorm die ze met rust moeten laten. **Het ophalen zelf niet** — dat
vraagt een echte token.

⚠️ De belangrijkste toets van `normaliseer()` is daarom dat hij **wérpt** bij een
antwoord dat hij niet begrijpt, en niet een lege lijst teruggeeft. "Nul
bevindingen" is groen, en "ik snapte het antwoord niet" mag dat nooit worden. Een
controle die stilvalt bij een gewijzigd antwoordformaat, meldt jarenlang niets en
ziet er precies uit als een controle die niets te melden heeft.

## 7. Wat deze controle onderweg blootlegde

Bij het inhangen bleek de poort hem als **groen** te tellen terwijl hij
`OVERGESLAGEN` naar stderr schreef. Dat lag niet aan deze controle: `draai()`
gooide stderr weg bij exitcode 0, en dus deden `functies:controle` en
`register:controle` dat al maanden. Dat is QS8-239, met een eigen branch, en deze
branch leunt erop.

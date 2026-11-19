# Een groep dempen laat directe steun door (QS8-752, migratie 0305)

Besluit van de bouwsessie op 19-11-2026, binnen de beslisbevoegdheid; epic QS8-721.

## Wat er is gebouwd

- `groep_demping (user_id, group_id, gedempt_op)`: een rij betekent "gedempt". Eigenaar-only.
- `te_beoordelen_voor()` slaat een groep over die de ontvanger gedempt heeft.
- Een schakelaarkaart op het groepsscherm (`src/schermen/groep/DempGroep.tsx`).

## Wat er bestaat en wat niet (gemeten)

Er is één meldingsstroom die per groep verschilt: `approval_request` ("een buddy wacht op jou"). Reacties, applaus en een groepsfeed-melding bestaan niet als tabel of pushsoort. "Goed nieuws over jezelf" is `approval_received` en leest `completion_approvals` op `subject_id` zonder groepstak. Het issue noemt dus soorten die er (nog) niet zijn; wat gedempt wordt is wat er is, en een latere groepsmelding moet door `groep_demping` of de test (`tests/beloftes/een-gedempte-groep-belt-niet.test.ts`) wordt rood.

## Keuzes

1. **Aparte tabel, geen kolom op `group_members`.** `group_members_select` laat groepsgenoten elkaars rij lezen en RLS kan geen kolommen beperken; een kolom had getoond wie dempt (domeinregel 7). Zelfde keuze als 0303.
2. **Filter in de SQL van `te_beoordelen_voor()`, niet in de Edge Function.** De functie heeft `limit 50` zonder `order by`; filteren erna kan ongedempte verzoeken laten wegvallen. De job verandert niet. Een voltooiing in meerdere groepen blijft melden zolang één groep ongedempt is (de eis zit in de join, `distinct` doet de rest).
3. **Composite FK met `on delete cascade` op `group_members`.** 0262 wees zo'n FK af omdat een goedkeuring een feit uit het verleden is; een demping is een voorkeur van nu. Wie vertrekt en terugkomt begint ongedempt (de luide kant).
4. **De insert-policy eist `is_group_member()`.** Een FK-controle valt pas aan het eind van het statement; de policy weigert per rij vóór het schrijven.
5. **`vastgelopen_goedkeuringen()` (0147) blijft onveranderd.** Dempen dempt de melding, niet het recht. Gelijktrekken zou een week in een volledig gedempte groep als vastgelopen laten tellen en automatisch goedkeuren: punten zonder buddy.
6. **Directe steun** = `approval_received`, `commitment_witness`, `commitment_reverted`: geen groepstak, blijven komen.
7. **Geen systeembericht**, geen nieuw event, geen realtime, geen `grant update`.

## Aannames

- Dempen raakt alleen push; de lijst "te beoordelen" in de app en het goedkeurrecht blijven.
- Een volledig gedempte groep laat een week zonder push (ER-rij in het PR-verslag).
- Teamgroepen zijn gewoon te dempen; een organisatiebeheerder ziet niet wie dempt.
- Geen tijdelijke demping (`gedempt_tot`) in deze iteratie.
- Migratie en types: tabel loopt ongetypeerd door een smalle rand tot `npm run types:db` na de uitrol.

## Meting en ijking

Lokaal (Postgres 16, rollen via `set role`): groepsgenoot leest 0 rijen, namens-insert en niet-lid weigeren met de policy (ook 5000 rijen), `anon` weigert, cascade bij vertrek, meervoudige groep en volledige demping gedragen zich als beschreven. Statische grendels per punt met de hand gebroken (functie, extra job-bron, `grant update`, groepstak op select, FK los van lidmaatschap): elk werd rood. De RLS-suite met echte JWT's (`tests/rls/groep-demping.test.ts`) draait niet in een cloudsessie; CI is de meting.

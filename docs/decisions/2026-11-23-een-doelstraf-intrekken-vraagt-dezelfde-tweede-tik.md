# Een doelstraf intrekken vraagt dezelfde tweede tik

**Datum:** 23-11-2026 · **Issue:** QS8-814 · **Besluit:** Quinten, 23-11-2026 (meerkeuze: A, dezelfde bevestiging; daarna 16:55 UTC, twee vragen)
**Raakt:** domeinregel 5 (commitment devices), 7 (falen is nooit publiek) en 11
**Vorm van:** `docs/decisions/2026-11-23-intrekken-vraagt-een-tweede-tik-en-een-korte-week-is-een-waarschuwing.md` (QS8-799)

## Wat er veranderd is

1. **Een straf op een doel intrekken gaat in twee stappen.** De eerste tik op
   *Intrekken* opent alleen een vraag met de gevolgen: de straf vervalt en gaat niet
   meer in werking, en de getuige krijgt er niets van te zien. Pas *"Ja, trek mijn
   straf in"* schrijft. Dat zit in `StrafIntrekken` (`src/schermen/straf/`), en het
   doelscherm toont alleen die component.
2. **Loopt er een uitstelverzoek op dit doel, dan noemt de vraag de groep.** Er komt
   één regel bij: *"De groep die je om uitstel vroeg, ziet dan niet meer dat er een
   straf op dit doel staat."*
3. **Is de straf intussen beslist, dan zegt de melding dat, en verdwijnt de
   intrekknop.** *"Deze straf kan niet meer worden ingetrokken: ze is intussen
   beslist."* met de knop *"Bekijk de uitslag"*, die het scherm herlaadt. Bij een
   storing blijft de intrekknop staan.

Geen migratie: alles is client.

## Keuzes die niet vanzelf spreken

**De getuige ziet niets: nagemeten, en op één plek niet waar.** Op `set` hoort de
getuige niets en kan hij de straf niet lezen (0293, met de tabel daar). Intrekken kan
alleen vanuit `set`. Er gaat dus geen bericht en geen melding uit. **Maar** een groep
die om uitstel gevraagd is, ziet op het verzoek de regel "Op dit doel staat een
straf…" (`straffen_bij_uitstelverzoek()`, 0218/0321, getoond in `app/groep/[id].tsx`).
Die RPC filtert op `status <> 'cancelled'`, dus na het intrekken verdwijnt die regel
stil. Bij een belofte speelt dit niet, want 0312 laat beloftes buiten die RPC.

Dat is als vraag aan Quinten voorgelegd, en hij koos **optie B**: de zin van 799
blijft, plus één regel alleen als er echt een uitstelverzoek loopt. De andere twee
opties waren de zin ongewijzigd laten (A) of "niets te zien" weghalen (C).

**"Loopt" is `status = 'open'`.** De groep ziet de strafregel alleen op een open
verzoek (`fetchOpenVerzoekenVoorGroep()` filtert op `open`). Het doelscherm heeft
datzelfde verzoek al als `verzoek`, uit `fetchOpenVerzoek()`, en geeft
`verzoek !== null` door. ⚠️ De RPC vraagt daarnaast dat de groep niet gearchiveerd
is en dat de eigenaar nog actief lid is. In die randgevallen staat de regel er
terwijl de groep hem niet meer ziet. Dan zegt de app dus iets te veel en niet te
weinig, en dat is de veilige kant. Voor het fijnere geval zou het scherm de RPC zelf
moeten lezen, maar die geeft de eigenaar geen antwoord over zijn eigen doel.

**"Intussen beslist" en niet "in werking getreden".** Nul rijen betekent "niet meer
op `set`". Bij een doelstraf is dat ook het pad waarop het doel op tijd is afgerond
en de straf vervallen (`cancelled` door 0238 en 0280). Dan zou "in werking getreden"
iemand laten schrikken die zijn doel juist haalde. Dat is dezelfde vondst als de
security-review bij 799 deed. Quinten koos optie A: dezelfde vorm als 799.

**`trekStrafIn()` naast `trekBelofteIn()`, en geen tweede schrijfactie.** Alle drie
(`trekIn`, `trekBelofteIn`, `trekStrafIn`) delen `zetIngetrokken()`. Ze verschillen
alleen in de melding en in de vlag `beslist`. `trekIn()` blijft bestaan voor de
RLS-suite (`tests/rls/weekbelofte-scherm.test.ts`) en de melding "Dit commitment"
met hem. De app roept hem niet meer aan.

**Waar de test de naad toetst.** Er is geen testopzet die het hele doelscherm
rendert. De component is op de netwerkgrens getoetst (de Supabase-client is de enige
mock). De doorgifte `verzoek` → `uitstelLoopt` is op de bron getoetst
(`tests/beloftes/straf-intrekken.test.ts`, "de naad"). Dat is een toets op een plek
(regel 18 vraag 4), en dat is hier gekozen bij gebrek aan een renderbare route. Met
de hand `uitstelLoopt={false}` gezet: rood op precies die test.

**De Engelse uitstelregel** is een vertaling van de besloten Nederlandse zin: *"The
group you asked for more time will then no longer see that this goal carries a
penalty."* Het woord "carries" volgt de bestaande Engelse strafregel op het verzoek
(`deadlineverzoek.straf_staat_erop`).

**De dubbele tik binnen één frame** is hier hetzelfde als bij 799 (Laag-rij daar):
`busy` zet pas na de render, maar een tweede verzoek krijgt nul rijen. Er gaat dus
geen data kapot.

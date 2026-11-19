# Een groep krijgt een positief dagbericht en geen full house — QS8-755

Besluit van de bouwsessie op QS8-755 (epic QS8-721), 19-11-2026. Migratie 0310
(wacht op Quintens backup). Oppervlak 59 in `002-domeinregel7-oppervlakken.md`.

## Wat er gebouwd is

Eén pushmelding per groep per lid per dag: *"Er is iets te vieren in {groep}."*
Geen naam van een lid, geen aantal, geen titel of niveau. Hij wordt gekozen door
`groepsdigest_voor()` (alleen `service_role`), verstuurd door de bestaande
uurjob via het keelpunt `stuur()`, en bewaakt door een trigger op
`notifications_sent`.

- **Bron:** uitsluitend `completion_approved` en `goal_completed`, van een ander
  lid, ouder dan het intrekvenster. De ontvanger kan die berichten via de chat
  al lezen; de melding voegt dus geen informatie toe, hij verplaatst het moment.
- **Uit, tweemaal:** `groepsdigest_aan()` geeft `false` (grens 1: de eerste
  uitgaande stroom naar echte mensen; aanzetten is een migratie van één regel
  door Quinten) én `profiles.notify_group_digest` is opt-in (`default false`).
- **Eén per groep per dag:** unieke index op (gebruiker, groep, `local_date`);
  de RPC geeft een groep niet terug als er die dag al een rij staat.
- **Dagplafond (onwrikbare regel 5):** hoogstens drie per gebruiker per 24 uur,
  in de RPC én in een trigger (met advisory lock), dus ook als de job iets
  vergeet te filteren.
- **Demping (QS8-752):** gedempte groep levert niets, in RPC én trigger. Slapende
  groepen, niet-actieve leden en teamgroepen (`is_teamgroep()`) ook niet.
- **Identiek in open en beschermd:** de RPC verwijst niet naar
  `groups.zichtbaarheid`; een test legt de uitvoer vóór en na het openzetten naast
  elkaar.
- **Geen nieuw type systeembericht**, dus `chat_messages_system_event_bekend`
  blijft ongemoeid. De melding gaat niet naar de chat.
- **Geen heldenstem** onder dit bericht (het gaat niet over jouw eigen werk).

## Waarom er geen full house is

Het issue vraagt om een melding "iedereen heeft zijn weekdoel gehaald". Die is
niet te bouwen zonder dat de **afwezigheid** ervan iets zegt. Drie redenen, elk
op zich genoeg:

1. **Afwezigheid is een signaal.** Komt het bericht niet, dan heeft iemand de
   week niet gehaald. Dat is domeinregel 7 vraag 1, in een open én in een
   beschermde groep, en met één API-verzoek te toetsen.
2. **Adempauze (0307) is privé.** Telt een pauzerend lid niet mee, dan verraadt
   de melding de pauze; telt het wel mee, dan komt er voor die groep nooit een
   full house en is de afwezigheid structureel.
3. **Er is geen gemeenschappelijk moment.** Weekdoelen lopen op de klok van elke
   gebruiker; "iedereen haalde het in de groepsperiode" is niet eenduidig te
   definiëren. En `chain_milestone` in `chat-schemas.ts` wijst "voltallig deze
   week" al af.

"Bijna" en "nog X te gaan" bestaan nooit (criterium 2). **Vraag voor Quinten:**
wil je een full house toch, dan alleen als één groepsbericht zonder
afhankelijkheid van wie ontbreekt — bijvoorbeeld bij elke afgeronde week van
élk lid apart celebreren, wat deze dagmelding al doet. Zonder jouw besluit
blijft het weg.

## Security-review (verwerkt)

- **Opt-in en groepsstatus ook in de database** (RPC én trigger), niet alleen in de job.
- **Minstens drie actieve leden.** In een groep van twee zou "geen melding" betekenen
  dat de ander niets goedgekeurd kreeg — het full-house-probleem in klein. **Vraag voor
  Quinten:** accepteren voor groepen van twee (dan zakt de ondergrens naar 2) of laten
  staan. Conservatief gekozen: laten staan.
- Venster ondergrens is `greatest(vorige digest, nu − 24 u)`; trigger ook bij UPDATE.
- **Uitrolvolgorde:** 0310 vóór de deploy van `notificaties` (DEPLOY.md §2.5a).
- Open: de dagmelding kiest bij meer dan drie groepen altijd dezelfde (op id); de
  groepsnaam staat op een vergrendeld scherm (opt-in).

## Critical-user (verwerkt en open)

Verwerkt: de melding opent de chat (`/groep/chat/{id}`), de goedkeurder krijgt niets over
zijn eigen klik (`actor_id`), 5 minuten marge boven het intrekvenster, titel "Goed nieuws".

**Open — moet opgelost zijn vóórdat Quinten de vlag aanzet** (de functie staat uit):
1. Geen UI-schakelaar voor `notify_group_digest`; aanzetten zonder levert nul meldingen.
2. `public/sw.js` vervangt webmeldingen van dezelfde soort (`tag: soort`): bij meerdere
   groepen blijft er één over. Bundelen of de groep in de tag.
3. Plafond telt per 24 uur en kiest groepen op id; per lokale dag en bundelen is beter.
4. Stille uren tot middernacht geven een melding om 00:30; een eindtijd ontbreekt.

## Restsignaal, benoemd

In een groep van twee betekent "geen dagmelding" dat de ander die dag geen
positieve gebeurtenis had. Dat is uit de chat zelf ook af te lezen en is geen
gemiste week (een week missen is geen gebeurtenis in de bron). Het zou pas
zwaarder worden als een tegenslagtype aan de allowlist komt: de allowlist is een
register in een functielichaam (`registerdrift:controle`) en een test legt hem
naast `GROEPSDIGEST_GEBEURTENISSEN`.

## Aannames (niet gemeten of niet beslist)

- Digestuur 19:00 lokaal, verschoven bij stille uren; plafond in rollende 24 uur.
- De groepsnaam op een vergrendeld scherm is acceptabel (staat geen persoon in).
- De UI-schakelaar voor `notify_group_digest` is **bewust niet** gebouwd: een
  schakelaar voor iets dat uit staat liegt tegen de gebruiker. Vervolgissue,
  samen met het moment waarop Quinten de vlag aanzet. ⚠️ `profiel.tsx` toont
  schakelaars met `!== false`; voor deze standaard-uit-kolom moet dat `=== true`.
- `src/lib/database.types.ts` kent de kolom en de RPC pas na `npm run types:db`
  tegen een database die 0310 heeft.

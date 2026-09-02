# Lessen uit GoalBuddies — wat dit project niet opnieuw hoeft te leren

> GoalBuddies is het eerste project waarin Quinten met Claude Code als enige
> implementer een product bouwde: 148 migraties, ruim dertig controlescripts,
> zeven reviewagents en een reviewdossier van driehonderd regels. Dit document
> is de destillatie van wat daar mis ging en wat het kostte — als regels die
> hier vanaf dag één gelden, met per les wat hij voor Luz de Luna Lera betekent.
>
> **Waarom een apart document en niet "gewoon CLAUDE.md":** CLAUDE.md zegt hoe
> je werkt; dit zegt waaróm. Wie een regel wil schrappen, leest eerst hier wat
> hij gekost heeft.
>
> ⚠️ **De sorteerregel die je bij elke nieuwe les moet toepassen.** Een les werkt
> als tekst als hij een **beslissing** raakt die je bewust neemt. Een les die een
> **reflex** moet onderbreken werkt niet als tekst — die lees je niet op het
> moment dat je het commando intikt. Reflexlessen horen in gereedschap: een
> controle, een test, een `.gitattributes`. Schrijf je iets nieuws op, vraag dan
> eerst: kan dit een controle worden in plaats van een zin?

---

## A. Werkwijze en documenten

1. **Drie documenten die dezelfde stand beschrijven, lopen uiteen — vijf keer op
   één dag.** Twee daarvan ontstonden tijdens het bijwerken van diezelfde
   documenten. Daarom: één feit, één eigenaar, en elders een verwijzing.
   `npm run docs:controle` bewaakt de feiten die een patroon hebben; voor de rest
   geldt: **werk je iets bij, grep dan op dat feit in alle overdrachtsdocumenten.**
   → Hier: `CLAUDE.md` bezit de regels, `WERKVOORRAAD` de stand, `VOLGENDE-SESSIE`
   de startprompt, het PRD het product — inclusief de prijs en de doelen.

2. **Eén branch per issue, met de naam die Linear voorstelt.** Een branch met acht
   issues en een zelfbedachte naam koppelde nergens aan, en alle acht statussen
   moesten met de hand. Raakt je werk meerdere issues: meerdere branches.

3. **Werk landt via een PR met een merge-commit, niet met een squash.** De
   commitberichten dragen het waarom; squashen slaat dat plat.

4. **Draai de héle poort en niet een greep eruit.** Een PR ging rood omdat er
   vóór de push vier van de tweeëntwintig controles gedraaid waren. "Ik heb de
   poort gedraaid" is anders een inschatting van een mens over zijn eigen werk.
   → Hier: `npm run poort`, en elke `*:controle` in `package.json` draait vanzelf mee.

5. **Een controle zonder database of sleutel is niet groen maar ongemeten.** Een
   script dat "OVERGESLAGEN" print en met exitcode 0 eindigt, telt voor elke
   poort die alleen naar de exitcode kijkt als geslaagd. De poort deelt daarom
   in drieën: groen, rood, ongemeten — en faalt op de laatste twee.

6. **Lees de testteller vóórdat je commit, en draai de suite en de commit nooit
   in één commando.** De uitslag las pas achteraf; de inhoud bleek in orde, de
   volgorde niet.

7. **Vergelijk vóór een merge de SHA van de groene run met de kop van de PR.**
   Groen op een oudere commit zegt niets over wat je merget.

8. **Een issue op Done betekent niet dat een mens erbij kan.** Twee issues
   stonden afgevinkt omdat de datalaag klaar was, terwijl er geen scherm was om
   het te gebruiken. **Vraag bij elk issue: welke knop roept dit aan?**

9. **Een groene testsuite meet niet of het product te gebruiken is.** Na 1889
   groene tests, 25 controles en zeven agents liep er voor het eerst een mens
   door de app: veertien issues, vier urgent, allemaal in tien minuten te
   vinden. **Draai de flow zelf, op een telefoon, vóór je iets "af" noemt.**
   → Hier: vanaf een Instagram-link, de zelftest tot en met de mail in je inbox.

10. **Een reflexvalkuil werkt niet als tekst.** De CRLF-val stond op de lijst,
    was gelezen, en ging op één dag drie keer mis. Vervangen door
    `.gitattributes` met `eol=lf` — hier vanaf de eerste commit aanwezig.

11. **Verhuizingen zijn de gevaarlijkste beweging.** Code die naar een ander
    bestand gaat neemt zijn tests mee, en die blijven groen — want ze toetsen
    wat er in het bestand staat, niet wat het bestand beloofde. Loop bij elke
    verhuizing na welke belofte eraan hing en of die nog getoetst wordt.

12. **Een conflictmarkering overleefde een merge, een PR en een CI-run.** Elke
    controle deed zijn werk; er was geen controle die dít werk deed.
    `npm run markeringen:controle` is er nu vanaf dag één.

13. **Twee sessies die tegelijk nummers uitdelen, botsen — vier keer.**
    `migratie:nieuw` fetcht daarom zelf voordat hij telt en noemt hoe oud zijn
    beeld is. Een gereedschap dat bestaat om een botsing te voorkomen, mag zijn
    juistheid niet laten afhangen van een handeling die het zelf niet doet.

14. **Een gegenereerd blok kan niet uiteenlopen met zijn bron.** De alinea
    "migraties 0001 t/m X" gaf vier PR's op één dag een merge-conflict, twee keer
    met een verkeerd getal als uitkomst. `npm run stand` genereert hem.

## B. Tests en bewaking

15. **Elk onderdeel klopt en het geheel lekt.** Zeven keer in één week was dat de
    duurste fout, en elke keer met een groene suite ernaast: een lijst die met
    zichzelf vergeleken werd; een scrubber die de ruwe stack ernaast zette; een
    kolom met grant en policy waar niemand ooit naar kon schrijven. **Onderdelen
    zijn makkelijk te testen en naden niet, dus de naad blijft onbewaakt.**
    → Hier zijn de naden: site → n8n, n8n → Supabase, betaling → boeking,
    zelftest → AI-prompt → mail. Daar hoort een test, niet alleen aan weerszijden.

16. **Zes vragen bij elke feature die af is.** Waar knopen twee correcte
    onderdelen aan elkaar? Toetst deze test de belofte of een eigenschap van het
    onderdeel? Kan hij groen blijven terwijl de belofte breekt? Grijpt hij naar
    een plek (een letterlijke zin in een bestand) in plaats van naar de belofte?
    Is de keten ergens onderbroken terwijl elk schakeltje af is? Tilt deze
    feature een aanname van "er is er altijd precies één" naar "er kunnen er meer
    zijn"?

17. **Vraag 3 beantwoord je niet door na te denken maar door de belofte met de
    hand te breken.** Twee keer bleef een aannemelijke test groen terwijl de
    bescherming eruit was — beide keren bleek dat pas door hem echt stuk te
    maken. **Breek de grendel die de ijking noemt, niet zomaar iets:** een
    mutatie voor de hele controle bewijst alleen dat er een grendel bestaat.

18. **Een grens toets je op de grens.** Een venster van zeven dagen stond op
    acht; de test legde een schakel zestig dagen terug en was groen bij 8, 80 of
    800. Wil je een getal bewaken, dan moet er een geval aan weerszijden staan.

19. **Een controle die je niet kunt voeden, kun je niet ijken.** Een
    tekstcontrole meldde maandenlang nul terwijl er in één scherm zeven
    onvertaalde zinnen stonden. Sinds die dag heeft elk script dat een regel
    bewaakt een geëxporteerde functie en een test die hem élke vorm los
    aanbiedt — de vormen die hij moet vinden én de vormen die hij met rust moet
    laten. → Hier: `tests/scripts/` bij elk script in `scripts/`.

20. **IJk een controle juist op het moment dat hij groen wordt.** Een controle
    die nul meldt terwijl er iets staat, geeft toestemming om te stoppen met
    kijken.

21. **Een test die een gat bekrachtigt is erger dan geen test.** `z.string().url()`
    laat `javascript:` door; de test die dat als correct vastlegde is vervangen.

22. **Een fixture kan een hele tak per constructie ongetest laten.** Alle groepen
    in een suite waren van één soort, dus de andere tak kon nooit rood worden.
    **Bij elke regel die per stand varieert: is er van élke stand een fixture?**
    → Hier: flow 1 én flow 2 van het boeken; wel en niet toestemming; betaald en
    onbetaald.

23. **Zet bij elke "mag dit niet zien"-test een positieve tegenhanger.** Drie
    keer draaide een test op twee gebruikers die niets deelden, dus hij bleef
    groen als je de bescherming sloopte. De eigenaar móét het toegestane wél zien.

24. **Zonder reproductie bouw je bewijsmateriaal in plaats van een fix.** Een
    onreproduceerbaar probleem verdient een betere meting, geen gegokte
    reparatie. En: **een reproductie die je niet naspeelt tot hij de echte
    toestand is, bewijst iets anders dan je denkt.**

25. **Een reparatie die in het dossier stáát, is geen gemeten reparatie.** Een
    voorgestelde fix van dagen eerder bleek het verkeerde doel: het probleem
    was al opgelost door iets anders. Lees een voorstel als een hypothese van
    degene die hem opschreef, ook (juist) als dat jijzelf was.

26. **De grens van je testopstelling is een blinde vlek en geen achtergrond.**
    Een laag waar geen enkele test bij kon, droeg de bug die een feature vanaf
    het web onbereikbaar maakte. Vraag bij elke laag: wat draait hier waar geen
    test bij kan, en wat kost het om erbij te komen? → Hier: n8n-workflows.
    Test ze via hun webhook, niet door ze na te bouwen.

27. **Een grep is geen meting.** Een bevinding "26 bestanden niet idempotent"
    kwam uit twee greps en het waren drie regels in twee bestanden. Plat je
    tekst en knip je commentaar weg voordat je een patroon telt; lees de hele regel.

28. **Een tijdstempel die een gereedschap zélf schrijft, bewijst niet dat het
    gereedschap geslaagd is.** Git maakt `FETCH_HEAD` aan zodra hij begínt, ook
    als hij de remote nooit bereikt. Lees hem vóór de poging, of meet iets anders.

## C. Database en autorisatie

29. **De regel is pas afgedwongen als de database hem afdwingt.** De schermen
    hielden een privacyregel netjes aan terwijl één `GET` de hele lijst gemiste
    weken van elk groepslid gaf. Bij elke policy die iemand iets laat lezen:
    welke kolommen zitten in die rij, en zegt een daarvan iets dat niet mag?
    → Hier: wat mag `anon` van een zelftest-rij lezen? Alleen wat de bedankpagina nodig heeft.

30. **RLS kan geen kolommen beperken.** Zeven keer misgegaan. Is de eis "deze
    kolom niet lezen of wijzigen", dan heb je een kolomgrant, een view met
    expliciete kolomlijst of een rijbeperking nodig.

31. **`revoke ... from public` is in Supabase niet "van iedereen".** Elke nieuwe
    functie en tabel wordt standaard uitgedeeld aan `anon`, `authenticated` én
    `service_role`. Wie `public` en `anon` afhaalt, houdt precies de rol over
    waaronder elke ingelogde gebruiker draait. Een definer-functie stond zo live
    open. **De vorm is `from public, anon, authenticated`.**

32. **Een ontbrekende policy weigert stil, niet luid.** Bij UPDATE en DELETE
    filtert RLS de rijen weg; de client krijgt 204 en een ongewijzigde tabel.
    Een test die op een foutcode rekent, wordt daar groen zonder iets te
    bewijzen. **Toets de uitkomst: staat de rij er nog?**

33. **Een redenering die klopt zolang een tabel leeg is, is geen bescherming.**
    Vraag bij elke tabel die van leeg naar gevuld gaat: wat betekent een
    ontbrekende rij nu?

34. **Een vergelijking met een mogelijk lege waarde is in SQL geen controle.**
    `x <> y` is een derde antwoord zodra één kant leeg kan zijn, en dat gedraagt
    zich in een `if` als "niet waar". Zo gaf een definer-functie andermans data
    terug. **Begin elke `security definer`-functie met `if auth.uid() is null`.**
    Goedkope test: roep hem aan als `service_role`.

35. **In een definer-RPC overleeft niets een `raise exception`.** PostgREST draait
    elke RPC in zijn eigen transactie; gooien rolt alles terug, inclusief de
    teller van je rate limiter. Zet blokkades in de happy path en geef een
    resultaat terug.

36. **Zoek eerst álle routes naar het effect, dan pas dicht je er één.** Eén gat
    kostte vier migraties omdat elke reparatie te smal was: wijzigen dicht,
    aanmaken, verwijderen en doorschuiven niet. Schrijf op wélk effect je wilt
    voorkomen en zoek élke bewerking die het kan bereiken. → Hier: "een boeking
    zonder bevestigde betaling" — via de webhook, via een herhaalde webhook, via
    de bedankpagina, via een handmatige rij.

37. **Zoek bij een predicaat ook de functies die het overschrijven.** Een
    gerepareerd predicaat werd door een tweede functie met de oude logica
    ongedaan gemaakt. `grep` op de tabelnaam, niet op de functienaam.

38. **Een CHECK toevoegen zonder de schrijvende functie mee te wijzigen breekt
    stil.** De tabel was leeg, dus de migratie slaagde; de functie viel om zodra
    de feature aanging. Zoek bij elke nieuwe CHECK de functies die in die tabel
    schrijven.

39. **Een kolomgrant intrekken breekt de app stil.** Typecheck en lint blijven
    groen. Zoek na een revoke elke `.insert(` en `.update(` op die kolom, ook in
    tests — en schrijf de tegentest: het normale geval werkt nog.

40. **Idempotent betekent: tegen de toestand waarvoor de migratie geschreven
    is.** Een migratie die bij herhaling een oudere definitie terugzet van iets
    dat een latere migratie veranderde, hoort om te vallen — die weigering is de
    beveiliging. Wat wél weg moet: `create function` zonder `or replace`,
    `create index` zonder `if not exists`.

41. **De repo en wat er draait lopen uit elkaar in béide richtingen.** Een
    reviewbevinding las een migratiebestand waar de gedeployde functie strenger
    was; andersom draaide er productiecode die op geen enkele branch stond.
    **`pg_get_functiondef()` is de waarheid; een bestand is een momentopname.**
    → Hier geldt dat dubbel: een n8n-workflow die in de instantie is aangepast en
    niet geëxporteerd, bestaat voor de repo niet. Export is de bron; deploy is
    een kopie. Deploy nooit vanuit een werkboom met ongecommitte wijzigingen.

42. **Een migratienummer is van `main` en niet van je branch.** Reserveer nooit
    een nummer vooruit; kies het bij het mergen en haal `main` vlak daarvoor op.
    Hernummeren doe je met `migratie:hernummer`, want `sed` laat de kopregel staan.

43. **Geen persoon in een jsonb-veld.** Een uuid in jsonb heeft geen foreign
    key, dus `on delete set null` raakt hem niet en een verwijderd account blijft
    afleidbaar. Regel stond in een document en werd vier dagen later opnieuw
    overtreden; nu een controle.

44. **`on delete set null` sneuvelt stil op een onveranderlijkheidstrigger.** De
    referentiële actie is zelf een UPDATE; een trigger die de kolom terugzet
    draait hem in dezelfde bewerking terug, zonder fout. Kostte een AVG-belofte.

45. **Index op elke foreign key.** Postgres doet dat niet vanzelf, en het breekt
    niets zolang de tabel leeg is. Vijftien stonden er open toen er één in het
    dossier stond.

46. **Zestig verbindingen voor de hele gratis tier.** Alles loopt via PostgREST;
    niemand opent zelf een pool. Dat klopt vandaag door de afwezigheid van iets,
    en dat is stil kwijt te raken — vandaar `verbindingen:controle`.

47. **Nooit `REPLICA IDENTITY FULL` op een tabel in de realtime-publicatie.**
    Supabase past op DELETE geen RLS toe; met `FULL` gaat de hele oude rij naar
    elke abonnee. → Hier: gebruik realtime niet voordat je dit gelezen hebt.

## D. Externe koppelingen en omgeving

48. **`fetch()` verwerpt alleen bij een netwerkfout — een 403 is een geslaagde
    belofte.** Een transportlaag rapporteerde "verstuurd" terwijl de ontvanger
    weigerde. Geef altijd de statuscode terug, en stuur één echte envelope
    voordat je gelooft dat het werkt. → Hier: mailkanaal, betaalprovider,
    Google Agenda, de AI-aanbieder.

49. **Alles met een publieke prefix zit in de bundel die de browser downloadt.**
    Een geheim dat daar belandt is publiek vanaf de eerste deploy, ook als je het
    daarna weghaalt. Valideer env vars bij het opstarten, niet halverwege een
    gebruikersactie. Een secret-scan vóór de upload, en die moet minstens één
    keer rood zijn geweest.

50. **`engines` dat iets belooft wat de code niet houdt.** Node 20 stond
    beloofd, de code vroeg 22; lokaal draaide alles op 22. Een tweede, schone
    omgeving vond het binnen een minuut — daar is CI voor: niet om hetzelfde te
    bevestigen, maar om te zien wat je machine stilzwijgend voor je oploste.

51. **Een aannemelijke diagnose is geen meting.** "Ongeveer dertig aanmeldingen
    per uur" stond weken in een document en was een burstlimiet per IP. Op de
    verkeerde diagnose was de logische oplossing (een tweede project) nutteloos.
    **Het faalbeeld van een uitgeputte limiet ziet eruit als een kapotte policy.**

52. **Een gereedheidscontrole moet vragen of het jóuw proces is.** "Er antwoordt
    iets op de poort" was een oude instantie op een weggegooide database; 29
    fouten die geen fout waren. Meten of er iets antwoordt is niet hetzelfde als
    meten of het klopt.

53. **Een opruimstap die stil mislukt, en een suite die daarna groen is op oude
    data.** Zeventien schone runs bewezen niets. Een mislukte opruiming hoort
    hard te falen.

54. **Zonder de juiste token kan een sessie niet fatsoenlijk deployen**, en met
    de hand overtypen kostte vijf verkeerde tekens en een halfuur zoeken. Zet de
    variabelen in de omgeving vóór je aan een deploy begint, en gebruik
    gereedschap dat van schijf leest.

## E. Tekst en taal

55. **Geen emoji in app-tekst; de gebruiker mag ze overal typen.** Daarom mag
    geen enkele plek gebruikerstekst afkappen met `.length`, `charAt(0)` of
    `.slice(0, n)`: een emoji kost twee UTF-16-eenheden en een gezinsemoji elf.
    Tel in codepunten — dat is ook wat Postgres telt.

56. **Zod's `.max()` en Postgres' `char_length` zijn niet dezelfde grens.** Bij
    een ondergrens gaat het verschil de gevaarlijke kant op: de client laat door
    wat de database weigert.

57. **Een module-constante met vertaalde of berekende tekst bevriest op
    importtijd.** Zestien keer in één project, twee ervan geïntroduceerd in
    dezelfde sessie waarin de regel werd opgeschreven. Dat is een lint-regel,
    geen kwestie van opletten.

58. **Een systeembericht is een onveranderlijke kopie die de autorisatie
    overleeft waaronder hij gemaakt is.** Noem de persoon en de gebeurtenis, nooit
    een inhoud die later privé kan blijken. → Hier: de zelftest-samenvatting in
    Eviannes agendanotitie is zo'n kopie.

## F. Beslissingen

59. **Eén grens in plaats van een lijst.** De lijst met zeven dingen die niet
    zonder toestemming mochten, hield vaker op dan hij beschermde. Nu: stop
    alleen als de keuze bepaalt wat een mens beloofd of in rekening gebracht
    wordt, of als de handeling onomkeerbaar vernietigend is. Al het andere: kies
    de conservatiefste optie die het werk áf maakt, bouw door, schrijf de aanname
    op. Zie `docs/decisions/001-beslisbevoegdheid.md`.

60. **"Herbevestigen vóór X" in een beslisdocument is goud waard — als iemand
    het leest.** Een besluit met de aantekening dat het opnieuw bekeken moest
    worden vóór een latere feature, ging bij die feature inderdaad om. Schrijf
    zo'n aantekening op zodra een besluit aan iets toekomstigs hangt.
    → Hier: "de spiegel alleen per mail" hangt aan de aflevering; "Fresha
    tijdelijk" hangt aan de eigen boekingsmodule.

61. **Een bevinding die je als Laag wegzet, zegt wanneer hij terugkomt.** Een
    terecht lage bevinding werd vier dagen later een scoregat door wat erop
    gebouwd werd. Elke Laag-rij draagt `**Wordt zwaarder als:** …`; de
    voorwaarde, niet de datum. `npm run review:controle` bewaakt het.

62. **Verifieer elke bevinding van een agent zelf.** De zwaarste bevinding van
    een ronde was aantoonbaar onjuist terwijl twee andere kritieke wél klopten.

63. **Reviewagents naar risico, niet naar schema.** Beveiliging direct bij alles
    wat auth, data, geld of een nieuw zichtbaar oppervlak raakt — die
    bevindingen stapelen, worden gekopieerd en de database is nu nog leeg, wat
    tijdelijk is. Code- en gebruikersreview één keer per milestone, samen.
    → Hier komt de privacyreviewer bij de directe groep.

64. **Een lijst waarvan een deel al opgelost is, kost de lezer het vertrouwen in
    de rest.** Drie rijen stonden als Hoog open terwijl ze maanden gerepareerd
    waren. Schrijf een reparatie in de rij zelf op, met een vinkje en het
    nummer; meet de gedeployde stand voordat je een rij gelooft.

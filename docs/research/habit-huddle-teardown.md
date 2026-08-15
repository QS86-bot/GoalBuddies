# Habit Huddle — teardown

> Bron: habithuddle.com (landing, /whats-new p1–p3, /habit-genie, /accountability-group-app),
> app-store listings, changelog. Onderzocht 15-08-2026 via Firecrawl.
> Doel: begrijpen wélke mechanismen hun retentie dragen, en welke daarvan
> overdraagbaar zijn naar GoalBuddies (dat een fundamenteel andere tijdseenheid heeft).

## 1. Wat Habit Huddle is

Een sociale habit-tracker rond kleine groepen ("huddles"). Eén gewoonte per huddle.
Iedereen doet een **dagelijkse check-in**. Elk lid houdt een eigen streak; de groep
bouwt samen een **Checkin Chain** — één "link" per lid dat die dag incheckt.

Web-first (start op web, app is optioneel), plus iOS, Android én een Discord-bot.
Live cijfers van hun eigen landing: ~40.7k check-ins totaal, 557 actieve huddles,
langste lopende chain 332 links. Dat is een klein maar echt product.

Prijs: gratis tier is ruim. Builder $5/mnd (jaarlijks $60), Champion $9/mnd ($108).
Ze hanteren een "price ladder": prijzen stijgen over tijd, bestaande abonnees houden
hun prijs zolang die actief blijft.

## 2. De mechanismen die er echt toe doen

Gerangschikt naar wat ik ervan wil overnemen.

### 2.1 Floor & Ceiling (hun "Flex Checkins") — ⭐ belangrijkste vondst

Elke gewoonte heeft twee niveaus:
- **Floor** — de versie die je op je slechtste dag nog haalt ("vul een glas met water").
- **Ceiling** — de versie voor je beste dag.

**Beide tellen als volledige check-in.** De streak breekt niet omdat je een matige
dag had. Hun eigen framing: *"Step on the floor and the day fully counts. Burst
through the ceiling when you have more. Both are wins."*

Dit is de kern van waarom hun streaks lang worden (161, 284, 407, 461, 638 dagen op
hun eigen feed). Het verwijdert de alles-of-niets-val die de meeste trackers doodt.

### 2.2 Vergevingsmechanismen — de streak dient de gebruiker, niet andersom

| Mechanisme | Werking |
|---|---|
| **Night Owl Checkins** | Tot 08:00 telt gisteren nog. Je deed het om 23:58 en vergat te loggen — geen ramp. |
| **Streak Freezes** | Eén gemiste dag verbruikt een freeze i.p.v. je streak. Je verdient er één per 30 check-in-dagen. Je krijgt je eerste als cadeau na je tweede check-in. |
| **Vacation Mode** | Tot 14 dagen pauze, streak wacht. Je blijft op de leaderboards staan. |
| Timezone-correct | Streak-bescherming draait op de **lokale klok van de gebruiker**, niet van de groep. Eén freeze dekt je hele dag over alle huddles. |

Ze hebben dit expliciet als ontwerpprincipe opgeschreven: *"the floor, freezes, and
night owl checkins exist so the streak serves you, never the other way around."*

### 2.3 Sociale architectuur — ontworpen om schaamte te vermijden

Dit is subtiel en makkelijk over het hoofd te zien:

- **Misses worden nooit getoond.** De feed bevat alleen positieve signalen: check-ins,
  applaus, replies. Er is geen publieke "X heeft gefaald"-post.
- **Wie afhaakt gaat automatisch inactief** en blokkeert de "full house" van de groep
  niet meer. Iemands vertrek wist jouw voortgang niet uit.
- **Stille huddles gaan slapen** na 30 dagen zonder check-ins: één afscheidsbericht,
  daarna stilte. Eén check-in wekt hem weer.
- **Iedereen vormt zijn eigen gewoonte.** De chain telt *opdagen*, niet prestatie —
  dus verschillende niveaus in één groep werkt.

Netto-effect: de groep is een plek waar je alleen maar wint. Dat is waarom kleine
vriendengroepen het volhouden. Elk mechanisme dat schaamte introduceert, doodt een
groep van 3.

### 2.4 De groep duwt zichzelf — niet één persoon

*"I don't want to be the streak cop."* → dagelijkse race reports, reminders en de
Checkin Chain doen het duwwerk. De leden hoeven alleen te juichen. Dit is precies
het faalpunt dat op hun /accountability-group-app staat: *"Accountability fails when
it depends on one person remembering to ask."*

### 2.5 Seasons

Maandelijkse standen met recap en reset. Expliciet ontworpen tegen: *"Week 3 is where
groups go quiet."* Recap post om 08:00 in de tijdzone van de huddle, met de standen
en de winnaars getagd. Cadans is instelbaar per groep.

### 2.6 Habit Genie (hun AI-onboarding)

Zes vragen → drie gewoonten. Wat het slim maakt is welke vragen:
wie wil je worden, waar wil je focussen, **hoeveel tijd heb je écht**, en
**wat laat jouw gewoonten normaal gesproken stuklopen**. Ze zeggen letterlijk:
*"Genies can't work with wishful thinking."*

De output is niet een lijstje taken maar per gewoonte: een floor, een ceiling en een
**cue verankerd in je bestaande routine**. Je activeert er één; de andere twee wachten
in je library. Bewust anti-overcommitment.

Genie is ook een **gratis, uitlogd-bruikbare tool op de marketingsite** — top of funnel.

### 2.7 Identiteit vóór taak

Elke gewoonte draagt twee vragen: *"wat wil ik bereiken?"* (Goal) en
*"wie wil ik worden?"* (Identity). Rechtstreeks uit Atomic Habits, maar ze hebben het
tot de kop van de habit-card gepromoveerd, niet weggestopt in een veld.

### 2.8 Bonus Habit Stacks

Je stapelt extra gewoonten bovenop je hoofdgewoonte, elk met eigen floor en ceiling.
Lost op: *"when the habit gets easy, most apps go stale."* De gewoonte groeit mee.

### 2.9 Library & kopieerbare habits

Kant-en-klare gewoonten mét floor en ceiling. Publieke habit-pagina's (inclusief de
échte workout-gewoonte van de oprichter, met playbook). Je kunt elke gewoonte die je
ziet kopiëren en zelf starten. Sterke cold-start-oplossing én SEO-oppervlak.

### 2.10 Frictieloze toetreding — de details

Uit hun changelog blijkt hoeveel werk hier in zit:
- Check-in-, huddle- en habit-links openen **voor bezoekers zonder account**. Je ziet
  het echte ding, niet een login-muur. Signup dropt je precies waar je heen wilde,
  huddle al joined.
- Invite-links werken ook voor mensen die **al** een account hebben (was een bug —
  en dus stille kill van elke uitnodiging).
- Link previews unfurlen in Discord met naam en ledenaantal.
- Eén "Join This Huddle"-knop; open huddles laten je direct binnen, exclusive huddles
  sturen een verzoek.
- Vond je een habit vóór signup? De huddle wacht op je zodra je account bestaat.

### 2.11 Overig

- **Photo Checkins** — bewijs bij de check-in.
- **Exclusive Huddles** — zichtbaar voor iedereen, toetreding op uitnodiging/goedkeuring.
- **Achievements** met punten; **Style Studio** met confetti-packs, thema's, avatar-ringen
  en profile flair (cosmetische monetisatie).
- **Leaderboards**, **Hall of Fame**, **Community** (publieke huddles), globale feed.
- **Analytics** over 30/90/365/all-time — hun framing: ijs één graad van smelten ziet er
  nog steeds bevroren uit.
- **Discord- en Telegram-bot** — mensen doen mee vanaf waar ze al zijn.
- **Changelog als marketing**: "73 updates in de laatste 30 dagen", RSS-feed, en een
  "submit an idea"-formulier waarvan de inzendingen soms dezelfde dag verschijnen.

## 3. Waar Habit Huddle níét in voorziet

Dit is het gat waar GoalBuddies in zit:

1. **Geen doelen met een deadline.** Alles is een oneindige dagelijkse gewoonte. Er is
   geen "af", geen einddatum, geen mijlpaal.
2. **Geen opsplitsing van iets groots.** De Genie maakt kleine gewoonten, geen roadmap
   van hier naar "website live in 12 weken".
3. **Geen peer-goedkeuring.** Check-ins zijn zelfrapportage. Applaus, geen verificatie.
4. **Geen commitment device.** Ze noemen "accountability contracts, no money deposits" —
   maar er is geen beloning/straf-mechaniek met consequentie.
5. **Alles draait op een dagelijkse kalenderdag.** Geen instelbare week-start,
   geen wekelijkse cyclus als eenheid.

## 4. Het overdraagbaarheidsprobleem (belangrijkste conclusie)

**De hele retentiemotor van Habit Huddle is de dagelijkse check-in.**
Dat is hun engagement-hartslag: 7 momenten per week, elk 10 seconden, elk met sociale
beloning.

GoalBuddies zoals beschreven in de PRD heeft een **wekelijkse** cyclus. Dat is
**één engagement-moment per week**. Zonder aanpassing importeer je Habit Huddle's
mechanismen (streaks, chains, seasons, freezes) in een ritme waarin ze niet kunnen
werken — een streak van 6 betekent zes wéken, en tussen twee momenten zit zeven dagen
stilte waarin de app irrelevant wordt.

Dit is het centrale ontwerpprobleem dat het productvoorstel moet oplossen.
Zie `docs/PRODUCT-PROPOSAL.md`, sectie "De dagelijkse hartslag".

## 5. Wat we bewust *niet* overnemen

- **Publieke huddles / globale feed / Hall of Fame.** De PRD zet publieke, ontdekbare
  groepen expliciet buiten scope. Bij persoonlijke doelen (omzet, studie, gezondheid)
  is publieke zichtbaarheid bovendien een privacyrisico dat bij gewoonten niet speelt.
- **Style Studio.** Leuk, maar het is monetisatie-oppervlak voor een product dat al
  werkt. Niet in MVP.
- **Discord-bot.** Hun kanaal, niet het onze — de doelgroep uit de PRD (ondernemers,
  freelancers, studenten) zit niet primair op Discord. Zie voorstel voor het
  Nederlandse equivalent van dit idee.
- **Eén gewoonte per huddle.** Bij ons heeft elk groepslid een *eigen, ander* doel.
  Dat is een fundamenteel andere groepsvorm en het uitgangspunt van de PRD.

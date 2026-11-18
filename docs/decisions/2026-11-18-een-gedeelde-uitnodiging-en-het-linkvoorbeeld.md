# Een gedeelde uitnodiging en het linkvoorbeeld (QS8-706)

**Besluit.** De gedeelde tekst noemt de afzender (weergavenaam), GoalBuddies en wat er bij het
openen gebeurt, met een onderwerpregel; de groepsnaam en de code staan er niet in (de link draagt
de code). De webexport zet voor elke route dezelfde Open Graph- en Twitter-tags: het 512-pixel-logo
als absolute URL, "GoalBuddies" en een algemene zin.

**Waarom.** Een crawler van WhatsApp of een mailprovider cachet de tags publiek en onherroepelijk
(domeinregel 7 en 4). `linkvoorbeeldTags(appUrl)` kent daarom alleen het adres van de app.
`tests/beloftes/een-linkvoorbeeld-draagt-geen-groep.test.ts` bewaakt dat op zes grendels, elk met
een eigen mutatie rood gemaakt.

**Aanname, voor Quinten.** De groepsnaam is ook uit het bericht dat de afzender zelf verstuurt
gehaald (opdracht van de orchestrator). Wie de link opent ziet de groep sowieso (`beheer.link_uitleg`),
dus terugzetten in tekst en onderwerp is een productkeuze die niets aan het linkvoorbeeld verandert.

**Grenzen.** De tags gelden voor de hele statische export, ook voor routes die geen uitnodiging zijn;
de beschrijving is daarom algemeen. Het logo is vierkant, dus `summary` en geen grote kaart. De pagina
zelf (`/uitnodiging/<code>`) toont voor wie hem opent nog steeds wat hij toonde.

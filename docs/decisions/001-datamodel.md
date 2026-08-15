# 001 — Datamodel en RLS

| | |
|---|---|
| **Status** | ✅ Vastgesteld 15-08-2026 — migraties kunnen |
| **Datum** | 15-08-2026, herzien na review dezelfde dag |
| **Linear** | QS8-19 |
| **Volgt uit** | `PRD-accountability-app.md` §4.3 · `docs/PRODUCT-PROPOSAL.md` · `CLAUDE.md` domeinregels |

> `CLAUDE.md`: *"Datamodel eerst, volledig, met RLS. Op papier vóór in code."*
> Dit is dat papier. Onderaan staan zes punten waarop ik expliciet je oordeel wil.

---

## 1. De vijf principes die het model vormen

Alles hieronder volgt uit deze vijf. Wijk je van een principe af, dan is dat een bewuste
uitzondering die in dit document wordt opgeschreven.

1. **Twee klokken.** Elke tijdgebonden rij draagt óf een `cycle_start_date` (persoonlijke
   cyclus) óf een `group_period_start` (huddledag). Nooit allebei, nooit een kale
   timestamp waaruit de week afgeleid moet worden.
2. **Gebeurtenissen zijn append-only.** Voltooiingen, goedkeuringen, punten, weekpassen
   en commitment-mutaties worden nooit overschreven. Corrigeren gebeurt met een nieuwe rij.
3. **Afgeleide waarden zijn cache, geen waarheid.** Reeksen en totalen staan in
   cachetabellen die volledig herbouwbaar zijn uit de gebeurtenissen. Raakt de cache
   ontregeld, dan is dat een rekenfout, geen dataverlies.
4. **RLS is de autorisatie.** De UI mag nooit de enige plek zijn waar een regel leeft.
   Wat een gebruiker niet mag zien, komt niet uit de database.
5. **Falen is nooit publiek** (domeinregel 7). Dit is óók een datamodelvraag: rijen die
   tegenslag beschrijven staan in tabellen zonder groepszichtbaarheid.

---

## 2. Tabellen

### 2.1 Identiteit

```sql
profiles
  id                uuid PK REFERENCES auth.users(id) ON DELETE CASCADE
  display_name      text NOT NULL
  avatar_url        text
  week_start_day    smallint NOT NULL DEFAULT 1   -- 0=zondag … 6=zaterdag
  tz                text NOT NULL DEFAULT 'Europe/Amsterdam'  -- IANA
  reminder_time     time
  reminder_enabled  boolean NOT NULL DEFAULT true
  reminder_tone     text NOT NULL DEFAULT 'gentle'  -- gentle | firm
  created_at        timestamptz NOT NULL DEFAULT now()
  updated_at        timestamptz NOT NULL DEFAULT now()

  CHECK (week_start_day BETWEEN 0 AND 6)
```

Aangemaakt door een trigger op `auth.users` (PRD 1.1). `tz` en `week_start_day` zijn
samen de invoer van `currentUserCycle()`; niets anders bepaalt de persoonlijke week.

### 2.2 Doelen

```sql
goals
  id                       uuid PK
  owner_id                 uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  title                    text NOT NULL
  description              text
  category                 text NOT NULL          -- business | study | other
  identity_statement       text                   -- "wie word ik als dit lukt?"
  target_date              date NOT NULL
  available_hours_per_week numeric(4,1)           -- uit het Doelcoach-interview
  max_points               integer NOT NULL DEFAULT 0
                             -- ⚠️ afgeleid: SUM(points_ceiling) over de weekdoelen
  status                   text NOT NULL DEFAULT 'active'
                             -- active | completed | archived | missed
  risk_status              text NOT NULL DEFAULT 'on_track'
                             -- on_track | watch | behind | unreachable
  risk_reason              jsonb                  -- uitlegbare onderbouwing
  risk_computed_at         timestamptz
  created_at               timestamptz NOT NULL DEFAULT now()
  updated_at               timestamptz NOT NULL DEFAULT now()

  CHECK (category IN ('business','study','other'))
  CHECK (status IN ('active','completed','archived','missed'))
  CHECK (risk_status IN ('on_track','watch','behind','unreachable'))
```

**`target_date` staat hier, maar wijzigingen leven in `goal_events`.** De huidige deadline
is een gewone kolom; de geschiedenis van verzettingen is append-only. Zonder dat kan de
Risico-radar niet eerlijk rekenen — een gebruiker die zijn deadline drie keer verzet
"loopt op koers" volgens de kolom, en dat is precies de zelfmisleiding die we willen zien.

```sql
goal_events                    -- append-only audit
  id          uuid PK
  goal_id     uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE
  actor_id    uuid NOT NULL REFERENCES profiles(id)
  event_type  text NOT NULL   -- created | deadline_moved | scope_reduced
                              -- | milestone_dropped | archived | completed
  old_value   jsonb
  new_value   jsonb
  created_at  timestamptz NOT NULL DEFAULT now()

goal_interviews                -- de zes antwoorden van de Doelcoach
  id          uuid PK
  goal_id     uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE
  answers     jsonb NOT NULL   -- {measurable, identity, deadline_why,
                               --  hours_per_week, already_done, past_failure}
  created_at  timestamptz NOT NULL DEFAULT now()
```

Een tabel in plaats van kolommen op `goals`, omdat het interview herhaald kan worden bij
een herplanning en we het oude antwoord dan willen behouden. `hours_per_week` wordt
gedenormaliseerd naar `goals.available_hours_per_week` omdat de Risico-radar er per query
bij moet.

```sql
milestones
  id           uuid PK
  goal_id      uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE
  title        text NOT NULL
  description  text
  target_date  date
  order_index  integer NOT NULL
  status       text NOT NULL DEFAULT 'todo'   -- todo | done | dropped
  ai_generated boolean NOT NULL DEFAULT false
  completed_at timestamptz
  created_at   timestamptz NOT NULL DEFAULT now()

  UNIQUE (goal_id, order_index) DEFERRABLE INITIALLY DEFERRED
```

`DEFERRABLE` omdat herordenen een reeks updates in één transactie is.

### 2.3 Weekdoelen — het hart van het model

```sql
weekly_goals                   -- het plan
  id                uuid PK
  goal_id           uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE
  milestone_id      uuid REFERENCES milestones(id) ON DELETE SET NULL
  title             text NOT NULL
  floor_text        text            -- optioneel (review: NEE op verplicht)
  ceiling_text      text
  points_ceiling    integer NOT NULL DEFAULT 2   -- volle week
  points_floor      integer NOT NULL DEFAULT 1   -- vloer gehaald
  points_miss       integer NOT NULL DEFAULT -1  -- ⚠️ minpunt
  cycle_start_date  date NOT NULL   -- uit currentUserCycle(), nooit handmatig
  cycle_index       integer NOT NULL
  status            text NOT NULL DEFAULT 'todo'
                      -- todo | pending | approved | missed | carried | excused
  ai_generated      boolean NOT NULL DEFAULT false
  created_at        timestamptz NOT NULL DEFAULT now()

  CHECK (status IN ('todo','pending','approved','missed','carried','excused'))
  CHECK (points_ceiling >= points_floor)
```

`floor_text` is optioneel. Een weekdoel zonder vloer kent maar twee uitkomsten: gehaald
(`points_ceiling`) of niet (`points_miss`). Met een vloer komt daar de tussenstand bij.
De UI blijft de vloer wél actief aanmoedigen — het idee is de moeite waard, alleen niet
als verplicht formulierveld.

`excused` is de status voor een week die onder een adempauze valt: die telt niet mee,
niet positief en niet negatief.

`status` is **afgeleid** van `completions` + `completion_approvals`, maar wordt hier
gecachet omdat elk lijstscherm erop filtert. Bijgewerkt in dezelfde transactie als de
gebeurtenis die hem veroorzaakt. Een herstelscript kan de kolom volledig herbouwen.

```sql
completions                    -- de gebeurtenis, append-only
  id               uuid PK
  weekly_goal_id   uuid NOT NULL REFERENCES weekly_goals(id) ON DELETE CASCADE
  user_id          uuid NOT NULL REFERENCES profiles(id)
  achieved_level   text NOT NULL           -- floor | ceiling
  note             text
  attachment_url   text                    -- fase 2
  cycle_start_date date NOT NULL
  submitted_at     timestamptz NOT NULL DEFAULT now()
  superseded_by    uuid REFERENCES completions(id)   -- correctie wijst hierheen

  CHECK (achieved_level IN ('floor','ceiling'))
```

Corrigeren gebeurt door een nieuwe rij in te voegen en `superseded_by` op de oude te
zetten (domeinregel 6). De actieve voltooiing is die met `superseded_by IS NULL`.

```sql
completion_approvals
  id              uuid PK
  completion_id   uuid NOT NULL REFERENCES completions(id) ON DELETE CASCADE
  approver_id     uuid NOT NULL REFERENCES profiles(id)
  subject_id      uuid NOT NULL REFERENCES profiles(id)  -- eigenaar, gedenormaliseerd
  group_id        uuid NOT NULL REFERENCES groups(id)
  status          text NOT NULL           -- approved | more_info
  comment         text
  created_at      timestamptz NOT NULL DEFAULT now()

  UNIQUE (completion_id, approver_id)            -- geen dubbele stem
  CHECK  (approver_id <> subject_id)             -- ⚠️ nooit jezelf, op DB-niveau
  CHECK  (status IN ('approved','more_info'))
```

`subject_id` staat hier gedenormaliseerd puur om de `CHECK` mogelijk te maken. Een
`CHECK` kan geen subquery doen, dus de eigenaar moet op de rij zelf staan. Een trigger
vult hem en bewaakt dat hij klopt met de voltooiing. **Dit is de belangrijkste constraint
in het hele schema** — samen met de RLS-policy is dit domeinregel 3.

```sql
daily_moves                    -- de Dagzet
  id             uuid PK
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  weekly_goal_id uuid REFERENCES weekly_goals(id) ON DELETE SET NULL
  body           text NOT NULL
  visibility     text NOT NULL DEFAULT 'private'   -- private | group
  local_date     date NOT NULL   -- de dag in de tz van de gebruiker
  created_at     timestamptz NOT NULL DEFAULT now()

  CHECK (visibility IN ('private','group'))
```

Geen punten, geen status, geen goedkeuring — domeinregel 9. Bewust een kale tabel.

**`visibility` staat standaard op `private`** (review: standaard privé). Delen kan per
zet, met een voorkeur in instellingen voor wie standaard wil delen.

⚠️ **Eerlijk over wat dit kost.** In het voorstel (§3) noemde ik vier redenen voor de
Dagzet. Eén daarvan — *"de groepsfeed heeft elke dag inhoud in plaats van één piek per
week"* — vervalt grotendeels bij een privé-standaard. De andere drie blijven overeind:
een dagelijkse reden om de app te openen, vraag 1 van de weekafsluiting die zichzelf
vult, en je eigen doorlopende verslag. De Ketting draait op cyclusafsluitingen en niet op
Dagzetten, dus die raakt dit niet. De feature blijft dus zinnig, maar hij is nu vooral
een persoonlijk instrument met een deelknop, en niet meer de sociale hartslag.

### 2.4 Groepen

```sql
groups
  id               uuid PK
  name             text NOT NULL
  icon             text
  created_by       uuid NOT NULL REFERENCES profiles(id)
  invite_code      text NOT NULL UNIQUE
  invite_revoked   boolean NOT NULL DEFAULT false
  huddle_day       smallint NOT NULL DEFAULT 0    -- ⚠️ de tweede klok
  tz               text NOT NULL DEFAULT 'Europe/Amsterdam'
  evidence_policy  text NOT NULL DEFAULT 'note_required'
                     -- note_required | note_and_attachment | optional
  approval_rule    text NOT NULL DEFAULT 'any'    -- any | majority  (fase 2)
  season_cadence   text NOT NULL DEFAULT 'quarterly'
  status           text NOT NULL DEFAULT 'active' -- active | sleeping
  last_activity_at timestamptz NOT NULL DEFAULT now()
  created_at       timestamptz NOT NULL DEFAULT now()

  CHECK (huddle_day BETWEEN 0 AND 6)

group_members
  group_id   uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  role       text NOT NULL DEFAULT 'member'   -- admin | member
  status     text NOT NULL DEFAULT 'active'   -- active | inactive | paused
  joined_at  timestamptz NOT NULL DEFAULT now()
  PRIMARY KEY (group_id, user_id)

goal_group_links               -- vanaf dag één, ook al komt de UI in fase 2
  goal_id    uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE
  group_id   uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE
  linked_at  timestamptz NOT NULL DEFAULT now()
  PRIMARY KEY (goal_id, group_id)

invite_events                  -- alleen voor rate limiting
  id         uuid PK
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  group_id   uuid REFERENCES groups(id) ON DELETE SET NULL
  created_at timestamptz NOT NULL DEFAULT now()
```

`goal_group_links` bestaat vanaf de MVP hoewel PRD 5.5 fase 2 is. De koppeling
achteraf van één-op-één naar veel-op-veel migreren betekent elke groepsquery herschrijven.
De kosten van de tabel nu zijn nul; de kosten later zijn hoog.

### 2.5 Groepsritueel en gedeelde score

```sql
week_reviews                   -- de Weekafsluiting
  id                  uuid PK
  group_id            uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  group_period_start  date NOT NULL       -- uit currentGroupPeriod()
  did_text            text
  blocked_text        text
  next_text           text
  created_at          timestamptz NOT NULL DEFAULT now()

  UNIQUE (group_id, user_id, group_period_start)

chain_links                    -- De Ketting
  id                  uuid PK
  group_id            uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  group_period_start  date NOT NULL
  created_at          timestamptz NOT NULL DEFAULT now()

  UNIQUE (group_id, user_id, group_period_start)
```

`chain_links` is een eigen tabel en geen `COUNT()` over voltooiingen, om drie redenen: de
ketting telt opdagen en niet prestatie, hij loopt op de groepsklok terwijl voltooiingen op
de persoonlijke klok lopen, en het vertrek van een lid mag de historische ketting niet
wijzigen.

⚠️ **`week_reviews.blocked_text` is de enige plek in het model waar tegenslag staat die
de groep kan zien** — en dat is expliciet toegestaan, want de gebruiker heeft het zelf
opgeschreven en zelf verstuurd (domeinregel 7).

### 2.6 Punten, reeksen en vergevingsmechanismen

```sql
points_ledger                  -- append-only, de waarheid
  id         uuid PK
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  group_id   uuid REFERENCES groups(id) ON DELETE SET NULL
  goal_id    uuid REFERENCES goals(id) ON DELETE SET NULL
  delta      integer NOT NULL   -- mag negatief zijn
  reason     text NOT NULL      -- completion_approved_floor
                                -- | completion_approved_ceiling
                                -- | cycle_missed          ⚠️ minpunt
                                -- | review_given | milestone_done | goal_done
                                -- | correction
  ref_type   text
  ref_id     uuid
  created_at timestamptz NOT NULL DEFAULT now()

user_streaks                   -- cache, volledig herbouwbaar
  user_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  goal_id            uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE
  current_streak     integer NOT NULL DEFAULT 0   -- in cycli, niet in dagen
  best_streak        integer NOT NULL DEFAULT 0
  last_cycle_start   date
  total_points       integer NOT NULL DEFAULT 0
  updated_at         timestamptz NOT NULL DEFAULT now()
  PRIMARY KEY (user_id, goal_id)

week_pass_events               -- append-only
  id               uuid PK
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  goal_id          uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE
  event            text NOT NULL      -- earned | spent | granted
  cycle_start_date date NOT NULL
  created_at       timestamptz NOT NULL DEFAULT now()

breathers                      -- Adempauze
  id            uuid PK
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  goal_id       uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE
  starts_cycle  date NOT NULL
  ends_cycle    date NOT NULL
  announced_at  timestamptz NOT NULL DEFAULT now()
```

Resterende weekpassen = `SUM(earned+granted) - SUM(spent)`. Geen teller-kolom die uit de
pas kan lopen.

### 2.6b Het puntenmodel — vastgesteld bij de review

> *"Per week wordt er gekeken of jij jouw doel voor die week gehaald hebt. Zo ja, punt
> gescoord. Anders minpunt. Per doel is een vooraf bepaald maximaal aantal punten te
> behalen, tenzij je extra taken toevoegt aan jouw doel."*

**De regels**

| Uitkomst van een cyclus | Punten | Reeks |
|---|---|---|
| Plafond gehaald, goedgekeurd | `+points_ceiling` (standaard +2) | loopt door |
| Vloer gehaald, goedgekeurd | `+points_floor` (standaard +1) | loopt door |
| Niet gehaald | `points_miss` (standaard −1) | breekt, tenzij een weekpas hem redt |
| Adempauze | 0 | wacht |

**Het maximum per doel.** `goals.max_points = SUM(points_ceiling)` over alle geplande
weekdoelen. Voeg je extra taken toe, dan stijgt het plafond mee — precies zoals besloten.
Herberekend bij elke wijziging aan de weekdoelen van dat doel.

**Drie afgeleide beslissingen die hier logisch uit volgen.** Ik heb ze zo ingevuld; zeg
het als je een van de drie anders wilt.

1. **Een weekpas beschermt de reeks, niet het punt.** Zou hij allebei beschermen, dan is
   een week missen gratis en zegt de score niets meer. Zo blijft de weekpas doen waar hij
   voor is — voorkomen dat één slechte week maanden werk uitwist — zonder de score te
   vervalsen.
2. **Adempauze levert geen punt en geen minpunt op.** Je hebt hem vooraf aangekondigd; de
   week telt gewoon niet mee. Daarom de status `excused` op `weekly_goals`.
3. **Zelf afgevinkt maar niet goedgekeurd levert nog geen punt op.** Bij het verstrijken
   van de goedkeuringstermijn krijgt het weekdoel alsnog zijn punten, zodat een trage
   buddy jou geen minpunt kan bezorgen. In solomodus geldt hetzelfde: geen punten zolang
   er niemand is om goed te keuren, maar ook geen minpunten.

⚠️ **Score en voortgang zijn twee verschillende dingen en moeten dat in de UI ook
blijven.** Voortgang naar je doel is mijlpaalgebaseerd en loopt alleen omhoog. De score
kan dalen. Worden die twee in één balk gepropt, dan lijkt het alsof je doel achteruit
gaat omdat je één week miste — en dat is precies het gevoel dat mensen deze app laat
verwijderen.

⚠️ **Het minpunt raakt domeinregel 7.** Een dalende score is zichtbaar bewijs van een
gemiste week. Daarom: **`points_ledger` en het puntentotaal zijn uitsluitend voor de
eigenaar leesbaar.** De groep ziet De Ketting (opdagen), behaalde mijlpalen en
goedkeuringen — nooit iemands puntentotaal of -verloop. Zie §4.3.

### 2.7 Commitments

```sql
commitments
  id                   uuid PK
  goal_id              uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE
  type                 text NOT NULL      -- reward | penalty
  body                 text NOT NULL
  image_url            text
  beneficiary_group_id uuid REFERENCES groups(id) ON DELETE SET NULL
  status               text NOT NULL DEFAULT 'set'
                         -- set | unlocked | due | resolved | cancelled
  confirmed_at         timestamptz NOT NULL   -- ⚠️ expliciete bevestiging, verplicht
  created_at           timestamptz NOT NULL DEFAULT now()

  CHECK (type IN ('reward','penalty'))
  CHECK (type = 'reward' OR beneficiary_group_id IS NOT NULL)

commitment_events              -- append-only audit
  id            uuid PK
  commitment_id uuid NOT NULL REFERENCES commitments(id) ON DELETE CASCADE
  actor_id      uuid REFERENCES profiles(id)   -- NULL = systeem
  event_type    text NOT NULL   -- created | confirmed | edited
                                -- | triggered | posted | resolved | cancelled
  payload       jsonb
  created_at    timestamptz NOT NULL DEFAULT now()
```

`confirmed_at NOT NULL` maakt het onmogelijk een commitment aan te maken zonder
bevestiging. Domeinregel 5 wordt zo een schema-eigenschap, geen afspraak.

**Wanneer wordt een straf verschuldigd** (review: pas bij een verstreken deadline):
`status` gaat van `set` naar `due` op het moment dat `goals.target_date` gepasseerd is
terwijl `goals.status <> 'completed'`. Geen enkele gemiste week zet een straf in werking —
een slechte week kost een minpunt, meer niet. De begunstigde groep krijgt pas op dat
moment leesrecht op de rij; daarvóór is het commitment alleen zichtbaar voor de eigenaar.

### 2.8 Chat en AI-jobs

```sql
chat_messages
  id             uuid PK
  group_id       uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE
  sender_id      uuid REFERENCES profiles(id)   -- NULL = systeembericht
  body           text
  type           text NOT NULL DEFAULT 'text'   -- text | photo | doc | system
  system_event   text
  attachment_url text
  created_at     timestamptz NOT NULL DEFAULT now()

  CHECK (type = 'system' OR sender_id IS NOT NULL)

ai_jobs
  id             uuid PK
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  goal_id        uuid REFERENCES goals(id) ON DELETE CASCADE
  kind           text NOT NULL      -- milestones | weekly_goals
  status         text NOT NULL DEFAULT 'queued'  -- queued|running|done|failed
  input          jsonb NOT NULL
  input_hash     text NOT NULL      -- voor deduplicatie
  output         jsonb
  error          text
  model          text
  input_tokens   integer
  output_tokens  integer
  cost_cents     numeric(10,4)
  created_at     timestamptz NOT NULL DEFAULT now()
  finished_at    timestamptz
```

`ai_jobs` maakt onwrikbare regel 8 afdwingbaar: de Edge Function schrijft een rij en
keert terug, de client volgt via Realtime. `input_hash` + `cost_cents` dekken regel 6.

---

## 3. Indexen

Op elke foreign key, plus expliciet:

| Tabel | Index |
|---|---|
| `weekly_goals` | `(goal_id, cycle_start_date)` · `(status) WHERE status = 'pending'` |
| `completions` | `(weekly_goal_id) WHERE superseded_by IS NULL` |
| `completion_approvals` | `(completion_id)` · `(approver_id, created_at)` |
| `goal_group_links` | `(group_id)` — draagt het hele groepsoverzicht |
| `chain_links` | `(group_id, group_period_start)` |
| `chat_messages` | `(group_id, created_at DESC)` |
| `points_ledger` | `(user_id, created_at DESC)` |
| `daily_moves` | `(user_id, local_date DESC)` |
| `goals` | `(owner_id, status)` · `(status, target_date) WHERE status = 'active'` |
| `ai_jobs` | `(user_id, created_at DESC)` · `(input_hash)` |

**De N+1-valkuil** (onwrikbare regel 12) zit in het groepsoverzicht. Dat wordt één query
over `group_members → goal_group_links → goals → user_streaks`, met de weekstatus uit een
`LATERAL`-join op `weekly_goals`. Nooit per lid opnieuw bevragen. Dit wordt getest met
minstens tien leden en een queryteller in de test.

---

## 4. Row Level Security

**Elke tabel krijgt `ENABLE ROW LEVEL SECURITY` en `FORCE ROW LEVEL SECURITY`, met
default deny.** Geen enkele tabel blijft open.

### 4.1 Twee hulpfuncties

```sql
-- SECURITY DEFINER om oneindige RLS-recursie op group_members te voorkomen.
create function is_group_member(gid uuid) returns boolean
  language sql security definer stable set search_path = public as $$
    select exists (
      select 1 from group_members
      where group_id = gid and user_id = auth.uid()
    );
  $$;

-- Deelt de huidige gebruiker een groep met dit doel?
create function shares_group_with_goal(g uuid) returns boolean
  language sql security definer stable set search_path = public as $$
    select exists (
      select 1
      from goal_group_links l
      join group_members m on m.group_id = l.group_id
      where l.goal_id = g and m.user_id = auth.uid()
    );
  $$;
```

⚠️ Zonder `SECURITY DEFINER` verwijst de policy op `group_members` naar `group_members`
en loopt Postgres vast in recursie. Dit is de klassieke Supabase-valkuil en de reden dat
deze twee functies er zijn.

### 4.2 De policies, samengevat

| Tabel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | eigen rij, plus leden van gedeelde groepen | trigger | eigen rij | ✗ |
| `goals` | `owner_id = auth.uid()` **OF** `shares_group_with_goal(id)` | eigen | eigen | eigen |
| `goal_events` | als het doel | systeem | ✗ | ✗ |
| `goal_interviews` | **alleen eigenaar** | eigen | eigen | eigen |
| `milestones` | als het doel | eigenaar doel | eigenaar doel | eigenaar doel |
| `weekly_goals` | als het doel | eigenaar doel | eigenaar doel | eigenaar doel |
| `completions` | als het doel | eigenaar, eigen rij | ✗ *(append-only)* | ✗ |
| `completion_approvals` | groepsleden | lid + `approver_id = auth.uid()` + niet eigenaar | ✗ | ✗ |
| `daily_moves` | eigenaar; groepsgenoot **alleen** als `visibility = 'group'` | eigen | eigen | eigen |
| `groups` | `is_group_member(id)` | iedere ingelogde | alleen admin | alleen admin |
| `group_members` | `is_group_member(group_id)` | zelf joinen via geldige code | admin, of eigen status | zelf, of admin |
| `goal_group_links` | groepsleden | eigenaar doel **én** lid | ✗ | eigenaar doel |
| `week_reviews` | groepsleden | eigen rij, lid van groep | eigen rij | eigen rij |
| `chain_links` | groepsleden | systeem | ✗ | ✗ |
| `points_ledger` | **alleen eigen rijen** | systeem | ✗ | ✗ |
| `user_streaks` | **alleen eigenaar**; groepsgenoten zien alleen `current_streak` via view | systeem | systeem | ✗ |
| `week_pass_events` | **alleen eigenaar** | systeem | ✗ | ✗ |
| `breathers` | eigenaar; groepsleden zien alleen dat er een pauze loopt | eigen | eigen | eigen |
| `commitments` | eigenaar; begunstigde groep pas ná `unlocked`/`due` | eigenaar | eigenaar, vóór trigger | ✗ |
| `commitment_events` | als het commitment | systeem | ✗ | ✗ |
| `chat_messages` | `is_group_member(group_id)` | lid, `sender_id = auth.uid()` | eigen, 15 min | eigen |
| `ai_jobs` | **alleen eigenaar** | systeem | systeem | ✗ |
| `invite_events` | ✗ | systeem | ✗ | ✗ |

*"systeem"* betekent: alleen via een Edge Function met `service_role`, nooit vanuit de
client. De `service_role`-key komt nooit client-side (`CLAUDE.md`, beveiligingsregel 4).

### 4.3 Waar RLS domeinregel 7 draagt

`points_ledger`, `week_pass_events`, `goal_interviews` en `ai_jobs` zijn **alleen voor de
eigenaar leesbaar**. Daarmee kan een groepsgenoot niet uit de data afleiden dat iemand een
week gemist heeft, ook niet door slim te bevragen. De ontwerpregel is dus niet alleen een
UI-afspraak maar een eigenschap van het schema.

`user_streaks` is de uitzondering: het groepsoverzicht toont wél de reeks van anderen. Dat
is een positief signaal. Groepsgenoten lezen via een view die **uitsluitend
`current_streak`** projecteert — niet `total_points`, want punten kunnen dalen en een
dalend totaal is zichtbaar bewijs van een gemiste week. En niet `last_cycle_start`, want
daaruit is hetzelfde af te leiden.

Dit is de belangrijkste correctie die het minpunt in het model afdwong: had ik het
puntentotaal zichtbaar gelaten voor de groep, dan had het puntenmodel domeinregel 7
stilzwijgend ondermijnd.

---

## 5. Wat het model bewust níét doet

- **Geen `points` op `weekly_goals`.** Punten leven in het grootboek. Een kolom op het
  weekdoel zou een tweede waarheid zijn die kan afwijken.
- **Geen soft-delete overal.** Alleen `goals` heeft `archived`. Voor de rest geldt:
  cascade of niets. Soft-delete op alles maakt elke query een valkuil.
- **Geen `chain_count` op `groups`.** Afleiden uit `chain_links`; anders loopt hij uit
  de pas zodra iemand vertrekt.
- **Geen aparte `attachments`-tabel in de MVP.** Eén `attachment_url` op `completions` en
  `chat_messages` volstaat tot fase 2. Wordt het meervoudig, dan komt de tabel er alsnog.

---

## 6. Review — 15-08-2026

| # | Vraag | Antwoord | Verwerkt in |
|---|---|---|---|
| 1 | `floor_text` verplicht? | **Nee** | §2.3 — kolom is nullable, UI moedigt aan |
| 2 | Reeks per doel of per gebruiker? | *niet beantwoord* → blijft **per doel** | §2.6 |
| 3 | Dagzet zichtbaar voor de groep? | **Standaard privé** | §2.3 — `visibility`, §4.2 |
| 4 | Interview-antwoorden als `jsonb`? | *niet beantwoord* → blijft **`jsonb`** | §2.2 |
| 5 | Wanneer ziet de groep een straf? | **Pas als de deadline verstreken is** | §2.7, §4.2 |
| 6 | Twee tijdzones (gebruiker + groep)? | *niet beantwoord* → blijft **twee** | §2.1, §2.4 |

Vraag 2, 4 en 6 zijn niet expliciet beantwoord. Ik voer ze uit zoals voorgesteld en noem
ze hier zodat ze bij de engineer-review in november terugkomen als bewuste keuze en niet
als iets dat is doorgeglipt.

**Daarnaast is bij deze review het puntenmodel vastgesteld** — zie §2.6b. Dat was geen
vraag van mij maar een aanvulling van jouw kant, en het is de grootste wijziging van deze
ronde: punten kunnen nu negatief zijn, elk doel heeft een puntenplafond, en dat plafond
stijgt als je taken toevoegt.

---

## 7. Wat er nu gebeurt

1. Migratie `0001_initial.sql` — tabellen, constraints, indexen
2. Migratie `0002_rls.sql` — hulpfuncties en policies
3. Testsuite op RLS **vóór** de eerste feature: zelfgoedkeuring · goedkeuren door een
   niet-lid · lezen van andermans `points_ledger` · lezen van een niet-gekoppeld doel.
   Getest via de API met echte tokens, niet via de UI.
4. `pg_dump` vóór elke migratie (gratis tier heeft geen automatische backups)
5. `supabase gen types typescript` → gedeelde types

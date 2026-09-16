#!/usr/bin/env node
/**
 * groepskolommen-controle — een kolom die je morgen toevoegt aan een tabel met
 * een tabelbrede SELECT-grant, is meteen leesbaar voor iedereen die de rij mag
 * zien.
 *
 * ⚠️⚠️ **En bij eenentwintig van die tabellen is dat per definitie een
 *    groepsgenoot.** CLAUDE.md stelt daar een verplichte vraag bij:
 *
 *    > Bij élk nieuw ding dat de groep te zien krijgt, twee vragen: kan hieruit
 *    > iemands gemiste week worden afgeleid, én kan iemand dat met één
 *    > API-verzoek uitlezen buiten de UI om?
 *
 *    Niets dwong af dat iemand die vraag stelde. Geen migratie, geen grant, geen
 *    test. 📏 Twee keer is hij alleen bij toeval gesteld — bij QS8-448
 *    (`profiles.display_name`) en QS8-453 (`points_ledger.zonder_beoordelaar`),
 *    beide keren doordat een security-ronde eraan dacht en niet doordat er iets
 *    rood werd.
 *
 * ⚠️ `profiles` **stond ooit in deze lijst en is er in 0089 uit gehaald**, precies
 *    om deze reden: een groepsgenoot kon je dagritme uitlezen, en RLS kan geen
 *    kolommen beperken. De tabellen hieronder hebben die behandeling nooit gehad.
 *
 * ## Wat deze controle is
 *
 * Een **census met een ratel**, geen policy-analyse. Hij legt per tabel vast
 * welke kolommen er vandaag staan; komt er één bij of gaat er één weg, dan wordt
 * hij rood en is het bijwerken van het register het moment waarop de vraag
 * gesteld wordt. Zelfde vorm als `regel15:controle` en `levend:controle`.
 *
 * ⚠️⚠️ **Hij dekt alle veertig tabellen met een tabelbrede SELECT-grant en niet
 *    alleen de eenentwintig groepszichtbare.** De classificatie staat in het
 *    register en niet in de logica van dit script, en dat is een besluit:
 *    📏 een eerste versie leidde "groepszichtbaar" af uit `polqual` met een regex,
 *    en miste `groups` — want `groups_select` is `mag_groep_lezen(id)` en
 *    delegeert naar een functie. Een classificatie die je met een patroon uitrekent,
 *    is precies zo goed als de vorm die je toevallig intypt; een register is een
 *    bewering die een mens heeft opgeschreven.
 *
 * ⚠️ **Wat `kolomrechten:controle` hier níet doet.** Die vergelijkt **kolom**grants
 *    met schrijf- en leespaden. Een tabelbrede grant ís geen kolomgrant, dus hij
 *    ziet deze klasse per constructie niet.
 *
 * ⚠️ **Meet via `pg_class.relacl` en niet via `information_schema`.** 📏 Dat
 *    laatste laat bij een tabelbrede grant álle kolommen zien als kolomrecht, dus
 *    een toets erop is per constructie blind — dezelfde val waar QS8-457 zelf bij
 *    het meten in liep.
 *
 * ## Wat hij niet is
 *
 * ⚠️ Geen oordeel over óf een kolom gedeeld mag worden. Dat blijft handwerk; deze
 *    controle zorgt alleen dat het handwerk gebeurt. De rij over de schrijfkant
 *    in `docs/ENGINEER-REVIEW.md` blijft staan met zijn eigen voorwaarde.
 *
 * ⚠️⚠️ **Drie grenzen van de vraag, en ze staan hier omdat zwijgen erover een
 *    volgende lezer geruststelt zonder dat er iets gemeten is.** Hij kijkt alleen
 *    in schema `public`, alleen naar een **directe** grant aan `authenticated`,
 *    en niet naar wat er ná de grant met een kolom gebeurt. 📏 De eerste twee
 *    zijn vandaag ongevaarlijk en dat is gemeten (14-09-2026): **nul**
 *    SELECT-grants aan `PUBLIC`, en `authenticated` erft van geen enkele rol.
 *    Dat is een eigenschap van de huidige stand en niet van de query.
 *
 * ⚠️ **En hij ziet niet dat een tabelbrede `REVOKE` de kolomgrants eronder
 *    meeneemt.** 📏 `revoke select on public.profiles from authenticated` haalde
 *    ook de drie kolomgrants van 0089 weg; deze controle blijft dan groen, want
 *    `profiles` valt daarmee juist búiten de census. `kolomrechten:controle`
 *    vangt dát geval wél. De twee dekken elkaars blinde vlek: de een ziet een
 *    grant die erbij komt, de ander een kolomrecht dat verdwijnt.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { psqlArgumenten, verbindingsmelding } from './psql.mjs';

/**
 * De census: per tabel met een tabelbrede SELECT-grant aan `authenticated`, welke
 * kolommen er zijn en of de rij groepszichtbaar is.
 *
 * ⚠️⚠️ **`groepszichtbaar: true` betekent: de lezer kán een ánder zijn dan het
 *    onderwerp van de rij.** Voeg je hier een kolom toe, beantwoord dan eerst de
 *    twee vragen uit CLAUDE.md hierboven — en kan er iemands gemiste week uit
 *    worden afgeleid, dan hoort die kolom er niet in, of niet in deze tabel.
 *
 * ⚠️⚠️ **Die formulering is scherper dan "een groepsgenoot leest mee", en dat
 *    verschil kostte twee rijen.** 📏 In de security-ronde op QS8-457 bleken
 *    `completion_approvals` en `approval_withdrawals` op `false` te staan terwijl
 *    een groepsgenoot ze aantoonbaar leest. Hun policy noemt geen groep maar de
 *    persoon: `approver_id = auth.uid() or subject_id = auth.uid()`. De
 *    beoordelaar ís een groepslid (afgedwongen door de INSERT-policy) en is per
 *    `CHECK (approver_id <> subject_id)` **nooit** het onderwerp — de database
 *    garandeert dus dat er een lezer is die iemand anders is. Een afleiding die
 *    naar groeps-tokens zoekt, ziet dat niet.
 *
 * ⚠️ **`false` is geen vrijbrief.** Het zegt alleen dat de lezer geen
 *    groepsgenoot is maar de eigenaar zelf (of een smallere kring). De kolom is
 *    dan nog steeds meteen leesbaar voor wie de rij mag zien, en bij
 *    `points_ledger` was dat in QS8-453 precies de vraag.
 *
 * 📏 Gemeten op 14-09-2026 tegen een verse opbouw (269 migraties): **40** tabellen,
 *    **305** kolommen, waarvan **21** tabellen groepszichtbaar. De 38 uit het
 *    issue waren er 38 vóór 0264; `hero_profiles` en `hero_appearances` kwamen
 *    daar bij, allebei niet groepszichtbaar.
 *
 * @type {Record<string, { groepszichtbaar: boolean, kolommen: string }>}
 */
export const CENSUS = {
  // ⚠️⚠️ **De vier views, en die ontbraken tot de security-ronde op QS8-457.**
  //    `relkind in ('r','p')` sloot ze uit, terwijl `pg_default_acl` objtype `r`
  //    in Postgres tabellen **én** views dekt: 📏 een view aangemaakt zónder één
  //    grant-regel krijgt `authenticated=arwdx/postgres`. Drie van de vier staan
  //    bovendien op `security_invoker = false` en draaien dus als de eigenaar —
  //    daar is de `where` in de view de énige grens, en geen RLS eronder.
  //
  // ⚠️ En dit is precies de plek waar deze klasse per instructie landt: CLAUDE.md
  //    noemt bij domeinregel 7 *"een view met een expliciete kolomlijst"* als
  //    remedie. Een census die daar niet keek, keek weg van zijn eigen onderwerp.
  //    📏 Aangetoond met een view die `status = 'missed'` van iedereen uitdeelde:
  //    de controle bleef groen, mét de geruststellende slotzin.
  goal_dashboard: {
    // `security_invoker = true`, dus de RLS van `goals` geldt voor de lezer — en
    // `goals_select` is `owner_id = auth.uid() or shares_group_with_goal(id)`.
    groepszichtbaar: true,
    kolommen:
      'id, owner_id, title, description, category, target_date, status, created_at, updated_at, ' +
      'milestones_total, milestones_done, weekly_total, weekly_approved, ritme',
  },
  group_visible_streaks: {
    // De naam zegt het, en het lichaam bevat `deelt_open_groep_met_doel(g.id)`.
    groepszichtbaar: true,
    kolommen: 'user_id, goal_id, current_streak, best_streak, last_cycle_start',
  },
  mijn_doelvelden: {
    // `where owner_id = auth.uid()`. Eigenaar-only ondanks `security_invoker = false`.
    groepszichtbaar: false,
    kolommen: 'id, identity_statement, available_hours_per_week, max_points',
  },
  mijn_profiel: {
    // `where id = auth.uid()`. Eigenaar-only; `profiles` zelf is sinds 0089
    // bewust géén tabelbrede grant meer.
    groepszichtbaar: false,
    kolommen:
      'id, display_name, avatar_url, week_start_day, tz, reminder_time, reminder_enabled, ' +
      'reminder_tone, share_moves_by_default, created_at, updated_at, onboarded_at, ' +
      'wants_own_goal, locale, focus_areas, minutes_per_day, when_i_do_it, what_breaks_it, ' +
      'notify_approval_request, notify_approval_received, notify_cycle_summary, ' +
      'notify_commitment_witness, quiet_from, quiet_to, vindbaar',
  },
  ai_jobs: {
    groepszichtbaar: false,
    kolommen: 'id, user_id, goal_id, kind, status, input, input_hash, output, error, model, input_tokens, output_tokens, cost_cents, created_at, finished_at',
  },
  approval_withdrawals: {
    groepszichtbaar: true,
    kolommen: 'id, approval_id, completion_id, approver_id, created_at',
  },
  badges: {
    groepszichtbaar: false,
    kolommen: 'user_id, badge, earned_at',
  },
  breathers: {
    groepszichtbaar: true,
    kolommen: 'id, user_id, goal_id, starts_cycle, ends_cycle, announced_at',
  },
  chain_links: {
    groepszichtbaar: true,
    kolommen: 'id, group_id, user_id, group_period_start, created_at, earned_cycle_start',
  },
  chat_messages: {
    groepszichtbaar: true,
    kolommen: 'id, group_id, sender_id, body, type, system_event, attachment_url, created_at, subject_id, actor_id, payload, attachment_name',
  },
  commitment_events: {
    groepszichtbaar: false,
    kolommen: 'id, commitment_id, actor_id, event_type, payload, created_at, seq',
  },
  // ⚠️ `commitments` stond hier tot 0279 met een tabelbrede SELECT. Die is
  //    ingetrokken en per kolom teruggegeven, juist omdat `tz` er níet bij hoort:
  //    de begunstigde groep leest deze rij zodra een straf `unlocked`, `due` of
  //    `resolved` is, en een tabelbrede grant zou elke nieuwe kolom meegeven.
  //    Een rij hier houden die zijn grant kwijt is, dekt ooit stilletjes een
  //    tabel die hem wél heeft — vandaar dat deze controle daar zelf rood op
  //    wordt.
  completion_approval_rules: {
    groepszichtbaar: true,
    kolommen: 'completion_id, group_id, approvals_required, created_at',
  },
  completion_approvals: {
    groepszichtbaar: true,
    kolommen: 'id, completion_id, approver_id, subject_id, group_id, status, comment, created_at',
  },
  completions: {
    groepszichtbaar: true,
    kolommen: 'id, weekly_goal_id, user_id, achieved_level, note, attachment_url, cycle_start_date, submitted_at, superseded_by',
  },
  daily_moves: {
    groepszichtbaar: true,
    kolommen: 'id, user_id, weekly_goal_id, body, visibility, local_date, created_at',
  },
  day_checkins: {
    groepszichtbaar: false,
    kolommen: 'id, weekly_goal_id, local_date, created_at',
  },
  deadline_requests: {
    groepszichtbaar: true,
    kolommen: 'id, goal_id, group_id, requester_id, old_date, new_date, reason, status, decided_by, decided_at, decision_note, created_at',
  },
  goal_events: {
    groepszichtbaar: true,
    kolommen: 'id, goal_id, actor_id, event_type, old_value, new_value, created_at, approved_by_id',
  },
  goal_group_links: {
    groepszichtbaar: true,
    kolommen: 'goal_id, group_id, linked_at',
  },
  goal_interviews: {
    groepszichtbaar: false,
    kolommen: 'id, goal_id, answers, created_at',
  },
  goal_risk: {
    groepszichtbaar: false,
    kolommen: 'goal_id, status, reason, computed_at',
  },
  group_events: {
    groepszichtbaar: true,
    kolommen: 'id, group_id, actor_id, event_type, old_value, new_value, created_at, subject_id',
  },
  group_join_requests: {
    groepszichtbaar: true,
    kolommen: 'id, group_id, user_id, bericht, status, decided_by, decided_at, created_at',
  },
  group_members: {
    groepszichtbaar: true,
    kolommen: 'group_id, user_id, role, status, joined_at',
  },
  groups: {
    groepszichtbaar: true,
    kolommen: 'id, name, icon, created_by, invite_code, invite_revoked, huddle_day, tz, evidence_policy, approval_rule, season_cadence, status, last_activity_at, created_at, zichtbaarheid, approval_quorum, ontdekbaar, categorie, omschrijving, voertaal',
  },
  hero_appearances: {
    groepszichtbaar: false,
    kolommen: 'id, user_id, hero_key, trigger, shown_at',
  },
  hero_profiles: {
    groepszichtbaar: false,
    kolommen: 'user_id, hero_key, source, chosen_at',
  },
  invite_events: {
    groepszichtbaar: false,
    kolommen: 'id, user_id, group_id, created_at',
  },
  milestone_tips: {
    groepszichtbaar: false,
    kolommen: 'milestone_id, user_id, body, locale, created_at',
  },
  milestones: {
    groepszichtbaar: true,
    kolommen: 'id, goal_id, title, description, target_date, order_index, status, ai_generated, completed_at, created_at',
  },
  notifications_sent: {
    groepszichtbaar: false,
    kolommen: 'id, user_id, kind, local_date, ref_type, ref_id, sent_at',
  },
  points_ledger: {
    groepszichtbaar: false,
    kolommen: 'id, user_id, group_id, goal_id, delta, reason, ref_type, ref_id, created_at, cycle_start_date, zonder_beoordelaar, ronde',
  },
  push_tokens: {
    groepszichtbaar: false,
    kolommen: 'id, user_id, token, platform, created_at, last_seen_at, p256dh, auth',
  },
  reports: {
    groepszichtbaar: true,
    kolommen: 'id, reporter_id, subject_id, group_id, message_id, bericht_kopie, reden, toelichting, status, created_at',
  },
  season_recaps: {
    groepszichtbaar: true,
    kolommen: 'group_id, season_start, season_end, weken, mijlpalen, schakels, created_at',
  },
  todo_items: {
    groepszichtbaar: true,
    kolommen: 'id, user_id, body, done_at, order_index, visibility, created_at, updated_at, shared_group_id',
  },
  user_blocks: {
    groepszichtbaar: false,
    kolommen: 'blocker_id, blocked_id, created_at',
  },
  user_streaks: {
    groepszichtbaar: false,
    kolommen: 'user_id, goal_id, current_streak, best_streak, last_cycle_start, total_points, updated_at',
  },
  week_pass_events: {
    groepszichtbaar: false,
    kolommen: 'id, user_id, goal_id, event, cycle_start_date, created_at',
  },
  week_review_replies: {
    groepszichtbaar: true,
    kolommen: 'id, week_review_id, author_id, body, created_at',
  },
  week_reviews: {
    groepszichtbaar: true,
    kolommen: 'id, group_id, user_id, group_period_start, did_text, blocked_text, next_text, created_at',
  },
  weekly_goals: {
    groepszichtbaar: true,
    kolommen: 'id, goal_id, milestone_id, title, floor_text, ceiling_text, points_ceiling, points_floor, points_miss, cycle_start_date, status, ai_generated, created_at, beoordeelbaar, floor_days, ceiling_days',
  },
  weekly_plan_steps: {
    groepszichtbaar: false,
    kolommen: 'id, goal_id, milestone_id, order_index, title, floor_text, ceiling_text, ai_generated, weekly_goal_id, activated_cycle, created_at',
  },
};

/**
 * De vraag. Volgt één niveau functie-aanroep vanuit de policy.
 *
 * ⚠️⚠️ **Dat "één niveau" is de reden dat de uitkomst in het register landt en
 *    niet in de melding.** `groups_select` is `mag_groep_lezen(id)`; zonder het
 *    lichaam van die functie erbij leest de policy als niet-groepszichtbaar.
 *    Twee niveaus diep zou hetzelfde probleem één stap verderop hebben, en
 *    daarom is deze afleiding alleen de **eerste vulling** van het register —
 *    daarna is het register de waarheid en deze query alleen de teller.
 */
const VRAAG = `
with tabelbreed as (
  select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
    and exists (select 1 from aclexplode(c.relacl) a
                where a.grantee = 'authenticated'::regrole and a.privilege_type = 'SELECT')
)
select t.relname || '|' || string_agg(a.attname, ', ' order by a.attnum)
from tabelbreed t
join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
group by t.relname
order by t.relname;
`;

/**
 * De soorten die dit script behandelt. Alles daarbuiten met een tabelbrede
 * SELECT-grant is een bevinding en geen stilte.
 *
 * ⚠️⚠️ **Zwijgen over een onbekende `relkind` is hier de verkeerde faalrichting**,
 *    en dat is precies hoe de views tot de security-ronde buiten beeld bleven:
 *    de vraag filterde ze weg en de slotzin zei "geen enkele erbij of eraf".
 *    📏 Vandaag nul soorten buiten deze vijf; komt er ooit één bij, dan hoort de
 *    controle dat te melden in plaats van hem over te slaan.
 */
const ONBEKENDE_SOORTEN = `
select coalesce(string_agg(c.relkind::text || ' ' || c.relname, ', ' order by c.relname), '')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind not in ('r','p','v','m','f')
  and exists (select 1 from aclexplode(c.relacl) a
              where a.grantee = 'authenticated'::regrole and a.privilege_type = 'SELECT');
`;

/** Leest de uitvoer van de vraag hierboven. */
export function ontleed(uitvoer) {
  return String(uitvoer)
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '')
    .map((rij) => {
      const streep = rij.indexOf('|');
      return { tabel: rij.slice(0, streep), kolommen: rij.slice(streep + 1) };
    });
}

/**
 * Wat er afwijkt van de census.
 *
 * ⚠️ **Vier kanten en niet één.** Een nieuwe tabel met een tabelbrede grant, een
 *    registerrij waarvan de grant weg is, een nieuwe kolom en een verdwenen
 *    kolom. Alle vier zijn een reden om te kijken; de eerste drie omdat er iets
 *    bij komt dat gelezen kan worden, de vierde omdat een register dat naar iets
 *    wijst dat er niet meer is, stilletjes de volgende kolom met dezelfde naam
 *    dekt.
 */
export function beoordeel(gevonden, census = CENSUS) {
  const nieuweTabellen = gevonden.filter((t) => !(t.tabel in census)).map((t) => t.tabel);
  const namen = gevonden.map((t) => t.tabel);
  const verdwenenTabellen = Object.keys(census).filter((n) => !namen.includes(n));

  const kolomverschillen = gevonden
    .filter((t) => t.tabel in census)
    .map((t) => ({
      tabel: t.tabel,
      groeps: census[t.tabel].groepszichtbaar,
      erbij: verschil(t.kolommen, census[t.tabel].kolommen),
      eraf: verschil(census[t.tabel].kolommen, t.kolommen),
    }))
    .filter((v) => v.erbij.length > 0 || v.eraf.length > 0);

  return { nieuweTabellen, verdwenenTabellen, kolomverschillen };
}

function verschil(a, b) {
  const zijn = new Set(splits(b));
  return splits(a).filter((k) => !zijn.has(k));
}

function splits(lijst) {
  return String(lijst)
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k !== '');
}

function psql(vraag) {
  return execFileSync('psql', psqlArgumenten(vraag), { encoding: 'utf8' });
}

const DE_VRAAG =
  '  Kan hieruit iemands gemiste week worden afgeleid, én kan iemand dat met één\n' +
  '  API-verzoek uitlezen buiten de UI om?\n\n' +
  '  Is het antwoord op de eerste vraag ja, dan hoort die kolom hier niet — of\n' +
  '  niet in deze tabel. RLS kan geen kolommen beperken; je hebt dan een\n' +
  '  kolomgrant, een view met een expliciete kolomlijst of een rijbeperking\n' +
  '  nodig. Zie CLAUDE.md bij domeinregel 7.';

/**
 * Geeft `true` als er een soort relatie is die dit script niet behandelt.
 *
 * ⚠️ Apart van `hoofd()` omdat die anders boven de vijftig regels komt
 *    (onwrikbare regel 15).
 */
function meldOnbekendeSoort(onbekend) {
  if (onbekend === '') return false;
  console.error(
    '✗ Er staat een soort relatie in `public` met een tabelbrede SELECT-grant die\n' +
      `dit script niet behandelt: ${onbekend}\n\n` +
      '  Voeg de soort toe aan de vraag én aan CENSUS, of leg vast waarom hij er\n' +
      '  buiten valt. Stil overslaan is hoe de views hier tot QS8-457 uit beeld bleven.',
  );
  return true;
}

function meldKolommen(verschillen) {
  for (const v of verschillen) {
    const waar = v.groeps ? 'GROEPSZICHTBAAR' : 'niet groepszichtbaar';
    if (v.erbij.length > 0) {
      console.error(`✗ ${v.tabel} [${waar}] — nieuwe kolom(men): ${v.erbij.join(', ')}`);
      if (v.groeps) console.error(`\n${DE_VRAAG}\n`);
      else console.error('  Leesbaar voor wie de rij mag zien zodra hij bestaat. Neem hem op in CENSUS.\n');
    }
    if (v.eraf.length > 0) {
      console.error(
        `✗ ${v.tabel} — kolom(men) uit CENSUS bestaan niet meer: ${v.eraf.join(', ')}\n` +
          '  Een registerrij die naar iets wijst dat er niet meer is, dekt ooit\n' +
          '  stilletjes een nieuwe kolom met dezelfde naam. Haal hem weg.\n',
      );
    }
  }
}

function hoofd() {
  let gevonden;
  try {
    gevonden = ontleed(psql(VRAAG));
  } catch (fout) {
    console.error(
      verbindingsmelding({
        naam: 'groepskolommen-controle',
        leest: 'Deze controle leest `pg_class.relacl` en `pg_attribute`, niet de migratiebestanden.',
        melding: fout instanceof Error ? fout.message : String(fout),
      }),
    );
    return 1;
  }

  if (meldOnbekendeSoort(psql(ONBEKENDE_SOORTEN).trim())) return 1;

  const { nieuweTabellen, verdwenenTabellen, kolomverschillen } = beoordeel(gevonden);

  if (nieuweTabellen.length > 0) {
    console.error(
      `✗ ${nieuweTabellen.length} relatie(s) met een tabelbrede SELECT-grant aan\n` +
        `\`authenticated\` staan niet in CENSUS: ${nieuweTabellen.join(', ')}\n\n` +
        '  Elke kolom erop is leesbaar voor wie de rij mag zien. Zet de tabel in\n' +
        '  CENSUS met zijn kolommen en met `groepszichtbaar`, en beantwoord bij\n' +
        '  `true` eerst:\n\n' +
        `${DE_VRAAG}\n`,
    );
  }

  if (verdwenenTabellen.length > 0) {
    console.error(
      `✗ ${verdwenenTabellen.length} rij(en) in CENSUS hebben geen tabelbrede\n` +
        `SELECT-grant meer: ${verdwenenTabellen.join(', ')}\n\n` +
        '  Dat is goed nieuws en toch rood: haal de rij weg, anders dekt hij ooit\n' +
        '  stilletjes een tabel met dezelfde naam die de grant wél heeft.\n',
    );
  }

  if (kolomverschillen.length > 0) meldKolommen(kolomverschillen);

  if (nieuweTabellen.length + verdwenenTabellen.length + kolomverschillen.length > 0) return 1;

  const tabellen = Object.keys(CENSUS).length;
  const groeps = Object.values(CENSUS).filter((t) => t.groepszichtbaar).length;
  const kolommen = Object.values(CENSUS).reduce((n, t) => n + splits(t.kolommen).length, 0);
  console.log(
    `groepskolommen-controle: ${kolommen} kolommen op ${tabellen} relaties (tabellen en ` +
      `views) met een tabelbrede SELECT-grant, waarvan ${groeps} groepszichtbaar; geen ` +
      'enkele erbij of eraf sinds de laatste census.',
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());

/**
 * dml:controle — topniveau-DML in een migratie staat onder een reden (QS8-528)
 *
 * ---------------------------------------------------------------------------
 * Het gat dat dit dicht
 * ---------------------------------------------------------------------------
 *
 * `idempotent:controle` (QS8-413) speelt elke migratie direct na zichzelf nog
 * een keer af en kijkt of het **omvalt**. Dat vangt elke DDL-botsing en elke
 * uitvoeringsfout.
 *
 * ⚠️⚠️ **Wat het niet vangt is de statement die twee keer slaagt en twee keer
 *    iets ánders doet.** `update t set n = n + 1` draait twee keer zonder klacht
 *    en laat een andere eindtoestand achter. *"Valt hij om"* is niet dezelfde
 *    vraag als *"is de eindtoestand gelijk"*.
 *
 * ---------------------------------------------------------------------------
 * Een register en geen vormtoets — met de reden waarom
 * ---------------------------------------------------------------------------
 *
 * Of een `update` idempotent is, is **niet uit zijn tekst af te leiden**:
 * `where … is distinct from true` en `set n = n + 1` zien er even onschuldig
 * uit. Wat je wél kunt afdwingen is dat iemand er een regel over geschreven
 * heeft. Zelfde keuze als bij `definer_bewaking()`, en zelfde vorm als
 * `ZONDER_PUSH` (`schermingang-controle.mjs`) en `ZONDER_CI`
 * (`ci-controles.mjs`).
 *
 * ⚠️ **Het alternatief is eerlijker en is afgewogen, niet vergeten.** Een echte
 *    eindtoestandsvergelijking — snapshot vóór en ná de tweede run, checksum per
 *    tabel — meet de belofte rechtstreeks in plaats van de administratie. De
 *    afweging staat in
 *    `docs/decisions/2026-09-18-een-register-op-dml-en-niet-de-eindtoestand.md`;
 *    kort: hij vraagt een ingreep in `scripts/schema-opbouwen.sh`, dat beide
 *    passes met opzet in één psql-sessie zet, en daar dankt `idempotent:controle`
 *    zijn twee seconden aan.
 *
 * ---------------------------------------------------------------------------
 * Wat "topniveau" betekent, en waarom de telling afwijkt van het issue
 * ---------------------------------------------------------------------------
 *
 * DML **buiten** een functielichaam. Een `update` binnen `$fn$ … $fn$` draait
 * pas als iemand die functie aanroept en is hier niet aan de orde.
 *
 * 📏 **Gemeten op 18-09-2026 over 294 migraties: 12 bestanden, 23 statements.**
 *    Het issue telde er negen bestanden. De drie die daar ontbraken zijn
 *    `0033`, `0085` en `0280` — alle drie met een `update` op kolom 0, dus
 *    onmiskenbaar topniveau. `0280` is van ná die telling; `0033` en `0085` niet.
 *
 * ⚠️ **Een woordtelling geeft hier 206 en dat is de verkeerde eenheid.**
 *    `create policy … for update`, `create trigger … after update on` en
 *    `grant update (…)` bevatten alle drie het woord, en geen ervan is DML.
 *    De eenheid is het **statement**: begint het ermee, dan telt het.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// ⚠️ **De gedeelde SQL-knip en geen eigen.** Die loopt teken voor teken om
//    enkele quotes én dollar-quotes heen, precies wat hier nodig is.
//    `knip:controle` bestaat om een tiende `zonderCommentaar` tegen te houden;
//    dit script schrijft er dus geen. ⚠️ Hij stond tot QS8-574 in
//    `sleutelvorm-controle.mjs` en werd hier al uit dát bestand geïmporteerd —
//    een gedeelde knip in het bestand van één consument is een kopie die nog
//    niet gemaakt is.
import { zonderCommentaarSql } from './zonder-sql-commentaar.mjs';

const MAP = 'supabase/migrations';

/**
 * De statements die met DML beginnen, buiten functielichamen.
 *
 * ⚠️ Het lichaam gaat er eerst uit en wordt vervángen door een merkteken in
 *    plaats van door niets: zo plakken de statements ervoor en erna niet aan
 *    elkaar vast.
 */
export function zonderFunctielichamen(sql) {
  return String(sql).replace(/\$([a-z0-9_]*)\$[\s\S]*?\$\1\$/gi, ' <lichaam> ');
}

/** De topniveau-DML-statements in één migratie, genormaliseerd op witruimte. */
export function topniveauDml(sql) {
  return zonderFunctielichamen(zonderCommentaarSql(sql))
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => /^(insert\s+into|update|delete\s+from)\b/i.test(s));
}

/**
 * Het register: per migratie de topniveau-DML die er mag staan, met de reden
 * waarom een tweede run dezelfde eindtoestand oplevert.
 *
 * ⚠️ **`bevat` is een herkenning en geen volledige statement.** Een register dat
 *    de hele tekst kopieert, rot bij de eerste herformattering — en dan
 *    herschrijft iemand het register in plaats van de vraag opnieuw te stellen.
 *    Het fragment moet wél onderscheidend zijn binnen zijn bestand.
 *
 * ⚠️ De `@type` is er zodat TypeScript hier een **record** ziet en niet de
 *    letterlijke sleutels van vandaag. Zonder die annotatie kan een toets geen
 *    ander register meegeven — en dan is de controle niet te ijken, wat precies
 *    de eigenschap is die dit project van elke grendel eist.
 *
 * @type {Record<string, { bevat: string, reden: string }[]>}
 */
export const DML_MET_REDEN = {
  '0033': [
    { bevat: 'update chat_messages m set sender_id = null',
      reden: '`where sender_id is not null and not exists (profiel)` — na de run is die kolom null, dus de tweede run raakt niets' },
  ],
  '0085': [
    { bevat: 'set approved_by_id =',
      reden: '`where approved_by_id is null and new_value ? \'approved_by\'` — na de run is de kolom gevuld' },
    { bevat: "set new_value = e.new_value - 'approved_by'",
      reden: '`where new_value ? \'approved_by\'` — de sleutel is er ná de run uit, dus de tweede run matcht niets' },
  ],
  '0126': [
    { bevat: "insert into storage.buckets", reden: '`on conflict (id) do update set` — een tweede run schrijft dezelfde waarden' },
  ],
  '0164': [
    { bevat: 'update public.goals set category =',
      reden: '`where category in (<de oude waarden>)` — na de run staat er geen oude waarde meer' },
    { bevat: 'update public.groups set categorie =',
      reden: '`where categorie in (<de oude waarden>)` op `groups` — na de run staat er geen oude waarde meer' },
    { bevat: 'update public.profiles set focus_areas =',
      reden: '`where focus_areas && array[<de oude waarden>]` — na de run overlapt er niets meer' },
  ],
  '0204': [
    { bevat: "set status = 'active' where status = 'paused'",
      reden: 'de `where` sluit uit wat de `set` oplevert' },
  ],
  '0211': [
    { bevat: 'delete from push_tokens dubbel',
      reden: '`where token <> btrim(token) and (er is een getrimde tweeling)` — na de run bestaat de ongetrimde rij niet meer' },
    { bevat: 'update push_tokens set token = btrim(token)',
      reden: '`btrim` is een vast punt: `where token <> btrim(token)` matcht daarna niets' },
  ],
  '0213': [
    { bevat: "where system_event = 'goal_completed'",
      reden: "vaste tekst per gebeurtenis, met `where system_event = 'goal_completed'` — een tweede run schrijft dezelfde waarde in dezelfde rijen" },
    { bevat: "where system_event = 'member_joined'",
      reden: "vaste tekst per gebeurtenis, met `where system_event = 'member_joined'` — een tweede run schrijft dezelfde waarde in dezelfde rijen" },
    { bevat: "where system_event = 'milestone_done'",
      reden: "vaste tekst per gebeurtenis, met `where system_event = 'milestone_done'` — een tweede run schrijft dezelfde waarde in dezelfde rijen" },
    { bevat: "where system_event = 'completion_pending'",
      reden: "vaste tekst per gebeurtenis, met `where system_event = 'completion_pending'` — een tweede run schrijft dezelfde waarde in dezelfde rijen" },
    { bevat: "where system_event = 'completion_approved'",
      reden: "vaste tekst per gebeurtenis, met `where system_event = 'completion_approved'` — een tweede run schrijft dezelfde waarde in dezelfde rijen" },
    { bevat: "where system_event = 'commitment_unlocked'",
      reden: "vaste tekst per gebeurtenis, met `where system_event = 'commitment_unlocked'` — een tweede run schrijft dezelfde waarde in dezelfde rijen" },
    { bevat: "where system_event = 'commitment_due'",
      reden: "vaste tekst per gebeurtenis, met `where system_event = 'commitment_due'` — een tweede run schrijft dezelfde waarde in dezelfde rijen" },
    { bevat: "where system_event = 'deadline_requested'",
      reden: "vaste tekst per gebeurtenis, met `where system_event = 'deadline_requested'` — een tweede run schrijft dezelfde waarde in dezelfde rijen" },
  ],
  '0222': [
    { bevat: 'insert into storage.buckets',
      reden: '`on conflict (id) do update set` — een tweede run schrijft dezelfde emmerinstellingen terug' },
  ],
  '0227': [
    { bevat: 'insert into storage.buckets',
      reden: '`on conflict (id) do update set` — een tweede run schrijft dezelfde emmerinstellingen terug' },
  ],
  '0240': [
    { bevat: 'insert into storage.buckets',
      reden: '`on conflict (id) do update set` — een tweede run schrijft dezelfde emmerinstellingen terug' },
  ],
  '0257': [
    { bevat: 'update public.points_ledger set zonder_beoordelaar = true',
      reden: '`where … and zonder_beoordelaar is distinct from true` — de `where` sluit uit wat de `set` oplevert' },
  ],
  '0280': [
    { bevat: 'update public.commitments c set tz =',
      reden: '`where c.tz is null` — na de run is de kolom gevuld, dus de bevroren zone wordt niet opnieuw gekozen' },
  ],
};

/** Alle migraties van schijf, met hun topniveau-DML. */
export function dmlPerMigratie(map = MAP) {
  const uit = {};
  for (const naam of readdirSync(map).filter((n) => n.endsWith('.sql')).sort()) {
    const gevonden = topniveauDml(readFileSync(`${map}/${naam}`, 'utf8'));
    if (gevonden.length > 0) uit[naam.slice(0, 4)] = { naam, statements: gevonden };
  }
  return uit;
}

/**
 * De bevindingen: DML zonder reden, én registerrijen die niets meer dekken.
 *
 * ⚠️⚠️ **Die tweede helft is geen nettigheid.** Een register dat alleen groeit,
 *    rot: een rij blijft staan nadat het statement eruit is, en dan dekt hij
 *    morgen een ánder statement dat toevallig hetzelfde fragment draagt. Tak 5
 *    van `definer_bewaking()` doet het om dezelfde reden.
 */
export function beoordeel(perMigratie, register = DML_MET_REDEN) {
  const ongeregistreerd = [];
  const verweesd = [];

  for (const [nummer, { naam, statements }] of Object.entries(perMigratie)) {
    const rijen = register[nummer] ?? [];
    for (const statement of statements) {
      if (!rijen.some((r) => statement.includes(r.bevat))) {
        ongeregistreerd.push({ naam, statement });
      }
    }
  }

  for (const [nummer, rijen] of Object.entries(register)) {
    const statements = perMigratie[nummer]?.statements ?? [];
    for (const rij of rijen) {
      if (!statements.some((s) => s.includes(rij.bevat))) {
        verweesd.push({ nummer, bevat: rij.bevat });
      }
    }
  }

  return { ongeregistreerd, verweesd };
}

export function rapport({ ongeregistreerd, verweesd }) {
  const regels = [];
  if (ongeregistreerd.length > 0) {
    regels.push(`dml-controle: ${ongeregistreerd.length} topniveau-DML-statement(s) zonder reden.\n`);
    for (const o of ongeregistreerd) {
      regels.push(`  ${MAP}/${o.naam}`);
      regels.push(`    ${o.statement.slice(0, 150)}\n`);
    }
    regels.push('  `idempotent:controle` vraagt of een migratie ómvalt bij een tweede run, niet');
    regels.push('  of de eindtoestand gelijk blijft. `update t set n = n + 1` slaagt twee keer en');
    regels.push('  doet twee keer iets anders. Schrijf op waarom dit statement dat níet doet, en');
    regels.push('  zet het in DML_MET_REDEN in dit script.\n');
  }
  if (verweesd.length > 0) {
    regels.push(`dml-controle: ${verweesd.length} registerrij(en) dekken niets meer.\n`);
    for (const v of verweesd) regels.push(`  ${v.nummer}: ${v.bevat}`);
    regels.push('');
    regels.push('  Een register dat alleen groeit, rot: zo\'n rij dekt morgen een ánder statement');
    regels.push('  dat toevallig hetzelfde fragment draagt. Haal hem weg.');
  }
  return regels.join('\n');
}

function hoofd() {
  const perMigratie = dmlPerMigratie();
  const bevindingen = beoordeel(perMigratie);
  const statements = Object.values(perMigratie).reduce((n, m) => n + m.statements.length, 0);

  if (bevindingen.ongeregistreerd.length === 0 && bevindingen.verweesd.length === 0) {
    console.log(
      `dml-controle: ${statements} topniveau-DML-statement(s) in ` +
        `${Object.keys(perMigratie).length} migratie(s), elk met een reden waarom een ` +
        'tweede run dezelfde eindtoestand oplevert.',
    );
    return 0;
  }
  console.error(rapport(bevindingen));
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());

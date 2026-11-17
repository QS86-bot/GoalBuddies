import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * De belofte: **het werk ná de profielenlus draait, hoe groot de lus ook is** —
 * QS8-685, acceptatiecriterium 4.
 *
 * ⚠️ **Dit is de naad, en daarom voert deze test de échte handler.** 📏 Op
 *    productie werd de rollover op 16-11-2026 om 20:15 na 192 s en op 17-11 om
 *    03:39 na 162 s afgesloten, midden in de lus over 1.332 profielen. Elk
 *    onderdeel was af en getest — de paginering, de straffen, het afschrijven,
 *    elke stap ná de lus — en toch draaide er sinds 16-11 18:47 geen enkele
 *    stap ná de lus meer: stille groepen, seizoensrecaps, vastgelopen
 *    goedkeuringen, de opruiming van bijlagen. Een test op
 *    `verwerkBinnenBudget()` alleen blijft groen als iemand het budget uit
 *    `rollover/index.ts` haalt (regel 18, vraag 3); deze niet.
 *
 * ⚠️ **De klok is nagemaakt.** Elk verzoek per profiel duurt 150 ms op een
 *    nagemaakte `setTimeout` — drie verzoeken per profiel, dus de ≈ 0,45 s per
 *    profiel die op productie gemeten is — en verzoeken die tegelijk lopen,
 *    duren samen ook 150 ms. Zo is "de lus is groot"
 *    een aantal profielen en geen wachttijd, en duurt deze test geen 150 s.
 *
 * ⚠️ **De nagemaakte client is een opname, geen gedrag.** Hij geeft voor elk
 *    verzoek "niets te doen" terug en onthoudt wat er gevraagd is. Of de échte
 *    PostgREST-aanroepen kloppen, toetst `tests/rls/` en `npm run
 *    edge:types:controle`; hier gaat het alleen om de vorm van de run.
 *
 * ⚠️ **Met de hand gebroken vóór hij geloofd werd**, per grendel apart:
 *
 *    1. `PROFIELBUDGET_MS` op `Infinity` gezet → "draait het werk na de lus"
 *       rood: de klok staat aan het eind ver boven de 150 s. Dat is de bug zelf.
 *    2. In `verwerkBinnenBudget()` de budgetcontrole weggehaald → dezelfde toets
 *       rood, de kleine run groen.
 *    3. `PROFIELEN_TEGELIJK` op 1 gezet → "houdt de gelijktijdigheid begrensd"
 *       rood (hoogste is 1 en niet 8), en "ziet elk profiel precies één keer"
 *       ook: 450 profielen à 0,45 s passen één tegelijk niet in 100 s.
 *    4. In `profielenVanafWillekeurigePlek()` het `tot`-bereik weggelaten →
 *       alleen "ziet elk profiel precies één keer" rood.
 *    5. `volledig` uit de uitvoer van de functie gehaald → beide
 *       `volledig`-toetsen rood (`rollover.yml` leest dat veld).
 *    6. `slaapStilleGroepen()` na de lus niet meer aangeroepen → alleen "draait
 *       het werk na de lus" rood.
 */

type Afhandelaar = (verzoek: Request) => Response | Promise<Response>;

const PROFIEL_RPC = new Set(['maak_straffen_verschuldigd', 'weekplan_kandidaten']);
const NA_DE_LUS = [
  'slaap_stille_groepen',
  'maak_seizoensrecaps',
  'keur_vastgelopen_goedkeuringen_goed',
  'verlopen_chatfotos',
  'verlopen_chatdocs',
] as const;

/** De stand van de nagemaakte database voor één run. */
const db = {
  profielen: [] as string[],
  rpcs: [] as string[],
  verwerkteProfielen: [] as string[],
  tegelijk: 0,
  hoogste: 0,
  klokNaDeLus: Number.NaN,
  start: 0,
};

/**
 * Een verzoek dat `ms` duurt, op de nagemaakte klok. Acht tegelijk duren dus
 * samen ook `ms`, zoals acht verzoeken naar PostgREST dat doen.
 */
function werkt(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Een `select` op `profiles` met `gte`/`lt`, `order` en `range`. */
function profielenQuery() {
  let filter: (id: string) => boolean = () => true;
  let van = 0;
  let tot = 0;
  const q = {
    select: () => q,
    gte: (_k: string, w: string) => { filter = (id) => id >= w; return q; },
    lt: (_k: string, w: string) => { filter = (id) => id < w; return q; },
    order: () => q,
    range: (a: number, b: number) => { van = a; tot = b; return q; },
    then: (klaar: (r: unknown) => void) => {
      const data = db.profielen.filter(filter).slice(van, tot + 1)
        .map((id) => ({ id, week_start_day: 1, tz: 'Europe/Amsterdam' }));
      return Promise.resolve({ data, error: null }).then(klaar);
    },
  };
  return q;
}

/** Elke andere tabel: een keten die "niets te doen" teruggeeft. */
function legeQuery(tabel: string) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'lt', 'lte', 'gte', 'order', 'update', 'insert']) {
    q[m] = () => q;
  }
  q.maybeSingle = () => Promise.resolve({ data: null, error: null });
  q.then = async (klaar: (r: unknown) => void) => {
    if (tabel === 'weekly_goals') await werkt(150);
    return klaar({ data: [], error: null });
  };
  return q;
}

async function rpc(naam: string, args: Record<string, unknown>) {
  db.rpcs.push(naam);
  if (naam === 'maak_straffen_verschuldigd') {
    db.verwerkteProfielen.push(String(args.p_owner_id));
    db.tegelijk += 1;
    db.hoogste = Math.max(db.hoogste, db.tegelijk);
  }
  if (PROFIEL_RPC.has(naam)) await werkt(150);
  if (naam === 'maak_straffen_verschuldigd') db.tegelijk -= 1;
  if (naam === NA_DE_LUS[0]) db.klokNaDeLus = Date.now() - db.start;
  const lijst = naam.startsWith('verlopen_') || naam === 'maak_seizoensrecaps' || naam === 'weekplan_kandidaten';
  return { data: lijst ? [] : 0, error: null };
}

vi.mock('jsr:@supabase/supabase-js@2', () => ({
  createClient: () => ({
    from: (tabel: string) => (tabel === 'profiles' ? profielenQuery() : legeQuery(tabel)),
    rpc,
    storage: { from: () => ({ remove: () => Promise.resolve({ data: [], error: null }) }) },
  }),
}));

/** Een service_role-JWT; de handtekening controleert het platform, niet de functie. */
function serviceRoleToken(): string {
  const deel = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${deel({ alg: 'HS256' })}.${deel({ role: 'service_role' })}.x`;
}

async function handler(): Promise<Afhandelaar> {
  let gevangen: Afhandelaar | undefined;
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: (k: string) => (k === 'SUPABASE_URL' ? 'https://proef.supabase.co' : undefined) },
    serve: (a: Afhandelaar) => {
      gevangen = a;
      return { finished: Promise.resolve(), shutdown: () => Promise.resolve() };
    },
  };
  const naam = 'rollover';
  await import(`../../supabase/functions/${naam}/index.ts`);
  if (gevangen === undefined) throw new Error('rollover gaf geen handler aan Deno.serve');
  return gevangen;
}

/** `n` profiel-id's die als uuid sorteren, zoals in Postgres. */
function profielen(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const hex = (i * 2654435761 % 2 ** 32).toString(16).padStart(8, '0');
    return `${hex}-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
  }).sort();
}

async function draai(n: number) {
  db.profielen = profielen(n);
  const h = await handler();
  db.start = Date.now();
  let klaar = false;
  const lopend = Promise.resolve(h(new Request('https://proef.supabase.co/functions/v1/rollover', {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceRoleToken()}` },
  }))).finally(() => { klaar = true; });
  // ⚠️ De klok loopt in stappen van 50 ms tot de handler antwoordt.
  while (!klaar) await vi.advanceTimersByTimeAsync(50);
  const antwoord = await lopend;
  const duur = Date.now() - db.start;
  return { status: antwoord.status, body: await antwoord.json() as Record<string, unknown>, duur };
}

beforeEach(() => {
  // ⚠️ Elke test een verse module: `Deno.serve()` draait op moduleniveau.
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-11-17T04:00:00Z'));
  Object.assign(db, {
    profielen: [], rpcs: [], verwerkteProfielen: [], tegelijk: 0, hoogste: 0,
    klokNaDeLus: Number.NaN, start: 0,
  });
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { Deno?: unknown }).Deno;
});

describe('de rollover op de naad tussen de profielenlus en het werk erna', () => {
  it('draait het werk na de lus, binnen de wandklok, ook bij 20.000 profielen', async () => {
    const { status, body, duur } = await draai(20_000);

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    for (const stap of NA_DE_LUS) expect(db.rpcs).toContain(stap);

    // 📏 De gedocumenteerde wandkloklimiet is 150 s; productie kapte af op 162 s.
    expect(db.klokNaDeLus).toBeLessThan(150_000);
    expect(duur).toBeLessThan(150_000);
  });

  it('zegt dat hij niet volledig was als het budget op is', async () => {
    const { body } = await draai(20_000);

    expect(body.volledig).toBe(false);
    expect(db.verwerkteProfielen.length).toBeLessThan(20_000);
    expect(body.profielen).toBe(db.verwerkteProfielen.length);
  });

  it('ziet elk profiel precies één keer als het budget ruim is', async () => {
    const { body } = await draai(450);

    expect(body.volledig).toBe(true);
    expect(body.profielen).toBe(450);
    expect([...db.verwerkteProfielen].sort()).toEqual(db.profielen);
  });

  it('houdt de gelijktijdigheid begrensd', async () => {
    await draai(450);

    expect(db.hoogste).toBe(8);
  });
});

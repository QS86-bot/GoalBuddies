import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Twee beloftes van de notificatiejob, allebei op de naad — QS8-688:
 *
 * 1. **Hij antwoordt binnen de wandklok, hoe groot de lus ook is.** 📏 Op
 *    17-11-2026 om 04:02 deed hij ≈ 194 s over 1.200 profielen, één tegelijk,
 *    en kreeg hij `shutdown`; `notificaties.yml` gaf na 120 s op. Een afgekapte
 *    run geeft geen antwoord en dus geen telling.
 * 2. **Wat hij parallel doet, verstuurt niets dubbel.** Een dubbele rollover is
 *    onschadelijk; een herinnering die twee keer op iemands telefoon verschijnt
 *    niet. De rem is de rij in `notifications_sent` die vóór het versturen
 *    geschreven wordt, met de unieke indexen uit 0053. Dat is een eigenschap
 *    van het gehéél (regel 18, vraag 1): de functie die de rij schrijft, de
 *    index die weigert en de lus die nu parallel loopt, zijn elk apart
 *    correct, en alleen samen houden ze een dubbele push tegen.
 *
 * ⚠️ **De échte handler, met een nagemaakte database, `fetch` en klok.** Elk
 *    verzoek duurt 50 ms op een nagemaakte `setTimeout`; verzoeken die
 *    tegelijk lopen, duren samen ook 50 ms. De nagemaakte `notifications_sent`
 *    gedraagt zich als de twee partiële unieke indexen (📏 op productie
 *    nagelezen met `pg_indexes`, 17-11-2026) en geeft `23505` bij een botsing,
 *    zoals PostgREST. Of de échte PostgREST-aanroepen kloppen, toetst
 *    `tests/rls/` en `npm run edge:types:controle`.
 *
 * ⚠️ **Met de hand gebroken vóór hij geloofd werd**, per grendel apart
 *    (📏 17-11-2026, telkens één mutatie en daarna teruggezet):
 *
 *    1. `PROFIELBUDGET_MS` op `Infinity` → "antwoordt binnen de wandklok" en
 *       "zegt dat hij niet volledig was" rood. Dat is de bug zelf.
 *    2. `PROFIELEN_TEGELIJK` op 1 → alleen "houdt de gelijktijdigheid
 *       begrensd" rood.
 *    3. In `profielenVanafWillekeurigePlek()` het `tot`-bereik weggelaten →
 *       "ziet elk profiel precies één keer" rood, en beide remtoetsen (een deel
 *       van de profielen krijgt niets).
 *    4. `volledig` uit de uitvoer gehaald → "zegt dat hij niet volledig was",
 *       "ziet elk profiel precies één keer" en de eerste remtoets rood
 *       (`notificaties.yml` leest dat veld).
 *    5. In `stuur()` bij een fout op de insert tóch versturen → alleen
 *       "verstuurt elke melding één keer, ook als twee runs tegelijk…" rood.
 *       Dat is de rem. ⚠️ Met twee willekeurige startplekken in plaats van één
 *       vaste blijft die toets bij deze mutatie **groen** — gemeten, en de
 *       reden dat de startplek daar vastgezet wordt.
 *    6. `alVerstuurd()` altijd `false` → alles groen, en dat is de bedoeling:
 *       de vraag vooraf is een besparing, de index is de rem.
 *    7. (QS8-691) `push_tokens!inner(user_id)` vervangen door
 *       `push_tokens(user_id)`, en apart de embed helemaal weggehaald → allebei
 *       twee tests rood: "slaat een profiel zonder token over…" en "leest de
 *       tokens vers: een token dat na de pagina verhuisd is, krijgt niets"
 *       (nagemeten bij de review van de batch, 17-11-2026).
 *    8. (QS8-691) In `bladerOpSleutel()` weer op offset gebladerd → alleen
 *       "slaat niemand over als tokens tíjdens de run verdwijnen" rood.
 */

type Afhandelaar = (verzoek: Request) => Response | Promise<Response>;

const VERZOEK_MS = 50;

interface Verzonden {
  user_id: string;
  kind: string;
  local_date: string;
  ref_id: string | null;
  id: string;
}

/** De stand van de nagemaakte wereld voor één test. */
const wereld = {
  profielen: [] as string[],
  /** Profielen met een toestel (een rij in `push_tokens`). */
  metToken: new Set<string>(),
  /** Daarvan: wie één voltooiing heeft die op zijn oordeel wacht. */
  metWerk: new Set<string>(),
  /**
   * Wie zijn token kwijtraakt ná het ophalen van zijn pagina en vóór
   * `apparatenVan()`: het toestel is intussen aan een ander account gekoppeld.
   */
  verhuisd: new Set<string>(),
  /**
   * Als `true`, verdwijnt een token zodra hij gelezen is — zoals `stuurWeb()`
   * een verlopen abonnement wist. De lijst "profielen met een token" krimpt dan
   * tíjdens de run.
   */
  wisNaLezen: false,
  verzonden: [] as Verzonden[],
  /** Elke push die bij Expo aankwam: het token. */
  pushes: [] as string[],
  gezien: [] as string[],
  tegelijk: 0,
  hoogste: 0,
};

function werkt(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Een keten die alles aanneemt en na `VERZOEK_MS` met `uitslag` antwoordt. */
function keten(uitslag: () => unknown): unknown {
  const doe = async () => { await werkt(VERZOEK_MS); return uitslag(); };
  const p: unknown = new Proxy(() => p, {
    get: (_t, k) => {
      if (k === 'then') return (a: (r: unknown) => void, b: (e: unknown) => void) => doe().then(a, b);
      if (k === 'single' || k === 'maybeSingle') return () => doe().then((r) => ({ ...(r as object), data: null }));
      return () => p;
    },
    apply: () => p,
  });
  return p;
}

const leeg = () => ({ data: [], error: null, count: 0 });

function profielenQuery() {
  const filters: ((id: string) => boolean)[] = [];
  // ⚠️ `push_tokens!inner(…)` in de select laat alleen profielen met een token
  //    door, zoals PostgREST dat doet (QS8-691). Zonder `!inner` komen ze allemaal.
  let alleenMetToken = false;
  let van = 0;
  let tot = Number.POSITIVE_INFINITY;
  const q = {
    select: (kolommen: string) => { alleenMetToken = /push_tokens!inner\(/.test(kolommen); return q; },
    gte: (_k: string, w: string) => { filters.push((id) => id >= w); return q; },
    gt: (_k: string, w: string) => { filters.push((id) => id > w); return q; },
    lt: (_k: string, w: string) => { filters.push((id) => id < w); return q; },
    order: () => q,
    range: (a: number, b: number) => { van = a; tot = b; return q; },
    limit: (n: number) => { van = 0; tot = n - 1; return q; },
    then: async (klaar: (r: unknown) => void) => {
      await werkt(VERZOEK_MS);
      const data = wereld.profielen
        .filter((id) => !alleenMetToken || wereld.metToken.has(id))
        .filter((id) => filters.every((f) => f(id)))
        .slice(van, tot + 1).map((id) => ({
        id,
        tz: 'Europe/Amsterdam',
        week_start_day: 1,
        reminder_enabled: false,
        reminder_time: null,
        reminder_tone: null,
        locale: 'nl',
        notify_approval_request: true,
        notify_approval_received: true,
        notify_cycle_summary: true,
        notify_commitment_witness: true,
        quiet_from: null,
        quiet_to: null,
      }));
      return klaar({ data, error: null });
    },
  };
  return q;
}

/** `push_tokens`: één iOS-toestel voor wie werk heeft; de teller voor gelijktijdigheid. */
function tokensQuery() {
  let wie = '';
  const q = {
    select: () => q,
    delete: () => q,
    eq: (_k: string, w: string) => { wie = w; return q; },
    then: async (klaar: (r: unknown) => void) => {
      wereld.gezien.push(wie);
      wereld.tegelijk += 1;
      wereld.hoogste = Math.max(wereld.hoogste, wereld.tegelijk);
      await werkt(VERZOEK_MS);
      wereld.tegelijk -= 1;
      const data = wereld.metToken.has(wie) && !wereld.verhuisd.has(wie)
        ? [{ token: `ExponentPushToken[${wie}]`, platform: 'ios', p256dh: null, auth: null }]
        : [];
      if (wereld.wisNaLezen) wereld.metToken.delete(wie);
      return klaar({ data, error: null });
    },
  };
  return q;
}

/**
 * `notifications_sent`, met de twee partiële unieke indexen uit 0053:
 * `(user_id, kind, local_date) where ref_id is null` en
 * `(user_id, kind, ref_id) where ref_id is not null`.
 */
function verzondenQuery() {
  const eq: Record<string, unknown> = {};
  let rij: Omit<Verzonden, 'id'> | null = null;
  let wissen = false;
  const sleutel = (r: Omit<Verzonden, 'id'>) =>
    r.ref_id === null ? `${r.user_id}|${r.kind}|d|${r.local_date}` : `${r.user_id}|${r.kind}|r|${r.ref_id}`;
  const voer = async () => {
    await werkt(VERZOEK_MS);
    if (wissen) {
      wereld.verzonden = wereld.verzonden.filter((v) => v.id !== eq.id);
      return { data: null, error: null };
    }
    if (rij !== null) {
      const nieuw = rij;
      if (wereld.verzonden.some((v) => sleutel(v) === sleutel(nieuw))) {
        return { data: null, error: { code: '23505', message: 'duplicate key value' } };
      }
      const id = `n${wereld.verzonden.length}-${Math.random()}`;
      wereld.verzonden.push({ ...nieuw, id });
      return { data: { id }, error: null };
    }
    const count = wereld.verzonden.filter((v) =>
      Object.entries(eq).every(([k, w]) => (v as unknown as Record<string, unknown>)[k] === w)).length;
    return { data: null, error: null, count };
  };
  const q = {
    select: () => q,
    insert: (r: Omit<Verzonden, 'id'>) => { rij = { ...r }; return q; },
    delete: () => { wissen = true; return q; },
    eq: (k: string, w: unknown) => { eq[k] = w; return q; },
    is: (k: string, w: unknown) => { eq[k] = w; return q; },
    single: () => voer(),
    then: (a: (r: unknown) => void, b: (e: unknown) => void) => voer().then(a, b),
  };
  return q;
}

async function rpc(naam: string, args: Record<string, unknown>) {
  await werkt(VERZOEK_MS);
  const wie = String(args.p_user_id ?? '');
  if (naam === 'te_beoordelen_voor' && wereld.metWerk.has(wie)) {
    return { data: [{ completion_id: `voltooiing-van-${wie}`, owner_name: 'Buddy' }], error: null };
  }
  return { data: [], error: null };
}

vi.mock('jsr:@supabase/supabase-js@2', () => ({
  createClient: () => ({
    from: (tabel: string) => {
      if (tabel === 'profiles') return profielenQuery();
      if (tabel === 'push_tokens') return tokensQuery();
      if (tabel === 'notifications_sent') return verzondenQuery();
      return keten(leeg);
    },
    rpc,
  }),
}));

async function expo(_url: string, init: { body: string }): Promise<Response> {
  await werkt(VERZOEK_MS);
  for (const b of JSON.parse(init.body) as { to: string }[]) wereld.pushes.push(b.to);
  return new Response('{"data":[]}', { status: 200 });
}

function serviceRoleToken(): string {
  const deel = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${deel({ alg: 'HS256' })}.${deel({ role: 'service_role' })}.x`;
}

/** Eén handler per test: `Deno.serve()` draait op moduleniveau, dus maar één keer per import. */
let dezeTest: Afhandelaar | undefined;

async function handler(): Promise<Afhandelaar> {
  if (dezeTest !== undefined) return dezeTest;
  let gevangen: Afhandelaar | undefined;
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: (k: string) => (k === 'SUPABASE_URL' ? 'https://proef.supabase.co' : undefined) },
    serve: (a: Afhandelaar) => {
      gevangen = a;
      return { finished: Promise.resolve(), shutdown: () => Promise.resolve() };
    },
  };
  const naam = 'notificaties';
  await import(`../../supabase/functions/${naam}/index.ts`);
  if (gevangen === undefined) throw new Error('notificaties gaf geen handler aan Deno.serve');
  dezeTest = gevangen;
  return gevangen;
}

function profielen(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const hex = (i * 2654435761 % 2 ** 32).toString(16).padStart(8, '0');
    return `${hex}-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
  }).sort();
}

/**
 * Zet `n` profielen klaar. Elk `elkeMetToken`-de heeft een toestel, en van die
 * heeft elk `elkeMetWerk`-de een melding tegoed.
 */
function zetKlaar(n: number, elkeMetToken: number, elkeMetWerk = 1): void {
  wereld.profielen = profielen(n);
  const metToken = wereld.profielen.filter((_, i) => i % elkeMetToken === 0);
  wereld.metToken = new Set(metToken);
  wereld.metWerk = new Set(metToken.filter((_, i) => i % elkeMetWerk === 0));
}

/** Draait `runs` aanroepen van de handler tegelijk en wacht ze allemaal af. */
async function draai(runs = 1) {
  const h = await handler();
  const start = Date.now();
  let open = runs;
  const lopend = Array.from({ length: runs }, () =>
    Promise.resolve(h(new Request('https://proef.supabase.co/functions/v1/notificaties', {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceRoleToken()}` },
    }))).finally(() => { open -= 1; }));
  while (open > 0) await vi.advanceTimersByTimeAsync(50);
  const antwoorden = await Promise.all(lopend);
  const bodies = await Promise.all(antwoorden.map((a) => a.json() as Promise<Record<string, unknown>>));
  return { statussen: antwoorden.map((a) => a.status), bodies, duur: Date.now() - start };
}

beforeEach(() => {
  vi.resetModules();
  dezeTest = undefined;
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-11-17T04:02:00Z'));
  vi.stubGlobal('fetch', expo);
  Object.assign(wereld, {
    profielen: [], metToken: new Set(), metWerk: new Set(), verhuisd: new Set(), wisNaLezen: false, verzonden: [], pushes: [], gezien: [], tegelijk: 0, hoogste: 0,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (globalThis as { Deno?: unknown }).Deno;
});

describe('de notificatiejob op de naad tussen de profielenlus en de wandklok', () => {
  it('antwoordt binnen de wandklok, ook bij 20.000 profielen met een token', async () => {
    zetKlaar(20_000, 1, 10);
    const { statussen, bodies, duur } = await draai();

    expect(statussen).toEqual([200]);
    expect(bodies[0]?.ok).toBe(true);
    // 📏 De gedocumenteerde wandkloklimiet is 150 s; productie kapte af op ≈ 194 s.
    expect(duur).toBeLessThan(150_000);
  });

  it('zegt dat hij niet volledig was als het budget op is', async () => {
    zetKlaar(20_000, 1, 10);
    const { bodies } = await draai();

    expect(bodies[0]?.volledig).toBe(false);
    expect(wereld.gezien.length).toBeLessThan(20_000);
    expect(bodies[0]?.profielen).toBe(wereld.gezien.length);
  });

  it('ziet elk profiel met een token precies één keer als het budget ruim is', async () => {
    zetKlaar(450, 1, 3);
    const { bodies } = await draai();

    expect(bodies[0]?.volledig).toBe(true);
    expect(bodies[0]?.profielen).toBe(450);
    expect([...wereld.gezien].sort()).toEqual(wereld.profielen);
  });

  it('houdt de gelijktijdigheid begrensd', async () => {
    zetKlaar(450, 1, 3);
    await draai();

    expect(wereld.hoogste).toBe(8);
  });
});

describe('de rem op dubbel versturen, nu de lus parallel loopt', () => {
  it('verstuurt elke melding één keer, ook als twee runs tegelijk over dezelfde profielen lopen', async () => {
    zetKlaar(300, 1, 3);
    // ⚠️ **Dezelfde startplek voor allebei**, zodat ze in de pas lopen en op
    //    hetzelfde moment bij hetzelfde profiel zijn. Dat is het geval waar
    //    `alVerstuurd()` niets tegen kan — beide vragen zien nog geen rij — en
    //    dus het enige geval dat de index als rem toetst. Met twee willekeurige
    //    startplekken komt de tweede run meestal pas langs als de rij er al
    //    staat, en dan bewijst deze test alleen de vraag vooraf.
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('80000000-0000-4000-8000-000000000000');
    const { bodies } = await draai(2);

    const verwacht = [...wereld.metWerk].map((id) => `ExponentPushToken[${id}]`).sort();
    expect(bodies.every((b) => b.volledig === true)).toBe(true);
    expect([...wereld.pushes].sort()).toEqual(verwacht);
    expect(wereld.verzonden).toHaveLength(wereld.metWerk.size);
  });

  it('verstuurt niets opnieuw in de run erna', async () => {
    zetKlaar(300, 1, 3);
    await draai();
    const naEen = wereld.pushes.length;
    await draai();

    expect(naEen).toBe(wereld.metWerk.size);
    expect(wereld.pushes).toHaveLength(naEen);
  });
});

describe('alleen profielen met een token komen langs — QS8-691', () => {
  it('slaat een profiel zonder token over en ziet elk profiel met een token één keer', async () => {
    // 📏 De verhouding van productie op 17-11-2026: 16 van 1.332.
    zetKlaar(1_332, 83);
    const { bodies } = await draai();

    expect(wereld.metToken.size).toBe(17);
    expect([...wereld.gezien].sort()).toEqual([...wereld.metToken].sort());
    expect(bodies[0]?.profielen).toBe(wereld.metToken.size);
    expect(bodies[0]?.zonderToken).toBe(0);
    expect(bodies[0]?.volledig).toBe(true);
  });

  it('stuurt nog steeds elke melding die openstaat, en geen tweede', async () => {
    zetKlaar(1_332, 83);
    await draai();

    const verwacht = [...wereld.metWerk].map((id) => `ExponentPushToken[${id}]`).sort();
    expect([...wereld.pushes].sort()).toEqual(verwacht);
  });

  it('leest de tokens vers: een token dat na de pagina verhuisd is, krijgt niets', async () => {
    // ⚠️ De reden dat `push_tokens!inner(user_id)` alleen filtert en de tokens
    //    niet meeneemt (security-review op QS8-688, Laag 4). Een pagina kan
    //    tientallen seconden oud zijn als hij aan de beurt is.
    zetKlaar(1_332, 83);
    const weg = [...wereld.metWerk].slice(0, 5);
    for (const id of weg) wereld.verhuisd.add(id);
    const { bodies } = await draai();

    for (const id of weg) expect(wereld.pushes).not.toContain(`ExponentPushToken[${id}]`);
    expect(bodies[0]?.zonderToken).toBe(weg.length);
  });

  it('slaat niemand over als tokens tíjdens de run verdwijnen', async () => {
    // ⚠️ Security-review op QS8-691. De lijst is "profielen met een token", en
    //    die krimpt terwijl de job erdoor bladert. Met een offset schuift de
    //    volgende pagina dan op en valt er per pagina één profiel buiten,
    //    terwijl de run `volledig: true` zegt. Meer dan één pagina (200) nodig.
    zetKlaar(1_000, 1, 1_000);
    wereld.wisNaLezen = true;
    const alleMetToken = [...wereld.metToken].sort();
    const { bodies } = await draai();

    expect(bodies[0]?.volledig).toBe(true);
    expect([...wereld.gezien].sort()).toEqual(alleMetToken);
  });
});

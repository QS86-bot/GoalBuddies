import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { genereerVapidSleutelpaar } from '../../src/modules/notifications/webpush-crypto';

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
 *    9.–20. (QS8-690, na de batch-review en de twee reviews op het herstel,
 *       📏 17-11-2026, telkens één mutatie in de bron en `edge:sync`; de rode
 *       toetsen hieronder zijn die in dit bestand én `webpush-verzenden.test.ts`)
 *       - `abonnementFout()` noemt elke worp `ongeldig` → de drie
 *         "maakt … een mislukking"-toetsen en hier "wist niets als WebCrypto
 *         stuk is voor één abonnement…".
 *       - geen onderbreker → zes rood, waaronder hier "wist niets als elk
 *         abonnement van de run ongeldig is" en "…voor elk abonnement stuk is".
 *       - delete alleen op `token` → de drie "wist precies / hoogstens"-toetsen.
 *       - elke uitkomst behalve `bezorgd` wist → de vijf "wist niets…"-toetsen
 *         en "wist precies het ongeldige abonnement…".
 *       - `ongeldig` meteen wissen → de onderbreker-toets, "…voor elk
 *         abonnement stuk is" en "wist precies het ongeldige…".
 *       - de payloadgrens vóór de abonnementstoets → alleen "toetst het
 *         abonnement vóór de grens op de payload".
 *       - `ligtOpP256()` uitgezet → alleen "ziet een punt dat niet op de curve
 *         ligt als ongeldig zonder importKey…". ⚠️ Zonder die toets bleef alles
 *         groen, want Node's `importKey()` vangt het punt wél; in Deno niet.
 *       - plafond op 1000 → "laat per run hoogstens…", "wist hoogstens drie
 *         rijen…" en "deelt het plafond…".
 *       - een `ongetoetst` mislukt telt toch mee → "telt een mislukking …
 *         niet als bewijs" en "…voor elk abonnement stuk is".
 *       - de logregel van de onderbreker weg → alleen de onderbreker-toets.
 *       - de URL in de foutreden → alleen "zet geen endpoint in de reden…".
 *       - uitkomsten tellen in plaats van rijen → alleen "weegt rijen…".
 */

type Afhandelaar = (verzoek: Request) => Response | Promise<Response>;

const VERZOEK_MS = 50;

interface WebRij {
  token: string;
  platform: 'web';
  p256dh: string;
  auth: string;
}

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
  /** Web-abonnementen per profiel; wie hier staat, heeft géén iOS-toestel. */
  web: new Map<string, WebRij[]>(),
  /** Wat de pushdienst per endpoint antwoordt; zonder rij 201. */
  webAntwoord: new Map<string, number>(),
  /** Elke `delete` op `push_tokens`, met zijn filters. */
  gewist: [] as Record<string, unknown>[],
  /** De omgeving van de functie (`Deno.env`). */
  omgeving: {} as Record<string, string>,
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
  let wissen = false;
  const filters: Record<string, unknown> = {};
  const q = {
    select: () => q,
    delete: () => { wissen = true; return q; },
    eq: (k: string, w: string) => { filters[k] = w; if (k === 'user_id') wie = w; return q; },
    then: async (klaar: (r: unknown) => void) => {
      if (wissen) {
        await werkt(VERZOEK_MS);
        wereld.gewist.push({ ...filters });
        return klaar({ data: null, error: null });
      }
      wereld.gezien.push(wie);
      wereld.tegelijk += 1;
      wereld.hoogste = Math.max(wereld.hoogste, wereld.tegelijk);
      await werkt(VERZOEK_MS);
      wereld.tegelijk -= 1;
      const ios = [{ token: `ExponentPushToken[${wie}]`, platform: 'ios', p256dh: null, auth: null }];
      const data = wereld.metToken.has(wie) && !wereld.verhuisd.has(wie) ? (wereld.web.get(wie) ?? ios) : [];
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

async function expo(url: string, init: { body: string }): Promise<Response> {
  await werkt(VERZOEK_MS);
  if (!url.startsWith('https://exp.host/')) return new Response(null, { status: wereld.webAntwoord.get(url) ?? 201 });
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
    env: { get: (k: string) => (k === 'SUPABASE_URL' ? 'https://proef.supabase.co' : wereld.omgeving[k]) },
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
    web: new Map(), webAntwoord: new Map(), gewist: [], omgeving: {},
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

    // ⚠️ Een grens en geen vaste waarde: hoe vaak de piek 8 haalt hangt af van hoe snel de
    //    runner de nagemaakte verzoeken afwerkt. Op CI gaf een run 4 (17-11-2026, main
    //    `158c9915`, daarna groen). Wat de belofte eist: nooit meer dan acht, én echt parallel.
    expect(wereld.hoogste).toBeLessThanOrEqual(8);
    expect(wereld.hoogste).toBeGreaterThanOrEqual(2);
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

/**
 * QS8-690, batch-review 17-11-2026 — welke uitkomst van een web push een rij in
 * `push_tokens` kost, op de naad in `stuurWeb()`.
 *
 * ⚠️ **De belofte: `mislukt` wist niets, `weg` en `ongeldig` elk precies één
 *    rij, en een run waarin álles `ongeldig` is wist niets.** De beslissing per
 *    uitkomst staat onder test in `webpush-verzenden.test.ts`; wat ermee
 *    gebeurt, staat in de Edge Function, en daar draaide tot nu geen enkele test.
 *    📏 `if (uitkomst.status !== 'bezorgd')` vóór de delete bleef groen in de
 *    hele suite.
 */
describe('web push: wat een rij in push_tokens kost — QS8-690', () => {
  // Een geldig P-256-punt en een geheim van 16 octetten (zie webpush-verzenden.test.ts).
  const P256DH = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
  const AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';
  const NIET_OP_DE_CURVE = 'B' + 'A'.repeat(86);

  /** Drie profielen, elk met één melding tegoed en één web-abonnement. */
  async function zetWebKlaar(p256dhs: readonly string[]): Promise<WebRij[]> {
    zetKlaar(p256dhs.length, 1, 1);
    const paar = await genereerVapidSleutelpaar();
    wereld.omgeving = {
      EXPO_PUBLIC_VAPID_PUBLIC_KEY: paar.publiek,
      VAPID_PRIVATE_KEY: paar.prive,
      VAPID_SUBJECT: 'mailto:test@example.com',
    };
    return wereld.profielen.map((id, i) => {
      const rij: WebRij = {
        token: `https://fcm.googleapis.com/fcm/send/${id}`, platform: 'web', p256dh: p256dhs[i] ?? P256DH, auth: AUTH,
      };
      wereld.web.set(id, [rij]);
      return rij;
    });
  }

  const filtersVan = (rij: WebRij) => ({ token: rij.token, p256dh: rij.p256dh, auth: rij.auth });

  it('wist niets bij een storing van de pushdienst', async () => {
    const rijen = await zetWebKlaar([P256DH, P256DH, P256DH]);
    for (const rij of rijen) wereld.webAntwoord.set(rij.token, 500);
    await draai();

    expect(wereld.gewist).toEqual([]);
  });

  it('wist niets bij een kapotte VAPID-sleutel', async () => {
    await zetWebKlaar([P256DH, P256DH, P256DH]);
    wereld.omgeving.VAPID_PRIVATE_KEY = 'onzin';
    await draai();

    expect(wereld.gewist).toEqual([]);
  });

  it('wist precies het verdwenen abonnement, op endpoint én sleutels', async () => {
    const rijen = await zetWebKlaar([P256DH, P256DH, P256DH]);
    wereld.webAntwoord.set(rijen[1]!.token, 410);
    await draai();

    expect(wereld.gewist).toEqual([filtersVan(rijen[1]!)]);
  });

  it('wist precies het ongeldige abonnement als de run ook bruikbare zag', async () => {
    const rijen = await zetWebKlaar([P256DH, NIET_OP_DE_CURVE, P256DH]);
    await draai();

    expect(wereld.gewist).toEqual([filtersVan(rijen[1]!)]);
  });

  it('wist niets als elk abonnement van de run ongeldig is — de stroomonderbreker', async () => {
    await zetWebKlaar([NIET_OP_DE_CURVE, NIET_OP_DE_CURVE, NIET_OP_DE_CURVE]);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await draai();

    expect(wereld.gewist).toEqual([]);
    expect(log.mock.calls.map((c) => String(c[0]))).toContainEqual(expect.stringContaining('niets opgeruimd'));
  });

  it('wist niets als WebCrypto stuk is voor één abonnement terwijl de rest bezorgd wordt', async () => {
    // ⚠️ **Dit is de toets op `abonnementFout()` en niet op de onderbreker.**
    //    Is WebCrypto voor álle rijen stuk, dan springt de onderbreker en blijft
    //    de toets hieronder groen, ook als `abonnementFout()` elke worp weer
    //    `ongeldig` noemt (📏 gemeten bij de ijking, 17-11-2026). Hier wordt de
    //    andere rij bezorgd, dus alleen de toets zelf houdt de delete tegen.
    const ander = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const rauw = new Uint8Array(await crypto.subtle.exportKey('raw', ander.publicKey));
    const kapot = Buffer.from(rauw).toString('base64url');
    await zetWebKlaar([P256DH, kapot, P256DH]);
    const echt = crypto.subtle.importKey.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'importKey').mockImplementation(((...args: Parameters<typeof echt>) => {
      const [formaat, data] = args;
      if (formaat === 'raw' && Buffer.from(data as Uint8Array).equals(Buffer.from(rauw))) {
        return Promise.reject(new TypeError('runtime kapot'));
      }
      return echt(...args);
    }) as typeof crypto.subtle.importKey);
    await draai();

    expect(wereld.gewist).toEqual([]);
  });

  it('wist niets als WebCrypto voor elk abonnement stuk is', async () => {
    await zetWebKlaar([P256DH, NIET_OP_DE_CURVE, P256DH]);
    vi.spyOn(crypto.subtle, 'importKey').mockRejectedValue(new TypeError('runtime kapot'));
    await draai();

    expect(wereld.gewist).toEqual([]);
  });

  it('wist hoogstens drie rijen per run, ook als een fout bijna elk abonnement ongeldig maakt', async () => {
    // ⚠️ **De les van de security-review op het herstel.** 📏 Een
    //    `vanBase64url()` zonder `-`/`_`-vertaling maakt ≈ 96% van de abonnementen
    //    ongeldig en laat de rest heel: de onderbreker springt dan niet, dit
    //    plafond houdt het klein.
    const rijen = await zetWebKlaar([P256DH, ...Array.from({ length: 6 }, () => NIET_OP_DE_CURVE)]);
    await draai();

    expect(wereld.gewist).toHaveLength(3);
    for (const filter of wereld.gewist) expect(rijen.slice(1).map(filtersVan)).toContainEqual(filter);
  });

  it('deelt het plafond met verdwenen abonnementen', async () => {
    const rijen = await zetWebKlaar([P256DH, P256DH, P256DH, P256DH, P256DH]);
    for (const rij of rijen) wereld.webAntwoord.set(rij.token, 410);
    await draai();

    expect(wereld.gewist).toHaveLength(3);
  });
});


import { createClient } from 'jsr:@supabase/supabase-js@2';

// ⚠️ Rechtstreeks uit zoned.ts en niet via index.ts — dezelfde reden als in
//    `rollover/index.ts`: die index re-exporteert clock.ts, en dat bestand leest
//    `process.env` om `freezeNow()` in productie te weigeren. Op Deno is dat een
//    valkuil die je pas merkt als de job 's nachts stilvalt.
import { localDateIn } from '../_shared/time/zoned.ts';
import { meld } from '../_shared/melden.ts';
import { metCors } from '../_shared/cors.ts';

/**
 * De koppelpas — QS8-233, migraties 0299 en 0300.
 *
 * Laat verlopen wachtopdrachten verlopen en vormt daarna groepen van drie tot
 * vijf uit de wachtrij: mensen met dezelfde doelcategorie, dezelfde periodeband
 * en **dezelfde week-startdag**.
 *
 * ⚠️⚠️ **Waarom een Edge Function en geen trigger op de wachtrij.** Een trigger
 *    op de insert zou draaien in de transactie van de gebruiker die net
 *    instapte, én onder diens autorisatie — terwijl de handeling rijen van
 *    *anderen* aanmaakt: lidmaatschappen, koppelingen, een groep. Dat is precies
 *    wat `verwijder_lid()` en `zet_groepszichtbaarheid()` niet doen. En wie als
 *    derde in de bak stapt, zou de groepsvorming van vijf mensen betalen in zijn
 *    eigen verzoek — onwrikbare regel 8 in zijn algemene vorm.
 *
 * ⚠️ **Autorisatie.** `verify_jwt` staat aan, dus het platform controleert de
 *    handtekening. Daar bovenop moet de rol `service_role` zijn: deze functie
 *    zet mensen bij elkaar in een groep, en een gewone ingelogde gebruiker heeft
 *    ook een geldig JWT. `vorm_buddygroepen()` draagt geen `grant execute to
 *    authenticated`, dus de database weigert hem óók — dit is de tweede grendel
 *    en niet de enige.
 *
 * ⚠️ **Idempotent, en op drie niveaus.** `vorm_buddygroepen()` neemt een
 *    advisory lock, leest kandidaten met `for update skip locked`, en de
 *    partiële unieke index op `goal_match_queue` laat hoogstens één wachtende
 *    rij per doel bestaan. Twee runs tegelijk vormen dus geen twee groepen uit
 *    dezelfde mensen; een overgeslagen uur wordt bij de volgende run ingehaald.
 */

/**
 * Hoeveel bakken één ronde maximaal verwerkt.
 *
 * ⚠️ Onwrikbare regel 10 in de vorm die hier telt: een job zonder scherm die
 *    ongelimiteerd doorwerkt, valt om op de dag dat het uitmaakt. Twintig bakken
 *    per uur is 480 groepen per dag — ruim boven wat deze gebruikersbasis kan
 *    produceren. Raakt hij de grens, dan blijven de rijen `wachtend` en pakt de
 *    volgende ronde ze op; er gaat niets verloren.
 */
const BAKKEN_PER_RONDE = 20;

/**
 * De peildatum waartegen de periodeband gemeten wordt.
 *
 * ⚠️⚠️ **Eén gedeelde peildag voor de hele run, en dat is het ontwerp en geen
 *    compromis.** De band is een vergelijking *tussen* gebruikers: zitten deze
 *    twee doelen ongeveer in dezelfde periode? Zou elke gebruiker tegen zijn
 *    eigen "vandaag" gebandeerd worden, dan is de indeling niet meer coherent —
 *    twee mensen met dezelfde streefdatum konden dan in verschillende bakken
 *    vallen omdat de een net over middernacht is.
 *
 *    Domeinregel 2 eist "vandaag in de tijdzone van de gebruiker" voor wat over
 *    díe gebruiker gaat: zijn cyclus, zijn week, zijn streak. Een
 *    sorteersleutel die mensen onderling vergelijkt is iets anders, en die hoort
 *    één nulpunt te hebben.
 *
 * ⚠️ De dag komt uit `_shared/time` en niet uit `toISOString().slice(0, 10)`.
 *    Dat laatste is dezelfde berekening met de hand, op de plek waar
 *    correctheidsregel 7 zegt dat die niet hoort.
 */
const PEILZONE = 'UTC';

/** De rol uit een JWT, zonder de handtekening te controleren — dat deed het platform al. */
function rolUit(authHeader: string): string {
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const stukken = token.split('.');
  if (stukken.length !== 3) return '';

  try {
    const payload = stukken[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '='));
    const claims = JSON.parse(json) as { role?: string };
    return claims.role ?? '';
  } catch {
    return '';
  }
}

/**
 * De systeemclient, met het type dat de aanroep zélf oplevert.
 *
 * ⚠️ Een functie en geen `ReturnType<typeof createClient>` — QS8-424. Die vorm
 *    instantieert de generieken met hun defaults (`unknown` en `never`), en die
 *    zijn niet toewijsbaar aan wat de echte aanroep oplevert.
 */
function maakClient(auth: string) {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? auth.replace(/^Bearer\s+/i, ''),
    { auth: { persistSession: false } },
  );
}

interface Vormuitkomst {
  readonly bakken?: number;
  readonly gevormd?: number;
  readonly leden?: number;
}

// ⚠️ `metCors` ook hier, terwijl deze functie server-side wordt aangeroepen en
//    dus nooit een preflight krijgt — QS8-195, punt 3. Zonder `Origin` doet
//    `metCors` niets; mét een `Origin` bespaart hij de volgende die hem vanaf het
//    web probeert twee minuten zoeken.
Deno.serve(metCors(async (req: Request) => {
  const auth = req.headers.get('Authorization') ?? '';

  if (rolUit(auth) !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Alleen aanroepbaar als service_role' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ⚠️ De hele run in een vangnet, en `await` vóór het antwoord. Supabase kan
  //    een Edge Function bevriezen zodra het antwoord verstuurd is; een
  //    niet-afgewachte melding komt dan nooit aan. Eerst melden, dan antwoorden.
  try {
    return await draaiKoppelpas(auth);
  } catch (fout) {
    await meld(fout, 'koppelen', { code: 'koppelen_onverwacht_gestopt' });
    return new Response(JSON.stringify({ error: 'koppelen_onverwacht_gestopt' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}));

async function draaiKoppelpas(auth: string): Promise<Response> {
  const db = maakClient(auth);
  const nu = new Date();
  const vandaag = localDateIn(PEILZONE, nu);

  // ⚠️ **Verlopen eerst, en die volgorde is bindend.** Een wachtopdracht die
  //    vandaag verloopt, hoort niet in de bak van deze ronde te belanden: dan
  //    krijgt iemand een groep op de dag dat de app besloot te stoppen met
  //    zoeken. Eén functie, één ding — daarom twee aanroepen en niet één.
  const verlopen = await db.rpc('verloop_buddyzoekopdrachten', { p_nu: nu.toISOString() });

  if (verlopen.error) {
    await meld(verlopen.error, 'koppelen', { code: 'verloop_mislukt' });
    return antwoord({ ok: false, stap: 'verloop' }, 500);
  }

  const gevormd = await db.rpc('vorm_buddygroepen', {
    p_vandaag: vandaag,
    p_max_groepen: BAKKEN_PER_RONDE,
  });

  if (gevormd.error) {
    await meld(gevormd.error, 'koppelen', { code: 'vormen_mislukt' });
    return antwoord({ ok: false, stap: 'vormen' }, 500);
  }

  const uit = (gevormd.data ?? {}) as Vormuitkomst;

  return antwoord({
    ok: true,
    peildag: vandaag,
    verlopen: typeof verlopen.data === 'number' ? verlopen.data : 0,
    bakken: uit.bakken ?? 0,
    gevormd: uit.gevormd ?? 0,
    leden: uit.leden ?? 0,
  });
}

/**
 * ⚠️ Alleen tellingen, nooit een naam of een id. Het logboek van een Edge
 *    Function is geen groepszichtbaar oppervlak, maar het is wél een plek waar
 *    gegevens blijven staan — en "wie is er met wie gekoppeld" is precies wat
 *    domeinregel 7 beschermt.
 */
function antwoord(lichaam: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(lichaam), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

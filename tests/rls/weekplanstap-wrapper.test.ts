/**
 * De afgeschreven driearguments wrapper op `activeer_weekplanstap` — QS8-324,
 * migratie 0186.
 *
 * ⚠️ **De belofte is niet "er staat een wrapper" maar "de wrapper is geen gat".**
 *    0185 dropte `activeer_weekplanstap(uuid, date, integer)` terwijl de
 *    gedeployde rollover die vorm nog aanroept; 0186 zet hem terug zodat een
 *    deploy weer een gewone deploy is in plaats van een volgorde-eis die nergens
 *    afdwingbaar is. Maar een functie terugzetten is precies het moment waarop
 *    Supabase's `alter default privileges` er stilzwijgend `anon` en
 *    `authenticated` bij geeft — en dan is de wrapper ruimer dan wat hij inpakt.
 *
 * ⚠️ **Daarom toetst dit bestand de twee vormen naast elkaar en niet los.** Een
 *    test die alleen zegt "de wrapper mag niet door anon" blijft groen als
 *    iemand de tweearguments vorm verruimt; een test die ze vergelijkt, niet.
 *    Regel 18 vraag 2 — de belofte is de gelijkheid.
 */
import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

const beschikbaar = stackBeschikbaarOfFaal(
  "select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'activeer_weekplanstap' limit 1",
  'tests/rls/weekplanstap-wrapper.test.ts',
);

/** `anon=f auth=f svc=t` voor één handtekening, uit de database zelf. */
function rechtenVan(argumenten: string): string {
  return psql(
    `select 'anon=' || left(has_function_privilege('anon','public.activeer_weekplanstap(${argumenten})','execute')::text,1)
         || ' auth=' || left(has_function_privilege('authenticated','public.activeer_weekplanstap(${argumenten})','execute')::text,1)
         || ' svc='  || left(has_function_privilege('service_role','public.activeer_weekplanstap(${argumenten})','execute')::text,1)`,
  ).trim();
}

describe.skipIf(!beschikbaar)('de afgeschreven wrapper op activeer_weekplanstap', () => {
  it('beide handtekeningen bestaan — de gedeployde rollover vindt de zijne terug', () => {
    const vormen = psql(
      `select string_agg(p.oid::regprocedure::text, ' | ' order by p.oid::regprocedure::text)
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'activeer_weekplanstap'`,
    ).trim();

    expect(vormen).toBe(
      'activeer_weekplanstap(uuid,date) | activeer_weekplanstap(uuid,date,integer)',
    );
  });

  it('de wrapper heeft exact de rechten van de functie die hij inpakt', () => {
    // ⚠️ Dít is de grendel. Zonder de revoke in 0186 staat hier
    //    `anon=t auth=t svc=t` op een vorm die doorgeeft aan een SECURITY
    //    DEFINER — en dan is de wrapper de achterdeur.
    const origineel = rechtenVan('uuid, date');
    const wrapper = rechtenVan('uuid, date, integer');

    expect(origineel).toBe('anon=f auth=f svc=t');
    expect(wrapper).toBe(origineel);
  });

  it('de wrapper is zelf geen definer — de autorisatie blijft bij het origineel', () => {
    // ⚠️ Een tweede definer bovenop een definer is oppervlak zonder reden, en
    //    elke definer hier is een kopie van de vorige. 98 van de 118 functies
    //    zijn er al een (QS8-181); deze wordt de 99e niet.
    const definer = psql(
      `select p.prosecdef::text
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.oid = 'public.activeer_weekplanstap(uuid,date,integer)'::regprocedure`,
    ).trim();

    expect(definer).toBe('false');
  });

  it('beide vormen geven hetzelfde antwoord voor een doel zonder stappen', () => {
    // ⚠️ De belofte van een wrapper is dat hij niets verandert. Een doel zonder
    //    weekplanstappen geeft `geen_stap`; als de wrapper zijn derde argument
    //    ergens tóch zou laten meewegen, wijkt hij hier af.
    const leeg = '00000000-0000-0000-0000-000000000000';
    const tweeArg = psql(
      `select public.activeer_weekplanstap('${leeg}'::uuid, '2026-01-05'::date)::text`,
    ).trim();
    const drieArg = psql(
      `select public.activeer_weekplanstap('${leeg}'::uuid, '2026-01-05'::date, 7)::text`,
    ).trim();

    expect(tweeArg).toContain('geen_stap');
    expect(drieArg).toBe(tweeArg);
  });

  it('het derde argument wordt genegeerd en niet doorgegeven', () => {
    // ⚠️ Een onzinnige index mag niets veranderen: de kolom die hij vulde
    //    bestaat sinds 0185 niet meer. Zou iemand de wrapper ooit "af maken"
    //    door het argument alsnog ergens in te schuiven, dan valt dit om.
    const leeg = '00000000-0000-0000-0000-000000000000';
    const negatief = psql(
      `select public.activeer_weekplanstap('${leeg}'::uuid, '2026-01-05'::date, -99)::text`,
    ).trim();
    const nul = psql(
      `select public.activeer_weekplanstap('${leeg}'::uuid, '2026-01-05'::date, null::integer)::text`,
    ).trim();

    expect(negatief).toContain('geen_stap');
    expect(nul).toBe(negatief);
  });
});

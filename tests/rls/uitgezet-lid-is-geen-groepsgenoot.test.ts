import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een uitgezet lid is geen groepsgenoot meer — QS8-146, migratie 0159.
 *
 * ⚠️ **De belofte is niet "`shares_group_with_user()` geeft false".** Dat is de
 *    functie. De belofte is: *wie uit een groep gezet is, is voor die groep niet
 *    meer zichtbaar* — en die hangt aan twee oppervlakken die allebei langs die
 *    functie lopen: `profiles_select` (0003/0122) en `avatars_select` op
 *    `storage.objects` (0126/0130). Daarom meet elk geval hieronder allebei.
 *
 * ⚠️⚠️ **Wat er misging is dat er twee wegen naar dezelfde toestand zijn.**
 *    `verlaat_groep()` (0102) verwíjdert de lidmaatschapsrij; `verwijder_lid()`
 *    (0145) zet hem op `inactive` en laat hem staan — met opzet, want die rij ís
 *    het slot dat heraansluiten met dezelfde code tegenhoudt. 📏 Gemeten vóór
 *    0159, als Alice:
 *
 *      bob is actief lid                        true
 *      bob is uitgezet (status = 'inactive')    true      ← het gat
 *      carol neemt een adempauze                true      (hoort zo)
 *      carol vertrekt (rij weg)                 false
 *
 *    Vertrekken maakte je onzichtbaar, eruit gezet worden niet. Dat is dezelfde
 *    ontbrekende helft die 0102 in `shares_group_with_goal()` aanvulde, op de
 *    functie ernaast.
 *
 * ⚠️ **Tweezijdig, en dat is hier geen bijvangst.** Naast elk geval dat dícht
 *    hoort te gaan staat er een dat open moet blijven: een adempauze is geen
 *    uitzetting (0029), en een gearchiveerde groep blijft leesbaar (0153). Een
 *    test die alleen het dichtgaan meet, is ook groen bij een functie die
 *    iedereen weigert.
 *
 * ⚠️ **Waarom psql en niet de harness.** `storage.objects` is geen
 *    PostgREST-oppervlak, en de toestand van een lidmaatschap zetten vraagt een
 *    supergebruiker. Alles draait in één transactie die terugrolt. Dezelfde vorm
 *    als `avatarbucket.test.ts`.
 */

/**
 * ⚠️ **De proef vraagt naar de emmer en niet naar de reparatie zelf.** Zou hij
 *    naar de tegenpartijtoets in `shares_group_with_user()` kijken, dan slaat
 *    deze suite zichzelf over zodra iemand die toets weghaalt — en dan vangt de
 *    beschikbaarheidsgrendel het geval af dat de asserties horen te vangen. Een
 *    ijking die daarlangs loopt, bewaakt niets van wat ze belooft (CLAUDE.md,
 *    regel 18). Draait de stack op een schema van vóór 0159, dan worden de
 *    asserties hieronder rood, en dat is de goede uitslag.
 */
const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from storage.buckets where id = 'avatars'",
  import.meta.url,
);

const ALICE = '00000000-0000-4000-8000-00000000a146';
const BOB = '00000000-0000-4000-8000-00000000b146';
const GROEP = '00000000-0000-4000-8000-00000000e146';

/** Alice en Bob in één groep, Bob met een avatar. */
const OPSTELLING = `
  insert into auth.users (id, email) values
    ('${ALICE}', 'alice146@x.nl'), ('${BOB}', 'bob146@x.nl');
  insert into groups (id, name, created_by, status, invite_code, categorie)
    values ('${GROEP}', 'Model146', '${ALICE}', 'active', 'MODEL146', 'other');
  insert into group_members (group_id, user_id, role, status) values
    ('${GROEP}', '${ALICE}', 'admin', 'active'),
    ('${GROEP}', '${BOB}', 'member', 'active');
  insert into storage.objects (bucket_id, name, owner)
    values ('avatars', '${BOB}/foto.jpg', '${BOB}');
`;

interface Zicht {
  profiel: number;
  avatar: number;
}

/**
 * Wat ziet `kijker` van `doelwit`, nadat `wijziging` is toegepast?
 *
 * ⚠️ `set local role authenticated` én de claims, want de policies leunen op
 *    allebei: de rol bepaalt wélke policies gelden, `auth.uid()` de uitkomst.
 *    Alleen de rol zetten geeft `auth.uid() is null` en dan weigert álles —
 *    groen om de verkeerde reden.
 */
function zicht(wijziging: string, kijker = ALICE, doelwit = BOB): Zicht {
  const claims = JSON.stringify({ sub: kijker, role: 'authenticated' }).replace(/'/g, "''");

  const regel = psql(`
    begin;
    ${OPSTELLING}
    ${wijziging}
    select set_config('request.jwt.claims', '${claims}', true);
    set local role authenticated;
    select 'meting|'
      || (select count(*) from public.profiles where id = '${doelwit}')
      || '|' || (select count(*) from storage.objects
                  where bucket_id = 'avatars' and name like '${doelwit}/%');
    reset role;
    rollback;
  `)
    .split('\n')
    .find((r) => r.startsWith('meting|')) as string;

  const [, profiel, avatar] = regel.split('|');
  return { profiel: Number(profiel), avatar: Number(avatar) };
}

const UITZETTEN = `update group_members set status = 'inactive'
                    where group_id = '${GROEP}' and user_id = '${BOB}';`;

describe.skipIf(!beschikbaar)('wie uit de groep gezet is, is niet meer zichtbaar', () => {
  it('laat een actief lid gewoon zien — anders bewijst de rest niets', () => {
    // ⚠️ De must-see vooraf. Zonder dit geval is elke nul hieronder ook te
    //    halen met een opstelling die überhaupt niets oplevert (valkuil 10).
    expect(zicht('')).toEqual({ profiel: 1, avatar: 1 });
  });

  it('sluit zijn profiel én zijn avatar af zodra hij uitgezet is', () => {
    // Dit is het gat: vóór 0159 stond hier { profiel: 1, avatar: 1 }.
    expect(zicht(UITZETTEN)).toEqual({ profiel: 0, avatar: 0 });
  });

  it('en doet dat ook de andere kant op', () => {
    // ⚠️ De uitgezette kant was al dicht (0029 kneep de kijker af). Hij staat
    //    hier omdat de belofte "in geen van beide richtingen" is: zou iemand
    //    ooit de kijkerstoets weghalen omdat de tegenpartijtoets er nu is, dan
    //    valt dit om.
    expect(zicht(UITZETTEN, BOB, ALICE)).toEqual({ profiel: 0, avatar: 0 });
  });
});

describe.skipIf(!beschikbaar)('en wie er nog wél bij hoort, blijft zichtbaar', () => {
  it('een adempauze is geen uitzetting', () => {
    // 0029: "wie even niet meedoet, hoort zijn groep gewoon te kunnen lezen.
    // Zou `paused` hier meelopen, dan is een adempauze nemen hetzelfde als
    // eruit gezet worden."
    const pauze = `update group_members set status = 'paused'
                    where group_id = '${GROEP}' and user_id = '${BOB}';`;
    expect(zicht(pauze)).toEqual({ profiel: 1, avatar: 1 });
  });

  it('een gearchiveerde groep blijft leesbaar', () => {
    // 0153: een archief is leesbaar. Deze functie staat aan de leeskant, dus de
    // archieftoets hoort hier níét te staan — anders wordt een groep
    // archiveren hetzelfde als iedereen wegsturen.
    const archief = `update groups set status = 'archived' where id = '${GROEP}';`;
    expect(zicht(archief)).toEqual({ profiel: 1, avatar: 1 });
  });

  it('en een eigen profiel en avatar blijven altijd van jezelf', () => {
    // De eerste tak van beide policies (`id = auth.uid()`) raakt dit niet, en
    // die tak is wat een uitgezet lid overhoudt.
    expect(zicht(UITZETTEN, BOB, BOB)).toEqual({ profiel: 1, avatar: 1 });
  });
});

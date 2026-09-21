/**
 * De knip die commentaar uit **SQL** haalt — de tegenhanger van
 * `scripts/zonder-commentaar.mjs`, die JS en TS doet.
 *
 * ⚠️⚠️ **Dit is een grendel en geen hulpfunctie**, precies zoals de JS-knip
 *    ernaast. Hij bepaalt wat er in een migratie *code* heet en wat *uitleg*.
 *    Knipt hij te veel weg, dan blijft de zeef erboven groen terwijl de belofte
 *    breekt; knipt hij te weinig, dan stelt een toelichting die oude SQL citeert
 *    een toets tevreden die over de echte SQL gaat.
 *
 * ⚠️⚠️ **Hij laat tekstliteralen staan, en daar hangt een belofte aan.** Een
 *    migratie-toets als `expect(MIGRATIE).toMatch(/values\s*\(\s*'avatars'/)`
 *    heeft die quotes juist nodig. Dat is het verschil met
 *    `zonderCommentaarEnTekst` in `tests/migraties/idempotentie.ts`, die ze
 *    wél weghaalt — een andere belofte, en dus een andere knip.
 *
 * ## Waar hij vandaan komt
 *
 * ⚠️ **Verhuisd uit `scripts/sleutelvorm-controle.mjs` bij QS8-574**, waar hij
 *    sinds QS8-491 stond. Hij was daar al niet meer van één controle:
 *    `dml-controle.mjs` importeerde hem er met zoveel woorden uit, *"de knip van
 *    `sleutelvorm-controle.mjs` en geen eigen"*. Een gedeelde knip die in het
 *    bestand van één consument woont, is een kopie die nog niet gemaakt is —
 *    en QS8-574 had er een derde en vierde consument bij. Zelfde beweging en
 *    dezelfde reden als QS8-446 voor de JS-knip.
 *
 * ⚠️ **De metingen eronder zijn niet mee verhuisd maar hier overgenomen**, want
 *    CLAUDE.md waarschuwt dat een verhuizing juist de belofte kwijtraakt terwijl
 *    de tests groen meeverhuizen:
 *
 * 📏 **Hij loopt om quotes heen, en dat is gemeten en geen voorzorg.** De eerste
 *    versie knipte met één regex op `--`, en op
 *    `v_x := 'a--b' || nullif(current_setting('app.k', true), '') = old.id::text;`
 *    hield die `v_x := 'a` over: **nul** leesplekken waar er één hoort, dus een
 *    kale vergelijking die stil doorglipt.
 *
 * 📏 **Dollar-quotes en geneste blokken tellen mee (QS8-491).** Een knip die
 *    alleen om enkele quotes heen loopt, kapt op de `--` in
 *    `v_sql := $q$a--b$q$ || (nullif(…) = old.id)` en vindt nul leesplekken waar
 *    er één onveilige hoort. Postgres nest blokcommentaar bovendien, dus dat
 *    wordt geteld.
 *
 * ⚠️ **En de toets die dat had moeten vangen deed het niet.** Die zette de `--`
 *    en de leesplek op verschillende régels, en dan valt de vorm binnen de knip
 *    zijn eigen regelgrens — groen om een reden die niets met de belofte te
 *    maken heeft. Precies de val die CLAUDE.md bij regel 18 noemt, en de reden
 *    dat de ijking in `tests/scripts/zonder-sql-commentaar.test.ts` zijn
 *    gevallen op één regel zet.
 *
 * ⚠️ **`.mjs` en niet `.ts`, zodat beide bomen hem kunnen importeren.**
 *    `scripts/` is plain JS en kan geen `.ts` uit `tests/` halen; andersom kan
 *    wel. Zelfde reden als bij de JS-knip ernaast.
 */

/** De dollar-quote die op `i` begint, of `null`. */
function dollarTag(src, i) {
  if (src[i] !== '$') return null;
  const m = /^\$([A-Za-z_0-9]*)\$/.exec(src.slice(i));
  return m ? m[0] : null;
}

/** Een tekstliteral — enkel gequote of dollar-gequote — gaat ongemoeid mee. */
function neemLetterlijk(src, i) {
  const tag = dollarTag(src, i);
  if (tag) {
    const dicht = src.indexOf(tag, i + tag.length);
    const eind = dicht === -1 ? src.length : dicht + tag.length;
    return { uit: src.slice(i, eind), eind };
  }

  if (src[i] !== "'") return null;

  let j = i + 1;
  while (j < src.length) {
    if (src[j] === "'" && src[j + 1] === "'") j += 2;
    else if (src[j] === "'") return { uit: src.slice(i, j + 1), eind: j + 1 };
    else j += 1;
  }
  return { uit: src.slice(i), eind: src.length };
}

/** Commentaar wordt een spatie; een blok telt zijn nesting, zoals Postgres. */
function neemCommentaar(src, i) {
  if (src[i] === '-' && src[i + 1] === '-') {
    const nl = src.indexOf('\n', i);
    return { uit: ' ', eind: nl === -1 ? src.length : nl };
  }
  if (src[i] !== '/' || src[i + 1] !== '*') return null;
  return { uit: ' ', eind: naBlok(src, i) };
}

/** Het eind van een blokcommentaar op `i`, met nesting meegeteld. */
function naBlok(src, i) {
  let diepte = 0;
  let j = i;
  while (j < src.length) {
    if (src[j] === '/' && src[j + 1] === '*') {
      diepte += 1;
      j += 2;
    } else if (src[j] === '*' && src[j + 1] === '/') {
      diepte -= 1;
      j += 2;
      if (diepte === 0) return j;
    } else j += 1;
  }
  return src.length;
}

/**
 * De SQL zonder commentaar, met tekstliteralen intact.
 *
 * ⚠️ Een `--`-comment wordt één spatie en geen regeleinde, dus regelnúmmers
 *    verschuiven niet maar regelínhoud wel. Wie posities meldt, leest dit eerst.
 */
export function zonderCommentaarSql(bron) {
  const src = String(bron);
  let uit = '';
  let i = 0;

  while (i < src.length) {
    const sprong = neemLetterlijk(src, i) ?? neemCommentaar(src, i);
    if (sprong === null) {
      uit += src[i];
      i += 1;
    } else {
      uit += sprong.uit;
      i = sprong.eind;
    }
  }

  return uit;
}

-- 0128_de_uitnodiging_noemt_geen_avatarpad.sql — een uitnodigingslink geeft geen gebruikers-id's
--
-- ROLLBACK-PAD:
--   De versie van 0080 terugzetten: `'avatar_url', case when ingelogd then
--   p.avatar_url else null end`. ⚠️ Doe dat niet zonder de kop hieronder te lezen —
--   dat zet een lek terug dat niemand ooit besloten heeft te openen.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gevonden door de security-reviewer bij 0126, en daarna zelf nagemeten tegen
-- `pg_get_functiondef('invite_preview')` op de lopende database.
--
-- 📏 De functie is `SECURITY DEFINER` en geeft aan een **ingelogde** aanroeper
--    `p.avatar_url` van maximaal acht leden. Tot 0126 was die kolom altijd leeg —
--    er was geen bucket en geen uploadpad — dus dat kanaal was inert. Sinds 0126
--    draagt hij `<user_id>/<willekeurig>.<ext>`, en **het eerste padsegment ís de
--    `auth.uid()` van dat lid**.
--
-- ⚠️ **Het gevolg is geen kapotte avatar maar een identiteitslek.** Een
--    uitnodigingscode verloopt nooit en is bedoeld om doorgestuurd te worden.
--    Iedereen met een account die de link krijgt — géén lid, nooit lid geweest —
--    doet één RPC-aanroep en heeft de interne id's van acht mensen. Die id's zijn
--    de sleutel waarop elders in dit schema alles hangt.
--
-- ⚠️ **Ondertekenen lost dit níet op, en dat is de reden dat de reparatie hier
--    staat en niet in de datalaag.** Een signed URL draagt het pad in zich; het
--    id gaat er gewoon in mee. Alleen wegláten helpt.
--
-- ⚠️ **Dit is precies de verruiming die 0019 heeft dichtgezet, langs een andere
--    weg.** `docs/ENGINEER-REVIEW.md` legt vast dat deze functie in augustus is
--    ingeperkt omdat "koppelen toestemming is voor de gróép, niet voor iedereen
--    aan wie de link ooit wordt doorgestuurd". Die inperking gold voor de
--    níet-ingelogde tak. De ingelogde tak is nooit heroverwogen, en 0126 vulde de
--    kolom die eronder hing. Niemand heeft dit besloten; het is bijvangst.
--
-- ---------------------------------------------------------------------------
-- Wat de uitnodigingspagina hierdoor verliest, en waarom dat de juiste kant is
-- ---------------------------------------------------------------------------
--
-- `app/uitnodiging/[code].tsx` toont voortaan initialen in plaats van foto's.
-- `Avatar` doet dat vanzelf bij `null` — dat is de terugval waar hij voor gemaakt
-- is (leerpunt uit de Habit Huddle-analyse), dus er breekt niets.
--
-- ⚠️ **Dit is bewust de conservatiefste optie die het werk áf maakt.** Foto's
--    tonen aan wie de link heeft kán, maar dan is er een padvorm nodig die het
--    gebruikers-id niet draagt — en dat is een besluit met een migratie, geen
--    detail van deze reparatie. CLAUDE.md: voor élk nieuw oppervlak is beschermd
--    het antwoord tot iemand het tegendeel besluit.
--
-- ⚠️ Volledige body overgenomen uit `pg_get_functiondef()` en niet uit een
--    migratiebestand — inclusief commentaar, want een `apply_migration` met een
--    ingekorte body kost de toelichting in productie (36 functies draaien daar al
--    zonder). Eén regel wijzigt.
--
-- ---------------------------------------------------------------------------

create or replace function public.invite_preview(code text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  g          groups%rowtype;
  aantal     integer;
  leden      jsonb;
  ingelogd   boolean := auth.uid() is not null;
begin
  select * into g
  from groups
  where invite_code = code
    and invite_revoked = false
    and status <> 'archived';

  if g.id is null then
    return null;
  end if;

  select count(*) into aantal
  from group_members
  where group_id = g.id and status <> 'inactive';

  select coalesce(jsonb_agg(rij), '[]'::jsonb) into leden
  from (
    select jsonb_build_object(
      'display_name', case
        when ingelogd then p.display_name
        else split_part(btrim(p.display_name), ' ', 1)
      end,
      -- ⚠️ Altijd null, ook voor een ingelogde aanroeper — migratie 0128.
      --    Sinds 0126 is dit een pad waarvan het eerste segment de auth.uid()
      --    van dat lid is. Een uitnodigingslink verloopt nooit en wordt
      --    doorgestuurd; hem meesturen geeft de interne id's van acht mensen weg
      --    aan iemand die geen lid is. Ondertekenen helpt niet — het pad zit in
      --    de signed URL. Het scherm toont initialen, en dat is de terugval waar
      --    `Avatar` voor gemaakt is.
      'avatar_url', null,
      'goal_title', case
        when ingelogd then (
          select gg.title
          from goals gg
          join goal_group_links l on l.goal_id = gg.id
          where l.group_id = g.id
            and gg.owner_id = m.user_id
            and gg.status = 'active'
          order by gg.target_date asc
          limit 1
        )
        else null
      end
    ) as rij
    from group_members m
    join profiles p on p.id = m.user_id
    where m.group_id = g.id and m.status <> 'inactive'
    order by m.joined_at asc
    limit 8
  ) t;

  return jsonb_build_object(
    'group_id',      g.id,
    'group_name',    g.name,
    'icon',          g.icon,
    'huddle_day',    g.huddle_day,
    'zichtbaarheid', g.zichtbaarheid,
    'member_count',  aantal,
    'detailed',      ingelogd,
    'members',       leden
  );
end;
$function$;

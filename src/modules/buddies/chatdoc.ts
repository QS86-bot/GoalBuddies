import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { t } from '../../shared/i18n';
import { kapAf, telTekens } from '../../shared/tekst';
import { now } from '../../shared/time';

import type { Resultaat } from '../goals';

/**
 * Documenten in de groepschat — QS8-72, PRD 7.4.
 *
 * ⚠️⚠️ **Dit ziet eruit als een kopie van `chatfoto.ts` en het is er geen.** De
 *    vorm is bewust overgenomen — bucketconstante, padbouwer, keuring, upload —
 *    maar het **veiligheidsargument is een ander**, en dat is precies wat een
 *    lezer hier over het hoofd ziet.
 *
 *    §6 van `docs/decisions/2026-09-09-een-foto-in-de-chat.md` zegt waarom het
 *    bij een foto niet erg is dat de bucket alleen de *gedeclareerde* MIME-header
 *    toetst: *"het beland in een `<Image>` — willekeurige bytes renderen niet en
 *    voeren niets uit."* Een document beland niet in een `<Image>`. Het gaat naar
 *    de systeembrowser, en daar ís een `text/html` vanaf de storage-origin
 *    uitvoerbare code.
 *
 *    De veiligheid hangt hier dus aan de allowlist van migratie 0234, en aan
 *    niets anders. Vandaar één type, en vandaar een beloftetest eronder.
 *
 * ⚠️ **Vier bewuste afwijkingen van `chatfoto.ts`:**
 *    1. één MIME-type in plaats van drie;
 *    2. 5 MB in plaats van 1 MB (byte-pariteit per groep — zie 0234 §4);
 *    3. een kwartier geldig in plaats van een uur;
 *    4. **tekenen per stuk en niet per pagina** — zie `tekenChatdoc()`.
 */

/**
 * ⚠️ Een letterlijke constante en geen berekening. `scripts/storage-controle.mjs`
 *    vindt alleen letterlijke strings in `.storage.from(...)`, en een bucket die
 *    die controle niet ziet, is een bucket zonder controle. Om diezelfde reden
 *    delen `chatfoto.ts` en dit bestand geen bucketvariabele.
 */
export const CHATDOC_BUCKET = 'chatdocs';

/**
 * Hoe lang een ondertekende document-URL geldig is: een kwartier.
 *
 * ⚠️ **Korter dan de chatfoto (een uur), gelijk aan de bewijsfoto.** Een
 *    ondertekende URL is een bearer token: eenmaal getekend werkt hij voor
 *    iedereen die hem heeft, ongeacht RLS. Bij een document weegt dat zwaarder,
 *    om twee redenen die bij een foto geen van beide spelen:
 *
 *    - **inhoud** — een chatfoto is een moment; `jaarrekening-2026.pdf` kan een
 *      BSN, een adres of een salaris dragen;
 *    - **route** — de URL verlaat de app naar de systeembrowser en belandt daar
 *      in geschiedenis en downloads, plekken waar de app niets meer over te
 *      zeggen heeft.
 */
export const CHATDOC_GELDIGHEID_S = 900;

/**
 * Het enige toegestane type.
 *
 * ⚠️⚠️ **Een kopie van `allowed_mime_types` in migratie 0234 — en dáár is de
 *    grendel, niet hier.** De vraag bij elke uitbreiding is niet "is dit formaat
 *    gangbaar" maar **"routeert een browser dit ooit naar de HTML-parser, direct
 *    of via XSLT"**. Bij twijfel: nee. `text/html`, `application/xhtml+xml`,
 *    `image/svg+xml`, `application/xml`, `text/xml` en `text/xsl` zijn alle zes
 *    actief; `text/plain` is historisch sniffbaar; `application/octet-stream`
 *    ontkoppelt type van extensie en laat daarmee álles binnen.
 */
export const CHATDOC_TYPES = ['application/pdf'] as const;

/** De grens die 0234 op de bucket zet: 5 MB. */
export const CHATDOC_MAX_BYTES = 5_242_880;

/** De grens die de CHECK van 0236 op de naam zet, in **codepunten**. */
export const CHATDOC_NAAM_MAX = 120;

/**
 * Het pad waar dit document komt te staan: `<groep>/<afzender>/<naam>.pdf`.
 *
 * ⚠️⚠️ **De naam in het pad is niet de naam die de gebruiker ziet.** Het pad
 *    krijgt een gegenereerde naam — de oorspronkelijke gaat in
 *    `chat_messages.attachment_name`, want die mag emoji dragen en het pad niet
 *    (de CHECK van 0236 laat er alleen `[A-Za-z0-9._-]` in toe).
 *
 * ⚠️ De extensie is hard `.pdf` en komt niet uit de bestandsnaam van de
 *    gebruiker. Een `.PDF` of een `.tar.gz` haalt de CHECK dus nooit, en het pad
 *    is per constructie in kleine letters — waar 0225 voor de chatfoto nog een
 *    reparatie voor nodig had.
 */
export function chatdocPad(groupId: string, senderId: string): string {
  const uniek = `${now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${groupId}/${senderId}/${uniek}.pdf`;
}

/**
 * Maakt een bestandsnaam van het besturingssysteem geschikt voor `attachment_name`.
 *
 * ⚠️⚠️ **De bidi-tekens gaan eruit, en dat is de reden dat deze functie bestaat.**
 *    Met een RLO (U+202E) erin rendert `verslag<RLO>fdp.exe` in de bubbel als
 *    `verslagexe.pdf`, terwijl het pad `.pdf` zegt en de bytes iets anders zijn.
 *    Dat is een leugen die de app met het vertrouwen van de groep erachter
 *    vertelt. De CHECK van 0236 weigert zo'n naam; deze functie zorgt dat de
 *    gebruiker die weigering niet te zien krijgt.
 *
 * ⚠️ **`kapAf()` en niet `slice()`.** JavaScript telt in UTF-16-eenheden, een
 *    emoji kost er twee en een samengesteld gezin elf; snijden op zo'n grens
 *    rendert als een vervangingsteken. En de grens is in **codepunten**, want dat
 *    is wat `char_length` in Postgres telt.
 */
export function schoneBestandsnaam(ruw: string): string {
  const zonderRegie = ruw
    // ⚠️ Precies de tekens die de CHECK `chat_messages_attachment_name_vorm`
    //    (0236) weigert — één klasse, twee plekken, en die twee horen gelijk te
    //    blijven. `tests/beloftes/...` legt ze naast elkaar.
    .replace(/[\u0000-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\//g, '-')
    .trim();

  const naam = zonderRegie === '' ? 'document.pdf' : zonderRegie;
  return telTekens(naam) > CHATDOC_NAAM_MAX ? kapAf(naam, CHATDOC_NAAM_MAX) : naam;
}

/**
 * De soort die het scherm toont, afgeleid uit het **pad** en niet uit de naam.
 *
 * ⚠️ Het pad ligt vast in de CHECK van 0236; de naam is gebruikerstekst. Zou de
 *    UI de soort uit de naam halen, dan kan `factuur.pdf.exe` zich als PDF
 *    voordoen. Nu kan dat niet.
 */
export function soortUitPad(pad: string): 'pdf' | null {
  return /\.pdf$/.test(pad) ? 'pdf' : null;
}

/** Wat er mis is met dit bestand, of `null` als het door mag. */
export function keurChatdoc(bytes: number, mime: string, naam: string): string | null {
  if (!(CHATDOC_TYPES as readonly string[]).includes(mime)) return t('chatdoc.type_niet_toegestaan');
  if (bytes > CHATDOC_MAX_BYTES) return t('chatdoc.te_groot');
  if (schoneBestandsnaam(naam) === '') return t('chatdoc.naam_leeg');
  return null;
}

/**
 * Zet het document in de bucket en geeft het pad terug.
 *
 * ⚠️ **Alleen uploaden, niet koppelen.** Het pad gaat mee in de `insert` van het
 *    bericht, want `chat_messages` heeft sinds 0193 geen UPDATE-policy en geen
 *    UPDATE-grant: `attachment_url` is alleen bij INSERT te zetten. Die volgorde
 *    — eerst uploaden, dan invoegen — is dus de enige die werkt, en de
 *    compenserende opruiming hoort bij de aanroeper.
 *
 * ⚠️ `contentType` is hard `application/pdf` en komt **niet** van de kiezer. Wat
 *    de bucket bewaart is wat hij terugserveert, dus dit is de waarde die
 *    bepaalt of een browser het bestand ooit als HTML behandelt.
 */
export async function uploadChatdoc(
  groupId: string,
  senderId: string,
  bestand: { readonly data: ArrayBuffer | Uint8Array; readonly mime: string; readonly naam: string },
): Promise<Resultaat<string>> {
  const bezwaar = keurChatdoc(bestand.data.byteLength, bestand.mime, bestand.naam);
  if (bezwaar !== null) return { ok: false, melding: bezwaar };

  const pad = chatdocPad(groupId, senderId);

  const gezet = await supabase().storage.from(CHATDOC_BUCKET).upload(pad, bestand.data, {
    contentType: 'application/pdf',
    upsert: false,
  });

  if (gezet.error) {
    reportError(gezet.error, 'chatdoc.upload', { group_id: groupId });
    // ⚠️ Het dagplafond van 0235 komt hier ook binnen, en dat is te onderscheiden
    //    van een netwerkfout — anders leest "probeer het zo nog eens" als een
    //    storing terwijl er niets stuk is. De melding blijft verder algemeen: een
    //    storage-fout draagt soms het pad, en dat pad noemt twee uuid's.
    const rem = /Te veel document/.test(gezet.error.message ?? '');
    return { ok: false, melding: t(rem ? 'chatdoc.rem_bereikt' : 'chatdoc.uploaden_mislukt') };
  }

  return { ok: true, waarde: pad };
}

/** Haalt een document weg. Faalt stil: de aanroeper heeft de rij al opgeruimd. */
export async function verwijderChatdoc(pad: string): Promise<void> {
  const { error } = await supabase().storage.from(CHATDOC_BUCKET).remove([pad]);
  if (error) reportError(error, 'chatdoc.verwijderen');
}

/**
 * Ondertekent één pad, op het moment dat iemand erop tikt.
 *
 * ⚠️⚠️ **Enkelvoud, en er is met opzet géén `metGetekendeChatdocs()`.** Dit is de
 *    vierde afwijking van `chatfoto.ts` en de enige die tegen de gewoonte van dit
 *    project in gaat, dus hij staat hier uitgeschreven:
 *
 *    Een foto **móet** per pagina getekend worden, want dertig foto's renderen
 *    tegelijk — per rij tekenen zou de N+1 zijn die schaalbaarheidsregel 12
 *    verbiedt. Een document rendert niets tot iemand tikt. Per pagina tekenen zou
 *    dus dertig bearer tokens uitgeven voor bestanden die niemand opent, elk een
 *    kwartier geldig.
 *
 *    Eén verzoek per tik is dáármee *minder* verkeer dan het fotopad, niet meer:
 *    er is geen lus, dus er is geen N+1.
 *
 * ⚠️ **Gevolg dat je moet kennen:** bij een `doc`-bericht blijft `attachment_url`
 *    in de app een **kaal pad** — de tegenovergestelde belofte van die bij een
 *    `photo`-bericht, waar het ná `metGetekendeChatfotos()` een ondertekende URL
 *    is. `Document.tsx` mag dat pad daarom nooit rechtstreeks openen, en
 *    `tests/ui/document.test.tsx` bewaakt dat.
 */
export async function tekenChatdoc(pad: string): Promise<string | null> {
  const { data, error } = await supabase()
    .storage.from(CHATDOC_BUCKET)
    .createSignedUrl(pad, CHATDOC_GELDIGHEID_S);

  if (error) {
    reportError(error, 'chatdoc.tekenen');
    return null;
  }

  return data?.signedUrl ?? null;
}

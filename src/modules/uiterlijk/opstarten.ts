import AsyncStorage from '@react-native-async-storage/async-storage';

import { reportError } from '../../lib/observability';

import { bewaarAccountVoorkeur, haalAccountVoorkeur } from './api';
import {
  LEGACY_THEMASLEUTEL,
  LOKALE_SLEUTEL,
  parseLokaleKopie,
  serialiseerLokaleKopie,
  verzoenVoorkeur,
  type LokaleKopie,
  type Verzoening,
} from './verzoenen';
import { normaliseerVoorkeur, type Uiterlijkvoorkeur } from './voorkeur';

/**
 * De lokale kant: lezen bij het opstarten, schrijven bij een keuze — QS8-729,
 * criterium 7. De regels zelf staan in `verzoenen.ts`; dit bestand praat met
 * AsyncStorage en de datalaag.
 *
 * ⚠️ **Nog niet aangesloten op `ThemeProvider`.** Die map is van QS8-725 en dit
 *    issue raakt hem niet. Het aansluiten (en het scherm Uiterlijk, QS8-731)
 *    gebruikt `leesLokaleStart()` voor de eerste render zonder flits en
 *    `verzoenMetAccount()` zodra de sessie er is.
 */

async function leesRauw(sleutel: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(sleutel);
  } catch (fout) {
    reportError(fout, 'uiterlijk.opslag.lezen', { sleutel });
    return null;
  }
}

/** Wat de eerste render gebruikt: lokaal, anders de oude voorkeur, anders de standaard. Nooit het netwerk. */
export async function leesLokaleStart(): Promise<Verzoening> {
  const [kopie, legacy] = await Promise.all([
    leesRauw(LOKALE_SLEUTEL),
    leesRauw(LEGACY_THEMASLEUTEL),
  ]);
  return verzoenVoorkeur({
    account: undefined,
    lokaal: parseLokaleKopie(kopie),
    legacy,
  });
}

function vanDezeGebruiker(kopie: LokaleKopie | null, userId: string): LokaleKopie | null {
  return kopie && kopie.userId === userId ? kopie : null;
}

async function bewaarLokaal(kopie: LokaleKopie): Promise<void> {
  try {
    await AsyncStorage.setItem(LOKALE_SLEUTEL, serialiseerLokaleKopie(kopie));
  } catch (fout) {
    reportError(fout, 'uiterlijk.opslag.schrijven', {});
  }
}

// ⚠️ **Keuzes lopen één voor één.** Twee snelle klikken die tegelijk met dezelfde
//    basis naar de server gaan, laten de tweede op een conflict lopen terwijl de
//    eerste slaagt; de afronding van de eerste overschrijft dan lokaal de
//    wachtende tweede. Security-review QS8-729: de keuze ging stil verloren.
let keuzeRij: Promise<unknown> = Promise.resolve();

/**
 * Een keuze van de gebruiker: eerst lokaal (met `wacht`), dan de account. De UI wacht op geen van
 * beide.
 *
 * ⚠️ **De basis komt uit de lokale kopie en niet van de aanroeper.** Een aanroeper
 *    die hem zelf bijhoudt, stuurt na een geslaagde keuze nog de oude mee; de
 *    volgende keuze loopt dan vast op een conflict en verliest bij de volgende
 *    start van de app tegen de account.
 */
export function kiesVoorkeur(userId: string, keuze: Uiterlijkvoorkeur): Promise<Uiterlijkvoorkeur> {
  const taak = keuzeRij.then(() => voerKeuzeUit(userId, keuze));
  keuzeRij = taak.catch(() => undefined);
  return taak;
}

async function voerKeuzeUit(userId: string, keuze: Uiterlijkvoorkeur): Promise<Uiterlijkvoorkeur> {
  const voorkeur = normaliseerVoorkeur(keuze);
  const vorige = vanDezeGebruiker(parseLokaleKopie(await leesRauw(LOKALE_SLEUTEL)), userId);
  const basis = vorige?.basis ?? null;
  await bewaarLokaal({ userId, voorkeur, basis, wacht: true });
  const uitkomst = await bewaarAccountVoorkeur(userId, voorkeur, basis);
  // Bij een `conflict` blijft de keuze met `wacht` staan; de volgende
  // `verzoenMetAccount()` ziet dat de account verder is en laat hem winnen.
  if (uitkomst.ok) {
    await bewaarLokaal({ userId, voorkeur, basis: uitkomst.bijgewerktOp, wacht: false });
  }
  return voorkeur;
}

/** Zodra de sessie er is: de account lezen, verzoenen en zo nodig een wachtende keuze doorsturen. */
export async function verzoenMetAccount(userId: string): Promise<Verzoening> {
  const [kopie, legacy] = await Promise.all([
    leesRauw(LOKALE_SLEUTEL),
    leesRauw(LEGACY_THEMASLEUTEL),
  ]);
  const lokaal = vanDezeGebruiker(parseLokaleKopie(kopie), userId);

  let account;
  try {
    account = await haalAccountVoorkeur(userId);
  } catch {
    // Al gemeld door `haalAccountVoorkeur`; een mislukte lezing is geen keuze.
    return verzoenVoorkeur({ account: undefined, lokaal, legacy });
  }

  const uitslag = verzoenVoorkeur({ account, lokaal, legacy });
  if (!uitslag.schrijfNaarAccount) {
    await bewaarLokaal({
      userId,
      voorkeur: uitslag.voorkeur,
      basis: uitslag.basis,
      wacht: false,
    });
    return uitslag;
  }

  const gedaan = await bewaarAccountVoorkeur(userId, uitslag.voorkeur, uitslag.basis);
  await bewaarLokaal({
    userId,
    voorkeur: uitslag.voorkeur,
    basis: gedaan.ok ? gedaan.bijgewerktOp : uitslag.basis,
    wacht: !gedaan.ok,
  });
  return uitslag;
}

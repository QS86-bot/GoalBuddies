// Publieke rand van de module uiterlijk — de uiterlijkvoorkeur op het account.
// CLAUDE.md: module-communicatie loopt uitsluitend via dit bestand.

export {
  DICHTHEDEN,
  KLEURVARIANTEN,
  STANDAARD_VARIANT_VAN_C,
  STANDAARD_VOORKEUR,
  STIJLEN,
  WEERGAVEN,
  leesVoorkeur,
  normaliseerVoorkeur,
  voorkeurSchema,
  type Dichtheid,
  type Kleurvariant,
  type Stijl,
  type Uiterlijkvoorkeur,
  type Weergave,
} from './voorkeur';

export {
  LEGACY_THEMASLEUTEL,
  LOKALE_SLEUTEL,
  legacyWeergave,
  parseLokaleKopie,
  serialiseerLokaleKopie,
  verzoenVoorkeur,
  type AccountVoorkeur,
  type LokaleKopie,
  type Verzoening,
} from './verzoenen';

export { bewaarAccountVoorkeur, haalAccountVoorkeur, type BewaarUitkomst } from './api';

export { kiesVoorkeur, leesLokaleStart, verzoenMetAccount } from './opstarten';

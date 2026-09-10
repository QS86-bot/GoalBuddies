// Publieke rand van de module todos — De Lijst.
// CLAUDE.md: module-communicatie loopt uitsluitend via dit bestand.
//
// ⚠️ Deel 1 van QS8-378 legt alleen het datamodel en de invoerregels neer. Het
//    scherm is QS8-380 en het delen QS8-381; tot die tijd staat hier geen
//    datalaag, want een functie zonder pad naar een mens is dode code
//    (`npm run exports:controle`).

export {
  TAAK_MAX,
  TAAK_MIN,
  VOLGORDE_MAX,
  taakInvoerSchema,
  taakPatchSchema,
  type TaakInvoer,
  type TaakPatch,
} from './todo-schemas';

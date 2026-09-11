/**
 * Het tweede toegangspunt van deze module: alles wat React of een expo-pakket
 * meetrekt — QS8-423.
 *
 * ⚠️⚠️ **Waarom een tweede bestand en niet gewoon `index.ts`.** De RLS-suite
 *    importeert module-barrels in een kale Node-omgeving. `lib/supabase` trekt
 *    react-native mee en is daar te overleven omdat de tests hem mocken
 *    (`vi.mock` in `tests/rls/doorloop.test.ts`); een `expo-*`-import dekt geen
 *    enkele mock. 📏 Nagemeten op 11-09-2026 door `kiesFoto` tijdelijk in
 *    `modules/buddies/index.ts` te exporteren: `doorloop.test.ts` viel om met
 *    `ReferenceError: __DEV__ is not defined`. Dat is dezelfde meting die de
 *    koppen van deze hooks sinds QS8-71 dragen, en hij staat vandaag nog.
 *
 * ⚠️ **De grens is dus niet "React" maar "expo of react-native".** React zelf
 *    importeert prima in Node. Wat `index.ts` vrij van moet blijven is alles
 *    wat het platform aanraakt; dit bestand is waar dat wél mag.
 *
 * ⚠️ Aanroepers zijn schermen in `app/`. Die mogen uit beide lagen importeren,
 *    dus zij zijn de plek waar een platformvermogen en een domein samenkomen.
 */
export { useChatbijlage, type Chatbijlagekeuze } from './useChatbijlage';
export { useDocumentOpenen, type Documentopener } from './useDocumentOpenen';

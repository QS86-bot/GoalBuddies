// Bewust zonder imports: de database-test laadt dit bestand zonder React Native.
/**
 * De kolommen die elke RPC teruggeeft, en niet één meer.
 *
 * ⚠️ Gedeeld met de database-test: die vergelijkt deze lijst met wat de functies
 *    echt teruggeven. Een kolom erbij in SQL zonder dat hier te besluiten is een
 *    rode test, en andersom ook.
 */
export const PROFIEL_RPC_KOLOMMEN = {
  profiel: ['id', 'display_name', 'avatar_url', 'ben_ik'],
  doelen: ['goal_id', 'titel', 'categorie', 'voltooid', 'mijlpalen_totaal', 'mijlpalen_klaar'],
  groepen: ['group_id', 'naam', 'icoon'],
} as const;

import type { Dichtheid, Kleurvariant, Stijl, Weergave } from '@/modules/uiterlijk';
import { t } from '@/shared/i18n';
import type { Optie } from '@/shared/ui';

/**
 * De opties van het scherm Uiterlijk — QS8-731.
 *
 * ⚠️ **Functies en geen constanten**: een module-constante met `t()` erin bevriest de taal op importtijd (zie
 *    QS8-115). De waarden komen uit de lijsten van `modules/uiterlijk`; de labels zijn catalogussleutels, dus
 *    een waarde erbij zonder tekst is een typefout.
 */

export function stijlOpties(): readonly Optie<Stijl>[] {
  return [
    { waarde: 'a', label: t('uiterlijk.stijl_a') },
    { waarde: 'b', label: t('uiterlijk.stijl_b') },
    { waarde: 'c', label: t('uiterlijk.stijl_c') },
  ];
}

export function variantOpties(): readonly Optie<Exclude<Kleurvariant, 'geen'>>[] {
  return [
    { waarde: 'baai', label: t('uiterlijk.variant_baai') },
    { waarde: 'avondgloed', label: t('uiterlijk.variant_avondgloed') },
    { waarde: 'bosrand', label: t('uiterlijk.variant_bosrand') },
    { waarde: 'pruim', label: t('uiterlijk.variant_pruim') },
    { waarde: 'koraal', label: t('uiterlijk.variant_koraal') },
  ];
}

export function weergaveOpties(): readonly Optie<Weergave>[] {
  return [
    { waarde: 'donker', label: t('uiterlijk.weergave_donker') },
    { waarde: 'licht', label: t('uiterlijk.weergave_licht') },
    { waarde: 'systeem', label: t('uiterlijk.weergave_systeem') },
  ];
}

export function dichtheidOpties(): readonly Optie<Dichtheid>[] {
  return [
    { waarde: 'ruim', label: t('uiterlijk.dichtheid_ruim') },
    { waarde: 'compact', label: t('uiterlijk.dichtheid_compact') },
  ];
}

export function emojiOpties(): readonly Optie<'aan' | 'uit'>[] {
  return [
    { waarde: 'aan', label: t('uiterlijk.emoji_aan') },
    { waarde: 'uit', label: t('uiterlijk.emoji_uit') },
  ];
}

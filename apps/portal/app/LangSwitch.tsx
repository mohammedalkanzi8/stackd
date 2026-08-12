/**
 * The language switch.
 *
 * A plain form posting a server action, so it works with no client JavaScript —
 * the same reasoning as the staff portal's switch. This is a phone on shop wifi
 * with a cashier waiting; the bundle failing to load must not take the language
 * with it.
 *
 * The label is always the OTHER language, written in that language, which is
 * the convention every bilingual site in the Kingdom uses and the reason it is
 * never translated.
 */

import { revalidatePath } from 'next/cache';

import { setLang, type Lang } from '@/lib/prefs.ts';

async function switchLang(formData: FormData): Promise<void> {
  'use server';
  await setLang(formData.get('lang') === 'en' ? 'en' : 'ar');
  // The whole tree: the language changes every string on every page, including
  // the chrome that renders this control.
  revalidatePath('/', 'layout');
}

export function LangSwitch({ lang }: { lang: Lang }) {
  const next: Lang = lang === 'ar' ? 'en' : 'ar';
  return (
    <form action={switchLang} className="langsw">
      <input type="hidden" name="lang" value={next} />
      <button type="submit" lang={next} title={next === 'ar' ? 'العربية' : 'English'}>
        {next === 'ar' ? 'العربية' : 'English'}
      </button>
    </form>
  );
}

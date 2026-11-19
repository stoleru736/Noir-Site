// EN/RO switch. Text is bilingual in the HTML ([data-l]); this only flips <html lang>, remembers the choice and
// updates the few attributes / <option> labels that cannot hold two spans.
export type Lang = 'en' | 'ro';
const KEY = 'noir-lang';

export const getLang = (): Lang => (document.documentElement.lang === 'ro' ? 'ro' : 'en');

export function applyLang(): void {
  const ro = getLang() === 'ro';
  document.querySelectorAll<HTMLElement>('[data-t-en]').forEach((el) => {
    el.textContent = (ro ? el.dataset['tRo'] : el.dataset['tEn']) ?? '';
  });
  document.querySelectorAll<HTMLElement>('[data-a]').forEach((el) => {
    const v = (ro ? el.dataset['aRo'] : el.dataset['aEn']) ?? '';
    (el.dataset['a'] ?? '').split(',').forEach((attr) => el.setAttribute(attr.trim(), v));
  });
}

export function setLang(l: Lang): void {
  document.documentElement.lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* storage may be blocked */ }
  applyLang();
  document.dispatchEvent(new CustomEvent('noir:lang'));
}

export function initLang(): void {
  applyLang();
  document.querySelectorAll<HTMLElement>('[data-lang-toggle]').forEach((b) =>
    b.addEventListener('click', () => setLang(getLang() === 'ro' ? 'en' : 'ro')),
  );
}

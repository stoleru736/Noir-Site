// Client-side bag and wishlist, persisted in localStorage. No payments: the bag ends in one WhatsApp message.
const CART_KEY = 'od-cart';
const FAV_KEY = 'od-fav';

export interface CartItem {
  slug: string;
  size: number;
  qty: number;
}

const isItem = (v: unknown): v is CartItem => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o['slug'] === 'string' && typeof o['size'] === 'number' && typeof o['qty'] === 'number' && o['qty'] > 0;
};

function read(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: state stays in memory for this page only */
  }
  document.dispatchEvent(new CustomEvent('od:change'));
}

export const getCart = (): CartItem[] => read(CART_KEY).filter(isItem);

export function addItem(slug: string, size: number): void {
  const cart = getCart();
  const found = cart.find((i) => i.slug === slug && i.size === size);
  if (found) found.qty = Math.min(found.qty + 1, 10);
  else cart.push({ slug, size, qty: 1 });
  write(CART_KEY, cart);
}

export function changeQty(slug: string, size: number, delta: number): void {
  const cart = getCart()
    .map((i) => (i.slug === slug && i.size === size ? { ...i, qty: Math.min(i.qty + delta, 10) } : i))
    .filter((i) => i.qty > 0);
  write(CART_KEY, cart);
}

export const clearCart = (): void => write(CART_KEY, []);
export const cartCount = (): number => getCart().reduce((n, i) => n + i.qty, 0);

export const getFavs = (): string[] => read(FAV_KEY).filter((v): v is string => typeof v === 'string');

export function toggleFav(slug: string): boolean {
  const favs = getFavs();
  const has = favs.includes(slug);
  write(FAV_KEY, has ? favs.filter((s) => s !== slug) : [...favs, slug]);
  return !has;
}

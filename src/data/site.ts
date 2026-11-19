import products from './products.json';

export const BRAND = 'NOIR';
export const TAGLINE = 'WHERE MOVEMENT MEETS IDENTITY.';
export const WHATSAPP = '40750437127';
export const WHATSAPP_DISPLAY = '+40 750 437 127';

export type Gender = 'barbati' | 'dama' | 'unisex';
export type Stock = 'stock' | 'preorder';

export interface Product {
  slug: string;
  name: string;
  gender: Gender;
  category: string;
  color: string;
  colorLabel: string;
  hex: string;
  price: number;
  stock: Stock;
  description: string;
  sizes: number[];
}

export const catalog: Product[] = products as Product[];

export const genderLabels: Record<Gender, string> = {
  barbati: 'Bărbați',
  dama: 'Damă',
  unisex: 'Unisex',
};
export const stockLabels: Record<Stock, string> = {
  stock: 'Pe stoc 24h',
  preorder: 'Pre-order',
};
export const categoryLabels: Record<string, string> = {
  low: 'Low-top',
  high: 'High-top',
  chunky: 'Chunky',
};

export function whatsappLink(text: string): string {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;
}

// English labels (Romanian ones above are the originals).
export const genderLabelsEn: Record<Gender, string> = { barbati: 'Men', dama: 'Women', unisex: 'Unisex' };
export const stockLabelsEn: Record<Stock, string> = { stock: 'In stock 24h', preorder: 'Pre-order' };
export const colorLabelsEn: Record<string, string> = { negru: 'Black', gri: 'Grey', alb: 'White', maro: 'Brown', roz: 'Pink' };
export const colorEn = (p: Product): string => colorLabelsEn[p.color] ?? p.colorLabel;
export const descriptionEn = (p: Product): string =>
  `${p.category.charAt(0).toUpperCase() + p.category.slice(1)} sneakers from the ${BRAND} collection, in ${colorEn(p).toLowerCase()}. Clean silhouette, sober finishes, everyday wear.`;

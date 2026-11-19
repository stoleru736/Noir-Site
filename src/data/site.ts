import products from './products.json';

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

export function whatsappLink(text: string): string {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;
}

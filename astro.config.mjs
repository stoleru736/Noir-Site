import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const site = 'https://noir-site-3iw.pages.dev';

export default defineConfig({
  site,
  output: 'static',
  integrations: [sitemap()],
});

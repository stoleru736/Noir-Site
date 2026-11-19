import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO(deploy): replace with the real production domain.
const site = 'https://noir-site.pages.dev';

export default defineConfig({
  site,
  output: 'static',
  integrations: [sitemap()],
});

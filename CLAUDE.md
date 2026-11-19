# Site Noir

Production photography website for Marian. Standing rules live in the project instructions; this file holds only repo-specific facts.

## Stack
- Astro 7 (static output, TypeScript strictest), npm, Node >=22.23.4. Hosting: Cloudflare Pages. Original photos: Cloudflare R2 (outside Git); derivatives via Astro image tooling + `sharp`.
- Sitemap via `@astrojs/sitemap`; set the real domain in `astro.config.mjs` and `public/robots.txt` before launch.

## Commands
- `npm run dev` / `build` / `preview`
- `npm run check` (astro check, typecheck) / `npm run lint` (eslint)
- No test runner yet.

## Working rules
- Reply to Marian in Romanian, concise, no filler. Code, identifiers, comments and docs in English.
- Check `git status` first. Never delete or overwrite assets, data or config without approval.
- No push, deploy, publish or dependency install without explicit approval. Work on the assigned branch only.
- Never commit secrets; credentials via environment variables only.
- Photos: keep originals separate from generated derivatives; never serve originals in grids; preserve filenames/metadata.
- Never report a check as passed unless it was actually run.

## Final report format
STATUS (SUCCESS/PARTIAL/FAILED), CHANGES, FILES, VERIFICATION, BLOCKERS. Short.

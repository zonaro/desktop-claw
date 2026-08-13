# Desktop Claw website

Marketing website for [**Desktop Claw**](https://github.com/zonaro/desktop-claw), built with [Astro](https://astro.build) and Tailwind CSS.

> Looking for the project documentation (setup guides, known issues, CLI, contributing)?
> It lives in [`documentation/`](documentation/README.md).

## Commands

All commands are run from this directory (`docs/`):

| Command           | Action                                     |
| :---------------- | :----------------------------------------- |
| `npm install`     | Install dependencies                       |
| `npm run dev`     | Start local dev server at `localhost:4321` |
| `npm run build`   | Build the production site to `./dist/`     |
| `npm run preview` | Preview the build locally                  |

## Deployment

The build target is configured in [`astro.config.mjs`](astro.config.mjs) and defaults to a GitHub Pages
project site at `https://zonaro.github.io/desktop-claw`. Override it with environment variables when
publishing elsewhere:

```bash
SITE_URL=https://desktop-claw.example BASE_PATH=/ npm run build
```

Every internal link and public asset goes through the `withBase()` helper in
[`src/consts.ts`](src/consts.ts), so both the subpath and domain-root layouts work without further changes.

## Editing content

Content lives in the components rather than in a CMS:

| What                               | Where                              |
| :--------------------------------- | :--------------------------------- |
| Fork-only features ("New in Claw") | `src/components/WhatsNew.astro`    |
| Screenshot highlights              | `src/components/Highlights.astro`  |
| Full feature list                  | `src/components/FeatureList.astro` |
| Download info per platform         | `src/components/Install.astro`     |
| Brand colors (the red accent)      | `src/styles/global.css`            |
| Repository / release links         | `src/consts.ts`                    |

## Credits

This site is derived from the [Desktop Plus website](https://github.com/desktop-plus/website),
© Pol Rivero, used under the MIT License — see [LICENSE](LICENSE). It has been rebranded for
Desktop Claw, restyled around the app's red accent color, and extended with this fork's features.

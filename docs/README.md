# Desktop Claw website

Marketing website for [**Desktop Claw**](https://github.com/zonaro/desktop-claw).

> Looking for the project documentation (setup guides, known issues, CLI, contributing)?
> It lives in [`documentation/`](documentation/README.md).

Plain HTML, CSS and one small JavaScript file — **no build step and no dependencies**. GitHub Pages
serves this folder directly from `main`, so whatever is committed here is what goes live at
<https://zonaro.github.io/desktop-claw/>.

To work on it, open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server --directory docs 4321
```

## Files

| File               | What it is                                                              |
| :----------------- | :---------------------------------------------------------------------- |
| `index.html`       | The whole landing page: hero, what's new, highlights, features, download |
| `ai-policy.html`   | AI contribution policy                                                   |
| `oauth.html`       | Hands the OAuth callback back to the app via its custom URL scheme       |
| `styles.css`       | All styling. The red accent lives in the `--brand-*` variables at the top |
| `main.js`          | Platform tabs, screenshot viewer, footer year                            |
| `icon.png`         | The app icon, also used as the favicon source                            |
| `og.png`           | Social preview card                                                      |
| `screenshots/`     | Feature screenshots and the hero demo video                              |
| `.nojekyll`        | Stops GitHub Pages from running the files through Jekyll                 |

Icons are inlined as an SVG sprite at the top of each page and referenced with
`<use href="#i-...">`, so there are no icon requests and no icon library to install.

## Editing content

Everything is in the markup — find the section and edit it:

| What                               | Where                                                    |
| :--------------------------------- | :------------------------------------------------------- |
| Fork-only features ("New in Claw") | `index.html`, `<section id="whats-new">`                  |
| Screenshot highlights              | `index.html`, `<section id="features">`                   |
| Full feature list                  | `index.html`, `<section id="feature-list">`               |
| Download info per platform         | `index.html`, `<section id="install">`                    |
| Brand colors (the red accent)      | `styles.css`, `:root { --brand-* }`                       |

Links point at `github.com/zonaro/desktop-claw`; all internal paths are relative, so the site works
from a subpath (`/desktop-claw/`) or a domain root without changes.

## Credits

Adapted from the [Desktop Plus website](https://github.com/desktop-plus/website), © Pol Rivero, used
under the MIT License — see [LICENSE](LICENSE). Rebranded for Desktop Claw, restyled around the app's
red accent, extended with this fork's features, and rebuilt as static HTML/CSS.

Icons are [Octicons](https://primer.style/octicons/) (MIT) and
[Simple Icons](https://simpleicons.org/) (CC0).

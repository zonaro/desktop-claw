export const REPO_URL = "https://github.com/zonaro/desktop-claw";
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
export const ISSUES_URL = `${REPO_URL}/issues/new/choose`;
export const README_URL = `${REPO_URL}#readme`;
export const UPSTREAM_URL = "https://desktop.github.com";
/** Desktop Plus, the project this fork is based on. */
export const DESKTOP_PLUS_URL = "https://github.com/desktop-plus/desktop-plus";

/**
 * Prefixes a public asset or internal route with Astro's configured base path,
 * so the site works both at a domain root and under a GitHub Pages
 * project subpath (e.g. `/desktop-claw/`).
 */
export function withBase(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

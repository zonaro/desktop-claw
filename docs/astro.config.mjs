// @ts-check
import icon from "astro-icon";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Deployment target. Defaults to a GitHub Pages project site for this repo;
// override with SITE_URL / BASE_PATH when publishing somewhere else
// (e.g. SITE_URL=https://desktop-claw.org BASE_PATH=/ for a custom domain).
const site = process.env.SITE_URL ?? "https://zonaro.github.io";
const base = process.env.BASE_PATH ?? "/desktop-claw";

// https://astro.build/config
export default defineConfig({
  site,
  base,
  integrations: [icon()],
  vite: {
    plugins: [tailwindcss()],
  },
});

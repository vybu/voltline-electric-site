// @ts-check
import { defineConfig } from 'astro/config';
import wix from "@wix/astro";
import wixPages from "@wix/astro-pages";

import react from "@astrojs/react";
import cloudProviderFetchAdapter from "@wix/cloud-provider-fetch-adapter";
const isBuild = process.env.NODE_ENV == "production";

// https://astro.build/config
export default defineConfig({
  integrations: [wix(), wixPages(), react()],
  security: { checkOrigin: false },
  ...(isBuild && { adapter: cloudProviderFetchAdapter({}) }),

  // Prefetch page HTML ahead of the click so SSR latency (~2s TTFB on the
  // Bookings service pages) is hidden. Links opt in via data-astro-prefetch;
  // the service cards use the "viewport" strategy so the booking page is
  // fetched as soon as the card scrolls into view.
  prefetch: { defaultStrategy: "hover" },

  image: {
    domains: ["static.wixstatic.com"],
  },

  output: "server",
});
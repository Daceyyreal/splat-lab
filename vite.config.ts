import { defineConfig } from "vite";

// base: './' keeps asset paths relative so it works on GitHub Pages project sites.
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
});

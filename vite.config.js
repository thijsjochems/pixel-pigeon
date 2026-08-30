import { defineConfig } from 'vite';

export default defineConfig({
  // Relatieve paden in de build. Het spel draait niet op de wortel van een domein
  // maar in een submap (/schoolgames/pixel-pigeon/), en met de standaardinstelling
  // zou de bundel naar /assets/... wijzen en dus nergens laden.
  base: './',
  build: {
    // three is groot; onder deze grens klaagt de bundler er niet meer over.
    chunkSizeWarningLimit: 900,
  },
});

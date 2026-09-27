import { defineConfig } from 'vitest/config'

// patient-kit renders ui-kit components in tests. Without deduping, the package's own
// React and ui-kit's React resolve to different module instances, so React's synthetic
// event delegation doesn't fire across the boundary (render works, onChange doesn't).
// Deduping forces a single React so interaction tests behave like the app runtime.
export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    // Per-file environment via `@vitest-environment` docblock; node by default.
    environment: 'node',
    // Inline ui-kit so it's transformed in the same module graph / React instance as the
    // test — otherwise its components' React events won't fire across the package boundary.
    server: {
      deps: {
        inline: [/@ultranos\/ui-kit/],
      },
    },
  },
})

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  /**
   * When this bundle was built.
   *
   * The site's sitemap, feed and per-post HTML are all written at build time, so
   * "how long ago was the last build" is the difference between what a reader
   * sees and what a crawler sees. Admin compares this against each post's
   * updated_at to say plainly how much is waiting — see RebuildSection. Without
   * it, staleness is invisible, which is what makes it dangerous.
   */
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})

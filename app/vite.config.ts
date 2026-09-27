import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

/**
 * Dev only: Nitro's dev middleware treats <audio>/<img> requests (Sec-Fetch-Dest: audio/image)
 * as static assets and never reaches our /api routes, so they 404. Production is unaffected.
 */
const apiFetchDestFix: Plugin = {
  name: 'api-fetch-dest-fix',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url?.startsWith('/api/')) delete req.headers['sec-fetch-dest']
      next()
    })
  },
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [apiFetchDestFix, nitro({ preset: 'bun' }), tailwindcss(), tanstackStart(), viteReact()],
})

import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// The FSIS recall API does not send CORS headers and rejects requests that
// don't look like a browser. We proxy it through the Vite dev server so the
// front-end can just call `/api/recall`. For a production deploy you'd put an
// equivalent proxy (serverless function, nginx, etc.) in front of the API.
const FSIS_ORIGIN = 'https://www.fsis.usda.gov'
const FSIS_PATH = '/fsis/api/recall/v/1'

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    proxy: {
      '/api/recall': {
        target: FSIS_ORIGIN,
        changeOrigin: true,
        secure: true,
        rewrite: () => FSIS_PATH,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader(
              'User-Agent',
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
                'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            )
            proxyReq.setHeader('Accept', 'application/json')
          })
        },
      },
    },
  },
})

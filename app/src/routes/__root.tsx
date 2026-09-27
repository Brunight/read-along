import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#09090b' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black' },
      { title: 'Read Along' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      // Installable as a PWA (needs HTTPS, or Chrome's insecure-origin flag on a LAN address).
      { rel: 'manifest', href: '/manifest.webmanifest' },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: () => (
    <div className="grid min-h-dvh place-items-center text-zinc-400">
      <div className="text-center">
        <p className="text-lg">Not found</p>
        <a href="/" className="mt-2 inline-block text-amber-400 hover:underline">
          Back to library
        </a>
      </div>
    </div>
  ),
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

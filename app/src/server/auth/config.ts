/** Login is on only when a Google OAuth client is configured; otherwise everything belongs to "You". */
export const authEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

/** Where the app is reachable, e.g. https://read.example.com (Google redirects back here). */
export const publicUrl = (process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/** Throws if login is on but can't work; called at startup so a bad config fails loudly. */
export function checkAuthConfig() {
  if (!authEnabled) return
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error(
      'BETTER_AUTH_SECRET must be set when Google login is enabled. Generate one with: openssl rand -base64 32',
    )
  }
  if (!process.env.BETTER_AUTH_URL) {
    console.warn(`BETTER_AUTH_URL is not set; assuming ${publicUrl}. Google sign-in redirects there.`)
  }
}

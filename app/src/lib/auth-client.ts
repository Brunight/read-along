import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient()

export function signInWithGoogle(callbackURL = '/') {
  return authClient.signIn.social({ provider: 'google', callbackURL, errorCallbackURL: '/login' })
}

export async function signOut() {
  await authClient.signOut()
  window.location.href = '/login'
}

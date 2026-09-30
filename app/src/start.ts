import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

/** Declaring requestMiddleware replaces Start's default CSRF check on server functions, so keep it. */
const csrf = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })

/** Signed-out or unapproved visitors are sent to /login or /pending (401 for API calls). */
const authGate = createMiddleware({ type: 'request' }).server(async ({ request, next }) => {
  const { gate } = await import('./server/auth/gate')
  return (await gate(request)) ?? next()
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrf, authGate],
}))

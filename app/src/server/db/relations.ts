import { defineRelations } from 'drizzle-orm'

import { authRelations } from './auth-schema'
import * as schema from './schema'

// better-auth's adapter queries its tables through these; the auth part must come last.
export const relations = {
  ...defineRelations(schema),
  ...authRelations,
}

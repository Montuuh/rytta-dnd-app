import { z } from 'zod'

// RYT-116: Zod compiles its object validators with `new Function` when the page allows it, and
// probes that once per schema. Under the production Content-Security-Policy (no 'unsafe-eval')
// the probe is a reported violation on every page load, although Zod falls back by itself.
// Turning the compiler off up front keeps the policy strict and the console clean. Import this
// module before any schema is created: the choice is read when each schema is built.
z.config({ jitless: true })

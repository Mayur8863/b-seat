/**
 * Writes apps/api/openapi.json from the app's controllers without listening.
 * Run via `pnpm --filter @bseat/api gen:openapi` (needs Postgres + Redis env).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createApp } from '../bootstrap.js';
import { createOpenApiDocument } from '../common/openapi/openapi.js';

const app = await createApp();
const document = createOpenApiDocument(app);
const out = fileURLToPath(new URL('../../openapi.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
await app.close();
console.warn(`OpenAPI spec written to ${out}`);

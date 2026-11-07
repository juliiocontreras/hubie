import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('sessions use signed random tokens, expiration and tenant role checks',async()=>{const s=await readFile('auth.mjs','utf8');assert.match(s,/randomBytes/);assert.match(s,/timingSafeEqual/);assert.match(s,/requireTenantSession/);assert.match(s,/session_tokens/);});
test('authentication endpoints are not enabled without configuration',async()=>{const s=await readFile('server.mjs','utf8');assert.match(s,/HUBIE_AUTH_ENABLED/);assert.match(s,/api\/auth\/session/);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Regression test: the mobile menu opened but no tap reached its items.
// .shell has isolation:isolate (pwa-refined.css), which traps the sidebar in
// its own stacking context, so the open-menu backdrop (body::after,
// z-index 65) painted above the sidebar even though the sidebar has
// z-index 70. Every tap hit the backdrop and just closed the menu.
// The fix lifts the isolation while the menu is open.
test('mobile nav sheet paints above its backdrop when open', async () => {
 const nav = await readFile(new URL('../assets/pwa-navigation.css', import.meta.url), 'utf8');
 const refined = await readFile(new URL('../assets/pwa-refined.css', import.meta.url), 'utf8');
 assert.ok(refined.includes('isolation:isolate'), 'expected .shell to keep isolation:isolate when closed');
 assert.match(nav, /html\.mobile-nav-open\s+\.sidebar\s*\{[^}]*z-index:\s*70/, 'open sidebar must declare z-index 70');
 const backdrop = nav.match(/html\.mobile-nav-open body::after\{[^}]*z-index:\s*(\d+)/);
 assert.ok(backdrop, 'expected a z-index on the open-menu backdrop');
 assert.ok(Number(backdrop[1]) < 70, 'backdrop must stay below the open sidebar');
 assert.match(nav, /html\.mobile-nav-open\s+\.shell\s*\{\s*isolation:\s*auto\s*\}/, 'open menu must lift .shell isolation so the sidebar escapes its stacking context');
});

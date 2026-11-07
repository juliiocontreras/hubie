import test from 'node:test';
import assert from 'node:assert/strict';
import {appearanceDefaults,normalizeAppearance,mergeAppearance} from '../platform/appearance.mjs';

test('Hubie branding uses independent safe dashboard and sidebar configuration',()=>{
 assert.deepEqual(appearanceDefaults,{dashboardPreset:'hubie',sidebarPreset:'midnight',dashboardColor:'#f6f7fb',sidebarColor:'#16123a'});
 const appearance=normalizeAppearance({dashboardPreset:'pearl',sidebarPreset:'platinum',dashboardColor:'#fff4ed',sidebarColor:'#ccd6e8'});
 assert.equal(appearance.dashboardPreset,'pearl');
 assert.equal(appearance.sidebarPreset,'platinum');
 assert.equal(appearance.dashboardColor,'#fff4ed');
 assert.equal(appearance.sidebarColor,'#ccd6e8');
});
test('rejects arbitrary CSS injection, invalid gradients, and unexpected keys',()=>{
 assert.throws(()=>normalizeAppearance({dashboardPreset:'url(javascript:alert(1))'}),/Invalid appearance/);
 assert.throws(()=>normalizeAppearance({sidebarColor:'url(https://example.com)' }),/Invalid appearance/);
 assert.throws(()=>normalizeAppearance({dashboardPreset:'custom',dashboardColor:'rgba(0,0,0,.5)'}),/Invalid appearance/);
 assert.throws(()=>normalizeAppearance({sidebarPreset:'unknown'}),/Invalid appearance/);
 assert.throws(()=>normalizeAppearance({backgroundImage:'https://example.com/plant.png'}),/Invalid appearance/);
});
test('partial changes preserve unmodified background and reset can restore brand',()=>{
 const original=normalizeAppearance({dashboardPreset:'pearl',sidebarPreset:'steel',dashboardColor:'#abcdef',sidebarColor:'#123456'});
 const after=mergeAppearance(original,{sidebarPreset:'custom',sidebarColor:'#334455'});
 assert.equal(after.dashboardPreset,'pearl');
 assert.equal(after.dashboardColor,'#abcdef');
 assert.equal(after.sidebarColor,'#334455');
 assert.deepEqual(normalizeAppearance({}),appearanceDefaults);
});

import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
test('Suite cards preserve scroll depth with motion accessibility',async()=>{
 const motion=await readFile('assets/ambient-motion.js','utf8');
 const css=await readFile('assets/navigation.css','utf8');
 assert.match(motion,/hubie-suite-card/);
 assert.match(motion,/IntersectionObserver/);
 assert.match(motion,/prefers-reduced-motion/);
 assert.match(css,/--hubie-scroll-y/);
 assert.match(css,/hubie-parallax-depth/);
});
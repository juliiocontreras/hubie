import test from 'node:test';
import assert from 'node:assert/strict';
import {publicOrigin,isSameOrigin} from '../platform/public-origin.mjs';

test('Render PWA OAuth callback uses explicit validated public origin',()=>{
 assert.equal(publicOrigin('https://hubie-dev.onrender.com/'),'https://hubie-dev.onrender.com');
 assert.equal(publicOrigin('https://hubie-dev.onrender.com'),'https://hubie-dev.onrender.com');
 assert.throws(()=>publicOrigin(undefined),/Invalid public origin/);
 assert.throws(()=>publicOrigin('https://hubie-dev.onrender.com/admin'),/Invalid public origin/);
 assert.throws(()=>publicOrigin('http://hubie-dev.onrender.com'),/Invalid public origin/);
 assert.throws(()=>publicOrigin('https://evil.test@hubie-dev.onrender.com'),/Invalid public origin/);
});
test('cookie-authenticated write requests require exact configured origin',()=>{
 const base='https://hubie-dev.onrender.com';
 assert.equal(isSameOrigin(base,base),true);
 assert.equal(isSameOrigin('https://other.onrender.com',base),false);
 assert.equal(isSameOrigin('http://hubie-dev.onrender.com',base),false);
 assert.equal(isSameOrigin('https://hubie-dev.onrender.com.evil.test',base),false);
 assert.equal(isSameOrigin(null,base),false);
 assert.equal(isSameOrigin(base,undefined),false);
});

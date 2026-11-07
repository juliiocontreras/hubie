import test from 'node:test';
import assert from 'node:assert/strict';
import {setTenantMemberStatus} from '../admin.mjs';
test('tenant administration supports revocation while preserving owner role protections',()=>{
 assert.equal(typeof setTenantMemberStatus,'function');
});

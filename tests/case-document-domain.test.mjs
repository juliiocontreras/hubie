import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeCaseDocumentMetadata,documentTypes,documentExpiryStatus} from '../platform/case-document-domain.mjs';
test('document metadata validates types, real ISO calendar dates and optional revisions',()=>{
 const meta=normalizeCaseDocumentMetadata({documentType:'contract',expiresOn:'2027-02-28'});
 assert.deepEqual(meta,{documentType:'contract',expiresOn:'2027-02-28',replaceDocumentId:null});
 assert.ok(documentTypes.some(t=>t[0]==='contract'));
 assert.deepEqual(normalizeCaseDocumentMetadata({}),{documentType:'other',expiresOn:null,replaceDocumentId:null});
 const uuid='0e1f2a3b-4c5d-4e6f-8a9b-123456789abc';
 assert.equal(normalizeCaseDocumentMetadata({replaceDocumentId:uuid}).replaceDocumentId,uuid);
 for(const bad of [{documentType:'clinical'},{expiresOn:'2027-02-30'},{expiresOn:'2030-1-01'},{replaceDocumentId:'../other-tenant'},{documentType:'other',organizationId:'evil'}])
 assert.throws(()=>normalizeCaseDocumentMetadata(bad),/Invalid document/);
});
test('expiry status groups expired, soon and current by today, null if no expiration',()=>{
 assert.equal(documentExpiryStatus('2026-11-04','2026-11-05'),'expired');
 assert.equal(documentExpiryStatus('2026-11-15','2026-11-05'),'soon');
 assert.equal(documentExpiryStatus('2027-01-05','2026-11-05'),'valid');
 assert.equal(documentExpiryStatus(null,'2026-11-05'),'none');
});
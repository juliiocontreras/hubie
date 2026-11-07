import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMediaUpload,MAX_BACKGROUND_BYTES,MAX_ATTACHMENT_BYTES} from '../platform/media-policy.mjs';
const png=Buffer.from('89504e470d0a1a0a0000000d49484452','hex').toString('base64');
const pdf=Buffer.from('%PDF-1.7\nexample document').toString('base64');
test('accepts png photo for background and enforces strict media bytes',()=>{
 const media=validateMediaUpload({filename:'fondo.png',mime:'image/png',data:png},'background');
 assert.equal(media.mime,'image/png');
 assert.equal(media.data,png);
 assert.equal(media.bytes,16);
 assert.ok(MAX_BACKGROUND_BYTES<=1024*1024);
});
test('rejects active files, spoofed images and oversized attachments',()=>{
 assert.throws(()=>validateMediaUpload({filename:'fondo.svg',mime:'image/svg+xml',data:png},'background'),/Invalid media/);
 assert.throws(()=>validateMediaUpload({filename:'malware.png',mime:'image/png',data:Buffer.from('<script>alert(1)</script>').toString('base64')},'background'),/Invalid media/);
 assert.throws(()=>validateMediaUpload({filename:'hack.html',mime:'text/html',data:pdf},'attachment'),/Invalid media/);
 assert.ok(MAX_ATTACHMENT_BYTES<=10*1024*1024);
 assert.throws(()=>validateMediaUpload({filename:'grande.pdf',mime:'application/pdf',data:Buffer.concat([Buffer.from('%PDF-'),Buffer.alloc(10_000_000)]).toString('base64')},'attachment'),/Invalid media/);
});
test('accepts a pdf for document attachment and normalizes its filename',()=>{
 const out=validateMediaUpload({filename:'docs/../Solicitud.pdf',mime:'application/pdf',data:pdf},'attachment');
 assert.equal(out.filename,'Solicitud.pdf');
 assert.equal(out.mime,'application/pdf');
 assert.throws(()=>validateMediaUpload({filename:'archivo.pdf',mime:'application/pdf',data:png},'attachment'),/Invalid media/);
});

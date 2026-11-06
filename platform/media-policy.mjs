// A small, constrained Turso-backed upload bridge for staging.
// Never accept scriptable SVG/HTML, arbitrary URLs, or unbounded base64.
export const MAX_BACKGROUND_BYTES=900_000;
export const MAX_ATTACHMENT_BYTES=2_000_000;
const imageTypes=['image/png','image/jpeg','image/webp'];
const attachments=[...imageTypes,'application/pdf','text/plain','text/csv',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
export function validateMediaUpload(input,kind){
 if(!input||typeof input!=='object'||Array.isArray(input)||!['background','attachment'].includes(kind))throw Error('Invalid media');
 const max=kind==='background'?MAX_BACKGROUND_BYTES:MAX_ATTACHMENT_BYTES;
 const mime=typeof input.mime==='string'?input.mime.trim().toLowerCase():'';
 if(!(kind==='background'?imageTypes:attachments).includes(mime))throw Error('Invalid media');
 if(typeof input.data!=='string'||input.data.length>Math.ceil(max/3)*4+8||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.data))throw Error('Invalid media');
 const buffer=Buffer.from(input.data,'base64');
 if(!buffer.length||buffer.length>max||buffer.toString('base64')!==input.data)throw Error('Invalid media');
 const head=buffer.subarray(0,20);
 const png=head.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
 const jpg=head.subarray(0,3).equals(Buffer.from('ffd8ff','hex'));
 const webp=head.subarray(0,4).toString()==='RIFF'&&head.subarray(8,12).toString()==='WEBP';
 const pdf=head.subarray(0,5).toString()==='%PDF-';
 const zip=head.subarray(0,4).equals(Buffer.from('504b0304','hex'));
 const expected=mime==='image/png'?png:mime==='image/jpeg'?jpg:mime==='image/webp'?webp:
  mime==='application/pdf'?pdf:mime.startsWith('application/vnd.openxmlformats-')?zip:true;
 if(!expected)throw Error('Invalid media');
 // Don't trust path separators or browser-provided filenames.
 const filename=typeof input.filename==='string'?input.filename.split(/[\\/]/).pop().trim().replace(/[\u0000-\u001f]/g,'').slice(0,120):'';
 if(!filename||/[<>:"|?*]/.test(filename))throw Error('Invalid media');
 return {filename,mime,data:input.data,bytes:buffer.length};
}

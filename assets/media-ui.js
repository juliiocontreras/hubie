// Client-side image optimization and document upload; server validates again.
async function imageBitmap(file){
 if(typeof createImageBitmap==='function')return createImageBitmap(file);
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
  img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('No fue posible abrir la imagen.'));};
  img.src=url;
 });
}
async function optimizeBackground(file,maxBytes){
 const image=await imageBitmap(file);
 const width=image.width,height=image.height;
 let scale=Math.min(1,1600/Math.max(width,height));
 let quality=.86,compressed=null;
 for(let pass=0;pass<8;pass++){
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('No se pudo procesar la fotografía.');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  compressed=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
  if(compressed?.size&&compressed.size<=maxBytes)break;
  quality=Math.max(.55,quality-.09);scale*=.82;
 }
 image.close?.();
 if(!compressed||compressed.size>maxBytes)throw Error('La imagen es demasiado grande para este fondo.');
 return {blob:compressed,filename:file.name.replace(/\.[^.]+$/, '')+'.jpg',mime:'image/jpeg'};
}
export async function encodeSelectedFile(file,{maxBytes=900000,types=['image/png','image/jpeg','image/webp']}={}){
 if(!file||!types.includes(file.type)||file.size<1)
  throw Error('Formato no compatible. Usa PNG, JPG, WEBP, PDF, TXT, CSV, DOCX o XLSX según la sección.');
 let source=file,filename=file.name,mime=file.type;
 if(file.size>maxBytes){
  if(!file.type.startsWith('image/'))throw Error('Archivo demasiado grande (máximo '+(maxBytes/1e6).toFixed(1)+' MB).');
  const optimized=await optimizeBackground(file,maxBytes);
  source=optimized.blob;filename=optimized.filename;mime=optimized.mime;
 }
 const result=await new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result));
  reader.onerror=()=>reject(Error('No fue posible leer el archivo.'));
  reader.readAsDataURL(source);
 });
 const data=result.split(',')[1];
 if(!data||data.length>Math.ceil(maxBytes/3)*4+8)throw Error('Archivo inválido.');
 return {filename,mime,data};
}
export function displayBytes(bytes){return (Number(bytes)/1024).toFixed(Number(bytes)<1024*1024?0:1)+' KB';}
export function downloadBlob(blob,filename){
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}

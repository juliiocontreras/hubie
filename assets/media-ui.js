// Client-side file handling for trusted, small images/documents.
// Re-checks are performed by the private server before persistence.
export async function encodeSelectedFile(file,{maxBytes=900000,types=['image/png','image/jpeg','image/webp']}={}){
 if(!file||!types.includes(file.type)||file.size>maxBytes||file.size<1)
  throw Error('Formato no compatible o archivo demasiado grande (máximo '+(maxBytes/1e6).toFixed(1)+' MB).');
 const result=await new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result));
  reader.onerror=()=>reject(Error('No fue posible leer el archivo.'));
  reader.readAsDataURL(file);
 });
 const part=result.split(',')[1];
 if(!part||part.length>Math.ceil(maxBytes/3)*4+8)throw Error('Archivo inválido.');
 return {filename:file.name,mime:file.type,data:part};
}
export function displayBytes(bytes){return (Number(bytes)/1024).toFixed(Number(bytes)<1024*1024?0:1)+' KB';}
export function downloadBlob(blob,filename){
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}

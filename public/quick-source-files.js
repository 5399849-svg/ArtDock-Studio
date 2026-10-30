export const isQuickSourceFile=file=>/\.(psd|psb|png|jpe?g|webp)$/i.test(file?.name||'')||/^image\/(png|jpeg|webp)$/i.test(file?.type||'');
export function clipboardSourceFiles(clipboard){
 const files=[...(clipboard?.items||[])].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean);
 return (files.length?files:[...(clipboard?.files||[])]).filter(isQuickSourceFile);
}
export function quickSourceFile(file){
 if(!isQuickSourceFile(file))throw Error('请选择 PSD、PSB、PNG、JPG 或 WebP 源文件');
 const photoshop=/\.ps[db]$/i.test(file.name),limit=photoshop?500:20;
 if(!file.size||file.size>limit*1048576)throw Error(`源文件不能超过 ${limit} MB，且不能是空文件`);
 const extension=/\.(psd|psb|png|jpe?g|webp)$/i.test(file.name)?'':file.type==='image/jpeg'?'.jpg':'.'+file.type.split('/')[1];
 return {file:extension?new File([file],(file.name||'粘贴素材')+extension,{type:file.type}):file,photoshop};
}

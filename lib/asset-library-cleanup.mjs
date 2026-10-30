import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {getRecycleBin} from './recycle-bin.mjs';
import {assetLibraryKey} from '../public/asset-library-key.js';
const fail=(message,status=422)=>Object.assign(Error(message),{status});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createAssetLibraryCleanup({runtimeDir,storageDir,sourceIndex,recycleBin}){
 const bin=Promise.resolve(recycleBin||getRecycleBin({runtimeDir,storageDir}));let queue=Promise.resolve();
 // Keep removals made before the recycle bin existed hidden.
 const legacy=async()=>{try{return JSON.parse(await fs.readFile(path.join(runtimeDir,'workbench-asset-library.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {removed:{},operations:{}};throw e;}};
 const status=async()=>({removedIds:[...new Set([...Object.keys((await legacy()).removed),...(await bin).assetStatus().removedIds])],removedUrls:(await bin).assetStatus().removedUrls});
 async function index(){const [idx,old,b]=await Promise.all([sourceIndex(),legacy(),bin]);return {...idx,assets:idx.assets.filter(a=>!old.removed[assetLibraryKey(a)]&&!b.isAssetHidden(a.url))};}
 async function plan(input){
  if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>10000||input.ids.some(id=>typeof id!=='string'||id.length>6000))throw fail('请选择 1–10000 项素材');
  const ids=[...new Set(input.ids)].sort(),idx=await index(),byId=new Map(idx.assets.map(a=>[assetLibraryKey(a),a]));
  if(idx.missing?.length||idx.missingLinks)throw fail('部分业务素材暂未加载，请刷新后重试',409);
  const assets=ids.map(id=>({...byId.get(id),recycleAssetId:id}));if(assets.some(a=>!a.url))throw fail('资产库已更新，请重新选择',409);
  return {assets,token:hash(assets),count:assets.length,freeBytes:0,purgeFiles:0,retainedCount:assets.length,recycled:true};
 }
 return {status,index,preview:async input=>{const {assets,...preview}=await plan(input);return preview;},erase:input=>{
  const next=queue.catch(()=>{}).then(async()=>{if(!/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId||''))throw fail('缺少有效操作编号');const b=await bin,previous=b.operation(input.requestId)||(await legacy()).operations[input.requestId];if(previous?.done)return previous;const work=await plan(input);if(work.token!==input.token)throw fail('素材已变化，请重新选择',409);return b.trashAssets(work.assets,input.requestId);});queue=next;return next;
 }};
}

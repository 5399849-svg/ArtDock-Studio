import test from 'node:test';
import assert from 'node:assert/strict';
import {mountAdAiReferences,adAiClipboardImages} from '../public/ad-ai-references.js';

// A small DOM double exercises event wiring without reading or launching a browser.
class Node {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners=new Map();this.classList={add(){},remove(){}};this.hidden=false;}
 set innerHTML(html){
  const stack=[this];for(const token of html.match(/<[^>]+>|[^<]+/g)||[]){if(token.startsWith('</')){stack.pop();continue;}if(!token.startsWith('<'))continue;const tag=token.match(/^<(\w+)/)?.[1];if(!tag)continue;const node=new Node(tag);node.className=token.match(/class="([^"]+)"/)?.[1]||'';stack.at(-1).append(node);if(!['input','img'].includes(tag))stack.push(node);}
 }
 append(...nodes){for(const node of nodes){this.children.push(node);node.parent=this;}}
 before(node){this.parent.children.splice(this.parent.children.indexOf(this),0,node);node.parent=this.parent;}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 setAttribute(name,value){this[name]=value;}
 querySelectorAll(selector){return this.children.flatMap(node=>[...(selector.startsWith('.')?(node.className||'').split(' ').includes(selector.slice(1)):node.tagName===selector)?[node]:[],...node.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 addEventListener(type,listener){this.listeners.set(type,listener);}
 removeEventListener(type){this.listeners.delete(type);}
 click(){if(!this.disabled)this.onclick?.();}
 showModal(){this.open=true;}
 close(){this.open=false;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);}
}
const settle=async editor=>{for(let i=0;i<100&&editor.busy;i++)await new Promise(resolve=>setTimeout(resolve,1));assert.equal(editor.busy,false);};
function fixture(t,{compact=false}={}){
 const previous=globalThis.document;globalThis.document={createElement:tag=>new Node(tag)};t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 const panel=new Node(),suggestions=new Node();
 if(compact){const composer=new Node(),footer=new Node();composer.className='ad-ai-composer';footer.className='ad-ai-composer-footer';composer.append(footer);panel.append(composer);}
 else{suggestions.className='ad-ai-suggestions';panel.append(suggestions);}
 const batch={assets:[]},item={draft:{sourceAssetId:'art'},versions:[{number:1}]},calls=[],errors=[];let refs=[];
 const api=async(url,options={})=>{calls.push({url,options});if(options.method==='POST')refs.push({id:'ref-'+(refs.length+1),name:options.body.name,url:'/storage/ad-resources-test/ai-reference/ref.png'});if(options.method==='DELETE')refs=refs.filter(ref=>!url.endsWith('/'+ref.id));return {references:[...refs]};};
 const editor=mountAdAiReferences({panel,batch,item,endpoint:'/test',api,isActive:()=>true,onChange(){},onError:error=>errors.push(error)});
 return {panel,batch,item,calls,errors,editor};
}

test('paste/upload/drop produce persistent reference IDs, thumbnails preview full images and removal does not touch the draft',async t=>{
 const f=fixture(t),before=structuredClone(f.item),file={name:'布局.png',size:30,type:'image/png'};let prevented=false;
 f.panel.listeners.get('paste')({clipboardData:{items:[{kind:'file',type:'image/png',getAsFile:()=>file}]},preventDefault(){prevented=true;}});await settle(f.editor);
 assert.equal(prevented,true);assert.equal(f.calls[0].options.body,file);assert.equal(f.calls[0].options.headers['Content-Type'],'application/octet-stream');assert.deepEqual(f.editor.ids,['ref-1']);assert.deepEqual(f.item.aiEditReferenceIds,['ref-1']);assert.deepEqual(f.item.draft,before.draft);assert.deepEqual(f.item.versions,before.versions);assert.equal(f.batch.assets.length,0);
 f.panel.querySelector('.ad-ai-reference-thumb').click();const dialog=f.panel.querySelector('dialog');assert.equal(dialog.open,true);assert.match(dialog.querySelector('img').src,/\/ai-reference\//);dialog.querySelector('button').click();assert.equal(dialog.open,false);
 const input=f.panel.querySelector('input');input.files=[{...file,name:'布局2.png'}];input.onchange();await settle(f.editor);assert.deepEqual(f.editor.ids,['ref-1','ref-2']);
 const zone=f.panel.querySelector('.ad-ai-reference-drop');zone.ondrop({preventDefault(){},dataTransfer:{files:[{...file,name:'布局3.png'}]}});await settle(f.editor);assert.equal(f.editor.ids.length,3);assert.equal(zone.hidden,true);assert.equal(f.panel.querySelector('.ad-ai-reference-add').disabled,true);
 await f.panel.querySelector('.ad-ai-reference-remove').onclick();assert.equal(f.editor.ids.length,2);assert.equal(zone.hidden,false);assert.equal(f.panel.querySelector('.ad-ai-reference-add').disabled,false);
 f.editor.dispose();assert.equal(f.panel.listeners.has('paste'),false);assert.equal(f.panel.querySelector('.ad-ai-references'),null);
});

test('plain text paste is unchanged, image editing is locked during generation, invalid files never submit',async t=>{
 const f=fixture(t);let prevented=false;const paste=f.panel.listeners.get('paste');paste({clipboardData:{items:[{kind:'string',type:'text/plain'}]},preventDefault(){prevented=true;}});assert.equal(prevented,false);
 f.editor.setLocked(true);paste({clipboardData:{items:[{kind:'file',type:'image/png',getAsFile:()=>({name:'图.png',type:'image/png',size:10})}]},preventDefault(){}});assert.equal(f.calls.length,0);assert.equal(f.panel.querySelector('input').disabled,true);
 f.editor.setLocked(false);const input=f.panel.querySelector('input');input.files=[{name:'图.gif',type:'image/gif',size:10}];input.onchange();assert.equal(f.calls.length,0);assert.match(f.errors.at(-1),/仅支持/);f.editor.dispose();
});

test('instruction-box image paste handles clipboard files fallback without duplicating items and shows no explanatory paragraph',async t=>{
 const f=fixture(t),file={name:'粘贴图.png',size:10,type:'image/png'};assert.deepEqual(adAiClipboardImages({items:[],files:[file]}),[file]);assert.deepEqual(adAiClipboardImages({items:[{kind:'file',type:'image/png',getAsFile:()=>file}],files:[file]}),[file]);
 assert.equal(f.panel.querySelector('.ad-ai-reference-help'),null);f.panel.listeners.get('paste')({target:{tagName:'TEXTAREA'},clipboardData:{files:[file]},preventDefault(){}});await settle(f.editor);assert.deepEqual(f.editor.ids,['ref-1']);f.editor.dispose();
});

test('compact composer uses one add button and keeps paste, drop, preview and removal without an upload instruction block',async t=>{
 const f=fixture(t,{compact:true}),composer=f.panel.querySelector('.ad-ai-composer'),file={name:'气泡参考.png',size:30,type:'image/png'};
 assert.equal(f.panel.querySelector('.ad-ai-reference-drop'),null);assert.equal(f.panel.querySelector('.ad-ai-suggestions'),null);
 assert.equal(f.panel.querySelector('.ad-ai-reference-heading').querySelector('b'),null);
 let pickerCalls=0;f.panel.querySelector('input').click=()=>pickerCalls++;
 f.panel.querySelector('.ad-ai-reference-add').click();assert.equal(pickerCalls,1);
 composer.click();assert.equal(pickerCalls,1,'clicking the instruction area must not open the file picker');
 composer.ondrop({preventDefault(){},dataTransfer:{files:[file]}});await settle(f.editor);assert.deepEqual(f.editor.ids,['ref-1']);
 assert.ok(f.panel.querySelector('.ad-ai-reference-heading').querySelector('.ad-ai-reference-thumb'),'the reference thumbnail belongs to the original plus-button slot');
 f.panel.listeners.get('paste')({clipboardData:{files:[{...file,name:'衔接参考.png'},{...file,name:'布局参考.png'}]},preventDefault(){}});await settle(f.editor);
 assert.equal(f.editor.ids.length,3);assert.equal(composer.hidden,false,'the full instruction composer stays visible at the attachment limit');assert.equal(f.panel.querySelector('.ad-ai-reference-add').disabled,true);
 f.editor.setLocked(true);composer.ondrop({preventDefault(){},dataTransfer:{files:[file]}});assert.equal(f.calls.length,3);
 f.editor.setLocked(false);await f.panel.querySelector('.ad-ai-reference-remove').onclick();assert.equal(f.editor.ids.length,2);
 f.editor.dispose();assert.equal(composer.ondrop,null);assert.equal(f.panel.listeners.has('paste'),false);
});

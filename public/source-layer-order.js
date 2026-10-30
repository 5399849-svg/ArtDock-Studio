export const isCopyrightLayer=layer=>['ip-copyright','copyright'].includes(layer.role);
export const sourceStackLayers=composition=>(composition?.layers||[]).filter(layer=>!isCopyrightLayer(layer));

// Array order is back to front; the sidebar presents the reverse, like PSD.
export function moveSourceLayer(composition,id,index){
 const displayed=sourceStackLayers(composition).reverse(),from=displayed.findIndex(layer=>layer.id===id);
 if(from<0||!Number.isInteger(index)||index<0||index>=displayed.length||from===index)return false;
 const [layer]=displayed.splice(from,1);displayed.splice(index,0,layer);
 composition.layers=[...displayed.reverse(),...composition.layers.filter(isCopyrightLayer)];
 composition.layerOrderCustomized=true;return true;
}

export function preserveSourceLayerOrder(layers,previous){
 if(!previous?.layerOrderCustomized)return layers;
 const byId=new Map(layers.filter(layer=>!isCopyrightLayer(layer)).map(layer=>[layer.id,layer]));
 const ordered=previous.layers.filter(layer=>byId.has(layer.id)).map(layer=>byId.get(layer.id));
 const known=new Set(ordered.map(layer=>layer.id));let index=0;
 return layers.map(layer=>known.has(layer.id)?ordered[index++]:layer);
}

// Separate cutouts have lost the PSD's z-order. Use original visual size as
// the initial foreground cue; explicit designer ordering always wins.
export function sourceCharacterDepth(a,b){
 const character=layer=>['character','secondary-character'].includes(layer.role)&&layer.sourceBounds;
 if(!character(a)||!character(b))return 0;
 const area=layer=>layer.sourceBounds.width*layer.sourceBounds.height;
 return area(a)-area(b);
}

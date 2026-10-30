// Shared by the editor and server: all positions are relative to the PSD artboard.
export function orderedLayers(manifest) {
  const order=manifest.variant==='portrait'?['background','screenshot','character','copy','logo']:['background','character','screenshot','copy','logo'];
  return [...manifest.layers].sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
}

export function foregroundClipPercent(layer, adjustment = {}) {
  if(adjustment.occlude===false || !(layer.foregroundClipY>0) || !layer.rect?.height) return 0;
  return Math.max(0,Math.min(100,100*(1-layer.foregroundClipY/layer.rect.height)));
}

export function layerGeometry(layer, manifest, target, adjustment = {}) {
  const rect = layer.rect || { x:0, y:0, width:manifest.width, height:manifest.height };
  const isBackground = layer.id === 'background';
  const cover = target.composition === 'crop-center' || (isBackground && !layer.compositeArtwork);
  const base = (cover ? Math.max : Math.min)(target.width / manifest.width, target.height / manifest.height);
  const scale = base * (Number(adjustment.scale) || 100) / 100;
  return {
    width:Math.max(1, Math.round(rect.width * scale)),
    height:Math.max(1, Math.round(rect.height * scale)),
    left:Math.round(target.width / 2 + (rect.x - manifest.width / 2) * scale + target.width * (Number(adjustment.x) || 0) / 100),
    top:Math.round(target.height / 2 + (rect.y - manifest.height / 2) * scale + target.height * (Number(adjustment.y) || 0) / 100),
  };
}

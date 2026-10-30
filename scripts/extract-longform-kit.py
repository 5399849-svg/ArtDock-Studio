from pathlib import Path
from psd_tools import PSDImage
import json
root=Path(__file__).resolve().parents[1]
out=root/'data/runtime/longform/reference';out.mkdir(parents=True,exist_ok=True)
requests=[('常驻攻略征集活动长图-05-29.psb',[('/版块1/底板','kit-pop-panel.png'),('/头图/猫','kit-pop-character.png'),('/头图/top','kit-pop-hero.png')]),('爪爪六月策划回复特辑美术需求.psd',[('/Q/组 1/图层 16 拷贝','kit-pop-question.png'),('/A/图层 14','kit-pop-answer.png')]),('常驻攻略征集活动长图-05-29 (1).psb',[('/版块1/底板1','kit-festival-panel.png')])]
manifest=[]
for filename,targets in requests:
 print('Reading '+filename,flush=True)
 psd=PSDImage.open(root/'长图'/filename)
 nodes={}
 def walk(parent,prefix=''):
  for layer in parent:
   key=prefix+'/'+layer.name;nodes[key]=layer
   if layer.is_group():walk(layer,key)
 walk(psd)
 for key,name in targets:
  layer=nodes[key]
  image=layer.composite()
  if image is None:raise RuntimeError('No image: '+key)
  image.save(out/name)
  manifest.append({'file':name,'source':filename,'layer':key,'bbox':list(layer.bbox)})
  print(name+' '+str(image.size),flush=True)
 del psd,nodes
(out/'kit-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')

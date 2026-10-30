"""One-time extraction of reusable artwork. No Photoshop dependency or source edits."""
import json
import sys
from pathlib import Path
from psd_tools import PSDImage

source=Path(sys.argv[1]); out=Path(sys.argv[2]); out.mkdir(parents=True,exist_ok=True)
psd=PSDImage.open(source)
layers=list(psd.descendants()); manifest={'source':source.name,'width':psd.width,'height':psd.height,'assets':[],'errors':[]}
targets={'panel':'底框','panel-outer':'底框2','ornament':'装饰 拷贝','logo':'LOGO白底-材质版'}
for key,name in targets.items():
    layer=next((l for l in layers if l.name==name),None)
    if layer is None: continue
    try:
        image=layer.composite(force=True)
        if image is None: raise ValueError('Empty layer')
        image.save(out/(key+'.png'))
        manifest['assets'].append({'id':key,'file':key+'.png','width':image.width,'height':image.height})
    except Exception as e: manifest['errors'].append({'id':key,'error':str(e)[:180]})
# Heading frame: render its non-text children, maintaining the source effect artwork.
heading=next((l for l in layers if l.name=='标题1' and l.is_group()),None)
if heading:
    try:
        image=heading.composite(force=True,layer_filter=lambda l:l.kind!='type')
        image.save(out/'heading.png'); manifest['assets'].append({'id':'heading','file':'heading.png','width':image.width,'height':image.height})
    except Exception as e: manifest['errors'].append({'id':'heading','error':str(e)[:180]})
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(manifest,ensure_ascii=False))

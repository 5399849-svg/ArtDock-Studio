from pathlib import Path
from psd_tools import PSDImage
import json
root=Path(__file__).resolve().parents[1]
psd=PSDImage.open(root/'长图/魂师赛第一专访.psb')
nodes={}
def walk(p,path=''):
 for l in p:
  key=path+'/'+l.name;nodes[key]=l
  if l.is_group():walk(l,key)
walk(psd)
base='/组 1632362607/文案模块1'
for key in nodes:
 if key.startswith(base+'/问答1/问1/头像') or key.startswith(base+'/1/底框2'):print(key, nodes[key].kind, nodes[key].bbox)
for key,name in [(base+'/问答1/问1/头像/组 1632362547/组 1632362603/组 78 拷贝','interview-avatar-rim.png'),(base+'/1/底框2','interview-separator-source.png')]:
 image=nodes[key].composite();image.save(root/'data/runtime/longform/reference'/name)
 print(name,image.size)

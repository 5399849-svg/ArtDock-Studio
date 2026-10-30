from pathlib import Path
import json
from psd_tools import PSDImage
p=next(Path('渠道测试和首发ICON-模版规范PSD版本：V1.0').glob('*.psd'));d=PSDImage.open(p)
rows='''华为|216|2048|0
华为小游戏|216|2048|35
华为小游戏|216|2048|0
vivo|256|50|0
vivo|512|50|0
vivo小游戏|256|50|0
应用宝|16|20|0
应用宝|28|200|4
应用宝|48|200|10
应用宝|108|200|15
应用宝|128|200|18
应用宝|512|200|0
应用宝|512|200|72
OPPO|512|500|0
OPPO|256|50|0
OPPO小游戏|222|30|111
OPPO小游戏|256|30|0
九游UC|512|1024|100
小米|512|-300|100
Taptap|512|1024|0
B站|512|300|0
4399|512|600|100
好游快爆|256|80|0
荣耀|512|200|0
雷电模拟器|200|200|40
美团小游戏|120|30|22
美团小游戏|128|30|22
美团小游戏|256|30|50
美团小游戏|248|30|124
美团小游戏|176|15|0
荣耀小游戏|320|200|0
支付宝小游戏|180|2048|0
360|512|2048|100
买量|512|300|100
买量|300|300|58
买量|180|60|32'''
a=Path('public/icon-launch-assets');a.mkdir(exist_ok=True)
specs=[];audit=[]
for i,(row,g) in enumerate(zip(rows.splitlines(),[g for g in d if g.is_group()])):
 ch,w,lim,r=row.split('|');w=int(w);lim=int(lim);r=int(r)
 shape=next(l for l in g if l.vector_mask)
 pts=[(k.anchor[1]*d.width,k.anchor[0]*d.height) for s in shape.vector_mask.paths if hasattr(s,'__iter__') for k in s if hasattr(k,'anchor')]
 xs=sorted(set(round(x,2) for x,y in pts));ys=sorted(set(round(y,2) for x,y in pts))
 assert abs(xs[-1]-xs[0]-w)<.1 and abs(ys[-1]-ys[0]-w)<.1,(g.name,xs,ys)
 radius=0 if len(xs)==2 else round(xs[1]-xs[0])
 assert radius==r,(g.name,radius,r)
 spec=dict(id=f'launch-{i+1:02}',channel=ch,width=w,height=w,cornerRadiusPx=r,badge=None,psdGroup=g.name,formats=['PNG','JPG'] if i in [4,5] else ['PNG'])
 spec['minKB' if lim<0 else 'maxKB']=abs(lim)
 if i==4: spec['outputFormat']='JPG'
 badges=[l for l in g if '角标' in l.name and l.visible]
 if badges:
  b=badges[0];img=b.composite();name=f'badge-{i+1:02}.png';img.save(a/name)
  spec.update(badge=ch,badgeAsset=name,badgeWidth=img.width,badgeHeight=img.height)
 if w==176:
  spec.update(contentSize=148,contentRadiusPx=48,contentInsetPx=14,transparentCanvas=True)
  # User confirmed transparent outer canvas; do not export the PSD white backing.
 specs.append(spec);audit.append(dict(group=g.name,size=w,radius=radius))
def save(file,obj):Path(file).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
save('config/icon-launch-v1.json',dict(id='icon-launch-v1',name='ICON测试和首发期尺寸',format='PNG',expectedCount=36,psdFile=p.as_posix(),specVersion='V1.0',specs=specs,templateAudit=audit))
rows='''华为 1080 1920 1024
华为 1920 1080 1024
华为快应用 800 450 2048
华为快应用 450 800 2048
vivo 1080 1920 2048
vivo 480 800 2048
vivo 1080 720 200
vivo小游戏 1080 1920 1024
OPPO 1080 1920 1024
OPPO 1915 1080 1024
OPPO小游戏 1080 1920 1024
九游UC 720 1080 1024 extend
九游UC 1080 720 1024 extend
小米 1920 1080 1024
小米 2048 1536 1024 extend
小米 1080 1920 1024
小米 320 448 200 extend
B站 720 1280 200
B站 1280 720 200
4399 1600 960 1024 extend
好游快爆 1280 720 2048
荣耀 1920 1080 5120
应用宝 1080 1920 1024
美团 353 195 1024 extend'''
s=[]
for row in rows.splitlines():
 t=row.split();s.append(dict(channel=t[0],width=int(t[1]),height=int(t[2]),maxKB=int(t[3]),composition='extend' if len(t)>4 else 'crop-center'))
save('config/store-launch-v1.json',dict(id='store-launch-v1',name='商店图测试和首发期尺寸',format='JPG',pagesPerSet=6,expectedCount=24,specs=s))
print('Verified PSD geometry: 36; exported badges:',len(list(a.glob('badge*'))),'store specs:',len(s))

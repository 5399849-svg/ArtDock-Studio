"""Read source documents and save analysis artifacts; never modify PSD/PSB files."""
import json, math, gc
from pathlib import Path
from collections import Counter
from psd_tools import PSDImage
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).resolve().parents[1]
source=root/'长图'; out=source/'源文件分析';out.mkdir(exist_ok=True)
files=sorted([*source.glob('*.psd'),*source.glob('*.psb')])
reports=[]
def plain(x):
    if isinstance(x,dict):return {str(k):plain(v) for k,v in x.items()}
    if isinstance(x,(tuple,list)):return [plain(v) for v in x]
    if isinstance(x,(str,int,float,bool)) or x is None:return x
    return str(x)
for index,file in enumerate(files,1):
    slug=f'{index:02d}';folder=out/slug;folder.mkdir(exist_ok=True)
    print(f'OPEN {slug} {file.name}',flush=True)
    psd=PSDImage.open(file);records=[]
    def walk(layer,depth,parent):
        rec={'name':layer.name,'kind':layer.kind,'visible':layer.is_visible(),'ownVisible':layer.visible,'depth':depth,'parent':parent,'bbox':list(layer.bbox),'opacity':layer.opacity,'blend':str(layer.blend_mode),'mask':layer.has_mask(),'clipping':layer.clipping}
        try:rec['effects']=[type(e).__name__ for e in layer.effects if e.enabled]
        except Exception:rec['effects']=[]
        if layer.kind=='type':
            rec['text']=layer.text
            try:
                fonts=layer.resource_dict.get('FontSet',[])
                runs=layer.engine_dict.get('StyleRun',{}).get('RunArray',[])
                styles=[]
                for run in runs:
                    st=run.get('StyleSheet',{}).get('StyleSheetData',{})
                    font_index=int(st.get('Font',0))
                    styles.append({'font':str(fonts[font_index].get('Name','')) if font_index<len(fonts) else str(font_index),'size':float(st.get('FontSize',0)),'color':plain(st.get('FillColor',{}))})
                rec['styles']=styles
                rec['transform']=list(layer.transform)
            except Exception as e:rec['textError']=str(e)
        records.append(rec)
        if layer.is_group():
            for child in layer:walk(child,depth+1,parent+'/'+layer.name)
    for layer in psd:walk(layer,0,'')
    report={'id':slug,'file':file.name,'bytes':file.stat().st_size,'width':psd.width,'height':psd.height,'records':records,'counts':dict(Counter(r['kind'] for r in records)),'visibleCounts':dict(Counter(r['kind'] for r in records if r['visible'])),'fonts':dict(Counter(s['font'] for r in records if r['visible'] for s in r.get('styles',[])))}
    image=psd.topil()
    report['previewSource']='embedded composite'
    if image is None:image=psd.composite();report['previewSource']='recomposited'
    image=image.convert('RGB');image.save(folder/'full.jpg',quality=92)
    view=image.copy();view.thumbnail((750,50000));view.save(folder/'readable.jpg',quality=94)
    for n,y in enumerate(range(0,view.height,1450),1):view.crop((0,y,view.width,min(y+1450,view.height))).save(folder/f'part-{n:02d}.jpg',quality=94)
    report['parts']=math.ceil(view.height/1450)
    (folder/'layers.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    (folder/'visible-text.txt').write_text('\n\n'.join(f"[{r['bbox']}] {r['parent']}/{r['name']}\n{r['text']}" for r in records if r['visible'] and r.get('text')),encoding='utf8')
    reports.append({k:v for k,v in report.items() if k!='records'})
    print(json.dumps(reports[-1],ensure_ascii=False),flush=True)
    del psd,records,image,view;gc.collect()
(out/'summary.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf8')
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',19)
sheet=Image.new('RGB',(340*len(reports),1960),'#e7ebef');draw=ImageDraw.Draw(sheet)
for i,r in enumerate(reports):
    x=i*340;draw.text((x+12,12),r['id']+' '+r['file'][:14],font=font,fill='#1b2635');draw.text((x+12,43),f"{r['width']} × {r['height']}",font=font,fill='#39495b')
    im=Image.open(out/r['id']/'full.jpg');im.thumbnail((316,1850));sheet.paste(im,(x+(340-im.width)//2,85))
sheet.save(out/'总览.jpg',quality=94)
print('DONE',flush=True)

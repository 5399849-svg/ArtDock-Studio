"""Import a WeCom workbook without executing formulas or following material links."""
import json
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET
from PIL import Image

M = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
P = 'http://schemas.openxmlformats.org/package/2006/relationships'
D = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
def q(ns, tag): return '{'+ns+'}'+tag
def resolve(source, target):
    import posixpath
    return posixpath.normpath(posixpath.join(posixpath.dirname(source), target)).lstrip('/') if not target.startswith('/') else target[1:]
def rels(z, source):
    p = PurePosixPath(source)
    f = str(p.parent / '_rels' / (p.name+'.rels'))
    if f not in z.namelist(): return {}
    return {r.get('Id'): resolve(source,r.get('Target','')) for r in ET.fromstring(z.read(f)) if r.get('TargetMode') != 'External'}
def read_workbook(source, output):
    output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as z:
        if sum(i.file_size for i in z.infolist()) > 180_000_000: raise ValueError('解压后的表格超过 180MB')
        strings=[]
        if 'xl/sharedStrings.xml' in z.namelist():
            strings=[''.join(t.text or '' for t in s.iter(q(M,'t'))) for s in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        wb=ET.fromstring(z.read('xl/workbook.xml')); wr=rels(z,'xl/workbook.xml')
        sheets=[]
        for s in wb.find(q(M,'sheets')):
            sf=wr[s.get(q(R,'id'))]; xml=ET.fromstring(z.read(sf)); cells={}; rows={}
            for c in xml.iter(q(M,'c')):
                v=c.find(q(M,'v')); text=v.text or '' if v is not None else ''
                if c.get('t')=='s' and text: text=strings[int(text)]
                elif c.get('t')=='inlineStr': text=''.join(t.text or '' for t in c.iter(q(M,'t')))
                if text:
                    addr=c.get('r'); cells[addr]=text
                    col,row=re.match(r'([A-Z]+)(\d+)',addr).groups(); rows.setdefault(int(row),{})[col]=text
            images=[]; saved={}
            sr=rels(z,sf)
            for dr in xml.iter(q(M,'drawing')):
                dp=sr.get(dr.get(q(R,'id')))
                if not dp: continue
                for anchor in ET.fromstring(z.read(dp)):
                    origin=anchor.find(q(D,'from')); blip=anchor.find('.//'+q(A,'blip'))
                    if origin is None or blip is None: continue
                    media=rels(z,dp).get(blip.get(q(R,'embed')))
                    if not media or media not in z.namelist(): continue
                    if media not in saved:
                        suffix=PurePosixPath(media).suffix.lower()
                        if suffix not in ['.png','.jpg','.jpeg','.webp']: continue
                        name=f'image-{len(saved)+1}{suffix}'; (output/name).write_bytes(z.read(media)); saved[media]=name
                    with Image.open(output/saved[media]) as im: width,height=im.size
                    images.append({'file':saved[media],'row':int(origin.find(q(D,'row')).text)+1,'column':int(origin.find(q(D,'col')).text)+1,'width':width,'height':height})
            sheets.append({'name':s.get('name'),'cells':cells,'rows':rows,'images':images})
    # Select the requirement sheet by its headings, rather than silently merging tabs.
    sheet=next((s for s in sheets if '文案' in s['cells'].values() and '模块' in s['cells'].values()),None)
    if sheet is None: raise ValueError('未找到“模块”和“文案”列，请使用需求表结构，或手动创建')
    header=next((n for n,r in sheet['rows'].items() if '模块' in r.values() and '文案' in r.values()),None)
    if header is None: raise ValueError('模块与文案标题需要在同一行')
    heads=sheet['rows'][header]; module_col=next(k for k,v in heads.items() if v=='模块'); copy_col=next(k for k,v in heads.items() if v=='文案')
    art_col=next((k for k,v in heads.items() if v=='美术'),'G')
    document={'title':'','subtitle':'','intro':'','outro':'','blocks':[],'people':[],'sourceCells':[],'notes':[],'warnings':[]}
    mode=''; group=''; pending=''; names=[]
    for row,c in sorted(sheet['rows'].items()):
        if row<=header: continue
        label=c.get(module_col,'').strip(); text=c.get(copy_col,'')
        if label: mode=label
        if text in ['主标题','副标题']: pending=text; continue
        if mode=='头图':
            if text and pending: document['title' if pending=='主标题' else 'subtitle']=text; document['sourceCells'].append({'cell':f'{copy_col}{row}','text':text}); pending=''
            elif text: document['notes'].append(text)
        elif mode in ['主标题','副标题'] and text:
            document['title' if mode=='主标题' else 'subtitle']=text
        elif mode=='大标题' and text:
            group=f'group-{row}'; document['blocks'].append({'id':f'b-{row}','kind':'part','group':group,'text':text,'sourceCell':f'{copy_col}{row}'})
        elif mode in ['导语','活动简介'] and text:
            if not group: document['intro']=text
            else: document['blocks'].append({'id':f'b-{row}','kind':'paragraph','group':group,'text':text,'sourceCell':f'{copy_col}{row}'})
        elif mode=='结束语' and text: document['outro']=text
        elif mode=='对话部分':
            if text: document['notes'].append(text)
        elif text and mode in ['活动时间','投稿时间','奖励','投稿奖励','活动奖励','创作主题','征稿主题','投稿方式','操作步骤','活动规则','规则','问题','提问','回答','回复','策划回复']:
            if mode in ['问题','提问']:
                document['templateId']='qa'
                document['blocks'].append({'id':f'b-{row}','kind':'qa','moduleRoot':True,'text':text,'answer':'','sourceCell':f'{copy_col}{row}'})
            elif mode in ['回答','回复','策划回复'] and document['blocks'] and document['blocks'][-1]['kind']=='qa':
                previous=document['blocks'][-1]
                previous['answer']+=(('\n' if previous['answer'] else '')+text)
            elif mode in ['回答','回复','策划回复']:
                document['blocks'].append({'id':f'b-{row}','kind':'paragraph','moduleRoot':True,'text':text,'sourceCell':f'{copy_col}{row}'})
            else:
                document['templateId']='event'
                kind='dates' if mode in ['活动时间','投稿时间'] else 'rewards' if mode in ['奖励','投稿奖励','活动奖励'] else 'cards' if mode in ['创作主题','征稿主题'] else 'steps' if mode in ['投稿方式','操作步骤'] else 'rules'
                if kind=='rules': document['blocks'].append({'id':f'b-{row}','kind':kind,'moduleRoot':True,'text':text,'sourceCell':f'{copy_col}{row}'})
                else:
                    item={'id':f'item-{row}','title':text,'detail':'','quantity':'','assetId':''}
                    if document['blocks'] and document['blocks'][-1]['kind']==kind and document['blocks'][-1]['text']==mode:
                        document['blocks'][-1]['items'].append(item)
                    else: document['blocks'].append({'id':f'b-{row}','kind':kind,'moduleRoot':True,'text':mode,'items':[item],'sourceCell':f'{copy_col}{row}'})
        elif text:
            speaker=re.match(r'^([^：:\n]{1,30})[：:]',text)
            if re.match(r'^[一二三四五六七八九十]+[、．.]',text): kind='section'; who=''
            elif speaker: kind='dialogue'; who=speaker.group(1); names.append(who)
            else: kind='paragraph'; who=''
            document['blocks'].append({'id':f'b-{row}','kind':kind,'group':group,'text':text,'speaker':who,'sourceCell':f'{copy_col}{row}'})
        if text and mode!='头图' and mode!='对话部分': document['sourceCells'].append({'cell':f'{copy_col}{row}','text':text})
        if c.get(art_col): document['notes'].append(c[art_col])
    document['people']=[{'id':f'p-{i}','name':n,'role':'host' if i==0 else 'guest','assetId':'','crop':{'x':50,'y':35,'zoom':1}} for i,n in enumerate(dict.fromkeys(names))]
    # Image roles are suggestions derived from row proximity; original images stay available.
    assets=[]; seen=set()
    ref_col=ord(module_col[0])-64
    dialogue_rows=[r for r,c in sheet['rows'].items() if c.get(module_col)=='对话部分']
    row_modes={}; current_mode=''
    for r,c in sorted(sheet['rows'].items()):
        current_mode=c.get(module_col,'').strip() or current_mode; row_modes[r]=current_mode
    for img in sheet['images']:
        aid=img['file']; role='reference' if img['column']<ref_col else 'header' if img['row']<min(dialogue_rows or [999]) else 'material'
        if document.get('templateId') and role!='reference':
            row_mode=row_modes.get(img['row'],'')
            role='header' if row_mode=='头图' else 'material'
            for block in document['blocks']:
                for item in block.get('items',[]):
                    if item['id']==f"item-{img['row']}" and not item['assetId']:item['assetId']=aid
        if aid not in seen: assets.append({'id':aid,'name':aid,'role':role,**img}); seen.add(aid)
        if img['row'] in dialogue_rows:
            cells=sheet['rows'][img['row']]
            hint=cells.get(art_col,'') if img['column']>=ord(art_col[0])-64 else cells.get(copy_col,'')
            person=next((p for p in document['people'] if p['name'] in hint),None)
            if person: person['assetId']=aid
    if not document['title']: document['title']=Path(source).stem; document['warnings'].append('未识别主标题，暂用文件名，请核对')
    if not document['blocks']: raise ValueError('没有识别到正文，请检查模块列和文案列')
    document['warnings'].append('请核对图片用途和头像裁切；导入不自动打开内网链接。')
    return {'document':document,'assets':assets,'sheetName':sheet['name'],'sheetNames':[s['name'] for s in sheets]}

if __name__=='__main__':
    try:
        result=read_workbook(Path(sys.argv[1]),Path(sys.argv[2])); print(json.dumps(result,ensure_ascii=False))
    except Exception as e:
        print(str(e),file=sys.stderr); sys.exit(1)

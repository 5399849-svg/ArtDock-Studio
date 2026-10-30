import importlib.util,tempfile,zipfile
from pathlib import Path
from xml.sax.saxutils import escape
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('importer',root/'scripts/longform-import.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def fixture(rows,path):
 sheet='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
 for i,row in enumerate(rows,1):
  sheet+=f'<row r="{i}">'+''.join(f'<c r="{chr(65+j)}{i}" t="inlineStr"><is><t>{escape(value)}</t></is></c>' for j,value in enumerate(row))+'</row>'
 sheet+='</sheetData></worksheet>'
 with zipfile.ZipFile(path,'w') as z:
  z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="需求" sheetId="1" r:id="r1"/></sheets></workbook>')
  z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>')
  z.writestr('xl/worksheets/sheet1.xml',sheet)
with tempfile.TemporaryDirectory() as tmp:
 p=Path(tmp)
 fixture([['模块','文案'],['活动时间','6月1日—6月30日'],['投稿奖励','钻石 × 500'],['','体力 × 20'],['活动规则','1. 请提交原创内容。']],p/'event.xlsx')
 d=m.read_workbook(p/'event.xlsx',p/'event')['document'];assert d['templateId']=='event';assert [b['kind'] for b in d['blocks']]==['dates','rewards','rules'];assert [i['title'] for i in d['blocks'][1]['items']]==['钻石 × 500','体力 × 20']
 fixture([['模块','文案'],['问题','什么时候更新？'],['回答','本周五，具体时间以公告为准。'],['问题','奖励是否保留？'],['回复','保留。']],p/'qa.xlsx')
 d=m.read_workbook(p/'qa.xlsx',p/'qa')['document'];assert d['templateId']=='qa';assert len(d['blocks'])==2;assert d['blocks'][0]['answer']=='本周五，具体时间以公告为准。';assert len(d['sourceCells'])==4
 print('PASS: event and QA workbook import preserve exact copy and group typed modules')

import contextlib
import io
import json
from pathlib import Path
import runpy
import tempfile
import unittest
import zipfile
from xml.etree import ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
module=runpy.run_path(str(ROOT/'scripts/sync-ad-resources.py'))
sync=module['sync']
assign_ids=module['assign_spec_ids']


def old_specs():
    placements=[('TapTap',1280,720,'JPG','required'),('TapTap',1280,720,'JPG','forbidden'),('B站',640,400,'JPG','forbidden'),('B站',640,400,'GIF','forbidden'),('广点通',1080,1920,'JPG','required'),('广点通',1280,720,'JPG','required'),('广点通',720,1280,'JPG','required'),('广点通',800,800,'JPG','required')]
    return [dict(id=f'ad-{i:02}',number=i,platform=p,width=w,height=h,format=f,logo=l) for i,(p,w,h,f,l) in enumerate(placements,1)]


class CatalogSyncTests(unittest.TestCase):
    def test_real_document_imports_main_sheet_only_and_retains_saved_placement_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            d=Path(directory);output=d/'catalog.json'
            previous=dict(sourceName='old.xlsx',sourceSha256='legacy-eight',sheet='投放资源位',specs=old_specs())
            output.write_text(json.dumps(previous),encoding='utf-8')
            with contextlib.redirect_stdout(io.StringIO()):
                catalog=sync(ROOT/'02 规范与模板/投放/资源位规范/投放资源位尺寸表.xlsx',output,d/'references')
            self.assertEqual(len(catalog['specs']),10)
            self.assertEqual([s['number'] for s in catalog['specs']],list(range(1,11)))
            self.assertEqual([s['id'] for s in catalog['specs']],['ad-01','ad-02','ad-03','ad-05','ad-06','ad-07','ad-08','ad-09','ad-10','ad-11'])
            self.assertEqual([s['logo'] for s in catalog['specs']],['required','forbidden','forbidden','required','required','forbidden','forbidden','required','required','required'])
            self.assertTrue(all(s['format']=='JPG' for s in catalog['specs']))
            self.assertEqual([s['safeInsetX'] for s in catalog['specs']],[0,0,40,0,0,0,0,0,0,0])
            self.assertEqual([s['platform'] for s in catalog['specs']][-3:],['头条搜索']*3)
            self.assertTrue(all('尺寸' in s['outputRule'] for s in catalog['specs']))
            self.assertEqual([s['id'] for s in catalog['retiredSpecs']],['ad-04'])
            self.assertEqual(catalog['previousCatalogs'][0]['sourceSha256'],'legacy-eight')
            with contextlib.redirect_stdout(io.StringIO()):
                again=sync(ROOT/'02 规范与模板/投放/资源位规范/投放资源位尺寸表.xlsx',output,d/'references')
            self.assertEqual(catalog,again,'re-reading the same document must not shift IDs or append history')

    def test_reordering_and_restoring_a_removed_placement_do_not_reuse_an_unrelated_id(self):
        previous={'specs':old_specs()}
        next_specs=[{k:v for k,v in s.items() if k!='id'} for s in reversed(old_specs())]
        assign_ids(next_specs,previous)
        self.assertEqual([s['id'] for s in next_specs],list(reversed([s['id'] for s in old_specs()])))
        catalog={'specs':[s for s in old_specs() if s['id']!='ad-04'],'retiredSpecs':[old_specs()[3]]}
        restored=[dict(platform='B站',width=640,height=400,format='GIF',logo='forbidden')]
        assign_ids(restored,catalog);self.assertEqual(restored[0]['id'],'ad-04')

    def workbook(self,d,numbers):
        main='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
        rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
        root=ET.Element(f'{{{main}}}worksheet');data=ET.SubElement(root,f'{{{main}}}sheetData')
        for r,n in enumerate(numbers,3):
            row=ET.SubElement(data,f'{{{main}}}row',r=str(r))
            for col,text in {'A':str(n),'B':'测试位','C':'100x200','D':'无','E':'JPG','F':'无logo','G':'素材名称+尺寸'}.items():
                c=ET.SubElement(row,f'{{{main}}}c',r=f'{col}{r}',t='inlineStr');si=ET.SubElement(c,f'{{{main}}}is');ET.SubElement(si,f'{{{main}}}t').text=text
        p=d/'test.xlsx'
        with zipfile.ZipFile(p,'w') as z:
            z.writestr('xl/workbook.xml',f'<workbook xmlns="{main}" xmlns:r="{rel}"><sheets><sheet name="投放资源位" sheetId="1" r:id="rId1"/></sheets></workbook>')
            z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
            z.writestr('xl/worksheets/sheet1.xml',ET.tostring(root))
        return p

    def test_item_count_is_dynamic_and_invalid_numbering_does_not_replace_the_config(self):
        with tempfile.TemporaryDirectory() as directory:
            d=Path(directory);output=d/'catalog.json'
            with contextlib.redirect_stdout(io.StringIO()):c=sync(self.workbook(d,[1,2,3]),output,d/'refs')
            self.assertEqual(len(c['specs']),3)
            before=output.read_bytes()
            with self.assertRaisesRegex(ValueError,'连续且不重复'):
                sync(self.workbook(d,[1,3,3]),output,d/'refs')
            self.assertEqual(output.read_bytes(),before)


if __name__=='__main__':unittest.main()

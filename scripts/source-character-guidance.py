"""Local saliency supplies distributed subject prompts; source RGB is untouched."""
import argparse, json, os
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
os.environ['U2NET_HOME']=str(ROOT/'local-ai/models')
from rembg import new_session, remove

def subject_points(alpha, box):
    x1,y1,x2,y2=box
    support=(alpha>12).astype(np.uint8)
    count,labels,stats,_=cv2.connectedComponentsWithStats(support,8)
    if count<=1: raise ValueError('无法识别完整人物，请调整选框')
    largest=1+int(np.argmax(stats[1:,cv2.CC_STAT_AREA]))
    support=(labels==largest).astype(np.uint8)
    ys,xs=np.where(support)
    if not len(xs): raise ValueError('人物范围为空')
    left,right,top,bottom=int(xs.min()),int(xs.max()),int(ys.min()),int(ys.max())
    points=[]
    # The top band deliberately covers headwear rather than choosing only the
    # highest-confidence face pixels. Remaining bands cover limbs and costume.
    for lo,hi in [(0,.1),(.1,.3),(.3,.55),(.55,.78),(.78,1.01)]:
        ya=top+int((bottom-top)*lo);yb=min(bottom+1,top+max(1,int((bottom-top)*hi)))
        region=support[ya:yb,left:right+1]
        if not region.size or region.sum()<8: continue
        score=cv2.distanceTransform(region,cv2.DIST_L2,5)
        # Avoid selecting low-confidence grass/blur when a solid subject exists
        # in this same band, but retain its topmost ornament as its own prompt.
        confidence=alpha[ya:yb,left:right+1].astype(np.float32)/255
        score*=.5+confidence
        y,x=np.unravel_index(np.argmax(score),score.shape)
        if score[y,x]>0: points.append([int(x+left),int(y+ya)])
    return points

def top_accessory_points(rgb,alpha,box):
    """Recover thin props entering the image edge and joining the subject.

    A swing rope is often not salient, but its two long edges can be followed
    from the top boundary to the character. Detached scenery lines are rejected.
    """
    h,w=alpha.shape;x1,y1,x2,y2=box
    if y1>0: return [],[]
    edges=cv2.Canny(cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY),70,150)
    edges[:,:x1]=0;edges[:,x2:]=0;edges[y2:]=0
    lines=cv2.HoughLinesP(edges,1,np.pi/180,threshold=40,minLineLength=max(60,int(h*.2)),maxLineGap=15)
    if lines is None: return [],[]
    contact=cv2.dilate((alpha>50).astype(np.uint8),np.ones((13,13),np.uint8))
    candidates=[]
    for line in lines[:,0]:
        xa,ya,xb,yb=map(float,line)
        if ya>yb:xa,xb,ya,yb=xb,xa,yb,ya
        if ya>h*.08 or yb-ya<max(60,h*.2) or abs(xb-xa)*2>yb-ya:continue
        slope=(xb-xa)/(yb-ya);intercept=xa-slope*ya
        if not x1+3<intercept<x2-3:continue
        joined=None
        for y in range(round(h*.12),min(y2,round(h*.7)),5):
            x=round(intercept+slope*y)
            if 0<=x<w and contact[y,x]: joined=y;break
        if joined is not None:candidates.append((intercept,slope,joined,yb-ya))
    groups=[]
    for c in sorted(candidates,key=lambda c:-c[3]):
        group=next((g for g in groups if abs(g[0][0]-c[0])<14 and abs(g[0][1]-c[1])<.08),None)
        if group is None:groups.append([c])
        else:group.append(c)
    points=[];paths=[]
    for group in [g for g in groups if len(g)>=2][:2]:
        # Paired edges determine the center of the narrow prop, not a pixel in
        # the sky just outside it. A lone edge is not enough evidence.
        if len(group)<2:continue
        intercept=float(np.median([c[0] for c in group]));slope=float(np.median([c[1] for c in group]));joined=min(c[2] for c in group)
        end=min(y2-1,joined+round(h*.08));paths.append({'from':[round(intercept),0],'to':[round(intercept+slope*end),end],'radius':max(12,round(w*.018))})
        for y in [max(6,round(h*.035)),max(12,round(joined*.65))]:
            x=round(intercept+slope*y)
            if x1<=x<x2 and y<y2:points.append([x,y])
    return points,paths

def main():
    parser=argparse.ArgumentParser()
    for key in ('input','prompts','output'): parser.add_argument('--'+key,type=Path,required=True)
    args=parser.parse_args();source=Image.open(args.input).convert('RGBA')
    objects=json.loads(args.prompts.read_text(encoding='utf-8-sig'))['objects']
    if not (ROOT/'local-ai/models/u2net.onnx').is_file(): raise ValueError('本地人物识别模型未就绪')
    session=new_session('u2net',providers=['CPUExecutionProvider'])
    for i,obj in enumerate(objects):
        box=obj['box'];crop=source.crop(box);result=remove(crop,session=session)
        alpha=np.zeros((source.height,source.width),np.uint8)
        alpha[box[1]:box[3],box[0]:box[2]]=np.asarray(result.getchannel('A'))
        body=subject_points(alpha,box)
        accessory,paths=top_accessory_points(np.asarray(source)[:,:,:3],alpha,box)
        explicit=obj.get('points',[]);labels=obj.get('labels',[])
        # Negative designer hints take precedence over automatic foreground seeds.
        allowed=lambda p:not any(label==0 and np.hypot(p[0]-q[0],p[1]-q[1])<max(12,source.width*.02) for q,label in zip(explicit,labels))
        body=[p for p in body if allowed(p)];auto=body+[p for p in accessory if allowed(p)]
        obj['bodyPoints']=explicit+body;obj['bodyLabels']=labels+[1]*len(body);obj['accessoryPaths']=paths
        obj['points']=explicit+auto;obj['labels']=labels+[1]*len(auto)
        obj['autoPoints']=auto
    args.output.write_text(json.dumps({'objects':objects}),encoding='utf-8')
    print(json.dumps({'objects':len(objects),'autoPoints':[o['autoPoints'] for o in objects]}),flush=True)
if __name__=='__main__': main()

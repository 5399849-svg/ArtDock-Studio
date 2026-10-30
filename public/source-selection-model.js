// A box means the complete subject. Only explicit clicks are point prompts.
export function normalizeSourceSelection(value){
 const box=value?.box,points=value?.points??[];
 if(!Array.isArray(box)||box.length!==4||box.some(n=>!Number.isFinite(n)||n<0||n>1)||box[2]-box[0]<.02||box[3]-box[1]<.02)throw Error('请框选要提取的完整角色');
 if(!Array.isArray(points)||points.length>12||points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||![0,1].includes(p.label)||p.x<box[0]||p.x>box[2]||p.y<box[1]||p.y>box[3]))throw Error('提示点须位于角色选框内，最多 12 个');
 const explicit=points.map(p=>({x:p.x,y:p.y,label:p.label}));
 // Older UI silently inserted the first point at the box center. It often
 // selected clothing alone, leaving headwear/props behind in the background.
 if(value.pointMode!=='manual'&&explicit[0]?.label===1&&Math.abs(explicit[0].x-(box[0]+box[2])/2)<1e-6&&Math.abs(explicit[0].y-(box[1]+box[3])/2)<1e-6)explicit.shift();
 return {box:[...box],points:explicit,pointMode:'manual'};
}
export function sourceSelectionContext(selection){
 const [x1,y1,x2,y2]=selection.box,dx=(x2-x1)*.12,dy=(y2-y1)*.12;
 const nearEdge=(n)=>n<.025?0:n>.975?1:n;
 return {...selection,box:[nearEdge(Math.max(0,x1-dx)),nearEdge(Math.max(0,y1-dy)),nearEdge(Math.min(1,x2+dx)),nearEdge(Math.min(1,y2+dy))]};
}

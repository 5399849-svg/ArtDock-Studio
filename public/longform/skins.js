export const SKINS=[
 {id:'pop',name:'爪爪波普',description:'源稿卡片边框 · 紫蓝背景 · 黄底问答',primary:'#6b74e9',accent:'#ffcd55',paper:'#fffde9',ink:'#31344d',question:'#b83548',answer:'#3d3853',answerPaper:'#ffe185',answerBorder:'#8560af',heading:'#fff2ab',shape:'ribbon'},
 {id:'festival',name:'爪爪赛季创作',description:'源稿粉色框体 · 明黄背景 · 蓝色标题',primary:'#efb548',accent:'#ff39a1',paper:'#ffffee',ink:'#333849',question:'#b52c76',answer:'#35447b',answerPaper:'#fff2ba',answerBorder:'#3984d5',heading:'#fff3a4',shape:'ribbon'},
 {id:'original',name:'原方案皮肤',description:'恢复当前方案的原始配色与装饰'},
 {id:'jade',name:'翡翠鎏金',description:'墨绿背景 · 金线边框 · 暖白对话',primary:'#184b43',accent:'#d7b76c',paper:'#fff9e9',ink:'#28483f',question:'#876323',answer:'#236555',answerPaper:'#edf7ef',answerBorder:'#83b4a4',heading:'#fff0b9',shape:'ornate'},
 {id:'crimson',name:'赤焰荣耀',description:'绛红背景 · 金色徽章 · 庆典装饰',primary:'#782e39',accent:'#e3b55e',paper:'#fff5e7',ink:'#55333b',question:'#8c5426',answer:'#7d3d50',answerPaper:'#fff0f1',answerBorder:'#d99bac',heading:'#fff0b4',shape:'ribbon'},
 {id:'moon',name:'月夜银辉',description:'深蓝背景 · 银色线框 · 星光装饰',primary:'#253654',accent:'#b5cdec',paper:'#f4f7ff',ink:'#334565',question:'#40547b',answer:'#4a5682',answerPaper:'#eef0ff',answerBorder:'#a3afd8',heading:'#f2f6ff',shape:'star'},
];
export const skinFor=id=>SKINS.find(s=>s.id===id);
export function applySkin(v,id,theme){const skin=skinFor(id);if(!skin)throw new Error('皮肤不存在');if(v.locked)throw new Error('请先解锁方案');Object.assign(v,{skinId:id,primary:skin.primary||theme.primary,accent:skin.accent||theme.accent});}
// Artwork stays a separate image layer; no text or game artwork is baked into it.
export function headingArtwork(id){const s=skinFor(id);if(!s?.primary)return '/reference/heading.png';
 const motif=s.shape==='star'?'<path d="M350 4l5 14 15 4-15 5-5 14-5-14-15-5 15-4z"/>':s.shape==='ribbon'?'<path d="M330 12l20-10 20 10-20 30z"/><path d="M324 20l-22 12 22 1m52-13 22 12-22 1"/>':'<path d="M330 10l20 27 20-27-6 31h-28z"/><path d="M320 25l-18 9 18 9m60-18 18 9-18 9"/>';
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="118" viewBox="0 0 700 118"><g fill="${s.accent}" stroke="${s.accent}" stroke-width="2">${motif}</g><path d="M20 50H680L697 83 680 116H20L3 83Z" fill="${s.primary}" stroke="${s.accent}" stroke-width="3"/><path d="M25 56H675L690 83 675 110H25L10 83Z" fill="none" stroke="${s.accent}" stroke-opacity=".5"/><path d="M34 77l6 6-6 6-6-6zm632 0 6 6-6 6-6-6z" fill="${s.accent}"/></svg>`;
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}

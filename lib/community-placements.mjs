// The platform/community sheet is placement data. Brand Logo and IP copyright
// are independent requirements; in particular, rows 8 and 9 forbid the former
// while still requiring the latter for IP projects.
export const communityPlacements = [
  ['official-cover','公众号','推文封面',900,383,1,true,true],
  ['community-carousel','社区','轮播图/活动tab',984,334,1,true,true],
  ['community-one','社区','1图',977,272,1,true,true],
  ['community-two','社区','2图',984,562,1,true,true],
  ['community-three','社区','3图',215,300,1,false,false],
  ['community-four','社区','4图',336,216,1,false,false],
  ['community-five','社区','5图',120,120,1,false,false],
  ['community-hero-library','社区','游戏内英雄宝库',567,175,1,false,true],
  ['community-hero-mini','社区','英雄宝库小程序',720,271,1,false,true],
  ['community-post-ad','社区','帖子文字广告',600,167,1,true,true],
  ['community-popup','社区','弹窗',500,650,1,true,true],
  ['wechat-mini-cover','微信小程序','卡片封面',500,400,10,true,true],
  ['alipay-cover','支付宝','封面',670,376,1,true,true],
  ['xiaohongshu-cover','小红书','封面',900,1200,1,true,true],
].map(([slug,group,name,width,height,maxMiB,brandLogo,ipCopyright],index)=>({
  id:`community-${slug}`,order:index+1,group,name,width,height,maxBytes:maxMiB*1048576,
  format:'PNG',brandLogo,ipCopyright,
}));

function layoutFor(placement){
  const ratio=placement.width/placement.height;
  if(ratio<1){
    return {title:[.06,.15,.88,.23],subtitle:[.07,.38,.86,.065],character:[.06,.43,.88,.51],foreground:[0,.83,1,.17],logo:[.06,.03,.27,.11],copyright:[.66,.94,.28,.035]};
  }
  if(ratio<1.6){
    return {title:[.04,.18,.54,.37],subtitle:[.055,.58,.49,.105],character:[.52,.06,.45,.9],foreground:[0,.82,1,.18],logo:[.035,.025,.2,.14],copyright:[.76,.92,.2,.05]};
  }
  return {title:[.045,.15,.53,.43],subtitle:[.055,.58,.49,.20],character:[.56,.02,.42,.94],foreground:[0,.79,1,.21],logo:[.03,.025,.16,.16],copyright:[.76,.91,.21,.06]};
}

export function communityTemplate(placement){
  return {
    id:placement.id,categoryId:placement.group==='公众号'?'official-media':'community',
    businessLineId:'platform-community',segmentId:placement.group==='公众号'?'official-media':'community',
    family:placement.group,name:`${placement.group} · ${placement.name}`,
    width:placement.width,height:placement.height,format:placement.format,maxBytes:placement.maxBytes,
    fit:'recompose',transparent:false,textMax:0,automationReady:true,renderMode:'layered-community',
    requiresPsd:false,communityPlacement:true,brandLogo:placement.brandLogo,ipCopyright:placement.ipCopyright,
    communityLayout:layoutFor(placement),safeArea:{left:.04,top:.04,right:.04,bottom:.04},
    specification:{rules:[
      `精确导出 ${placement.width}×${placement.height} PNG，文件不超过 ${placement.maxBytes/1048576}MB`,
      placement.brandLogo?'需要独立游戏品牌 Logo':'禁止游戏品牌 Logo',
      placement.ipCopyright?'IP 项目需要独立版权标识':'无 IP 版权标识',
      '从同一母稿重新排列人物、标题和装饰；不得直接强裁重要信息',
    ]},
  };
}

export function communityResourceRule(placement){
  return {
    templateId:placement.id,status:'verified',deliveryAllowed:true,
    technicalSource:{file:'平台社区资源位尺寸表（用户更新版）',version:'2026-09-29'},
    technical:{width:placement.width,height:placement.height,format:'PNG',maxBytes:placement.maxBytes},
    brandLogo:placement.brandLogo,ipCopyright:placement.ipCopyright,
    verifiedVisualRules:[
      placement.brandLogo?'需要游戏品牌 Logo':'无游戏品牌 Logo',
      placement.ipCopyright?'IP 项目需要独立版权标识；默认 ©YUEWEN，可按项目替换':'无 IP 版权标识',
      '母稿在工作台完成后按目标尺寸重新排列元素，保护文字与人物',
    ],
  };
}

export const sampleSevenPlacementIds=[
  'community-community-two','community-wechat-mini-cover','community-community-hero-library',
  'community-community-hero-mini','community-official-cover','community-community-post-ad',
  'community-community-popup',
];

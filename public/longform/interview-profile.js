// Opt-in presentation for the approved blue/gold interview, with source copy intact.
export const interviewProfile=v=>v.id==='a'&&v.designProfile==='interview-editorial';
export function splitInterviewHeading(text){const match=String(text||'').match(/^([^：:]+)[：:]([\s\S]+)$/);return match?{heading:match[1].trim(),tagline:match[2].trim()}:{heading:String(text||''),tagline:''};}
export function interviewLayerText(p,v,id){if(!interviewProfile(v))return undefined;
 const hero=splitInterviewHeading(p.document.title);
 if(id==='hero.edition')return hero.tagline?hero.heading:'';
 if(id==='hero.title')return hero.tagline||hero.heading;
 const b=p.document.blocks.find(b=>id==='text:'+b.id||id==='kicker:'+b.id);
 if(b?.kind==='part'){const parts=splitInterviewHeading(v.overrides?.[b.id]?.text??b.text);return id.startsWith('kicker:')?parts.tagline:parts.heading;}
 return undefined;
}

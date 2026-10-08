import { sanitize } from '../sanitize';
import type { NormalizedExperiment } from '../model';
import { parseSnapshot } from './protocol';

/** Bound detail independently; never let raw snippet data consume the snapshot envelope. */
export function serializeSnapshot(input: {url:string;capturedAt:number;page:{title:string;referrer:string;readyState:string};platforms:unknown[];experiments:NormalizedExperiment[]}) {
  const envelope = {
    url: String(sanitize(input.url)).slice(0,20000), capturedAt: input.capturedAt,
    page: {title:String(sanitize(input.page.title)).slice(0,20000),referrer:String(sanitize(input.page.referrer)).slice(0,20000),readyState:input.page.readyState},
    platforms: sanitize(input.platforms,100000,16) as unknown[], experiments: [] as unknown[]
  };
  const activities=input.experiments.slice(0,1000);
  const allowance=Math.floor(2_400_000/Math.max(1,activities.length));
  let used=JSON.stringify(envelope).length;
  for(const activity of activities){
    const {raw,changes,variations,...metadata}=activity;
    const summary={...metadata,variations:variations.map(({changes,raw,...variation})=>variation)};
    const clean= sanitize(summary,Math.max(64000,allowance),16) as any;
    // Keep only structurally complete records. Optional details never replace summaries.
    if(parseSnapshot({...envelope,experiments:[clean]})?.experiments.length!==1)continue;
    const baseSize=JSON.stringify(clean).length;
    let remaining=Math.max(0,allowance-baseSize);
    const attach=(owner:any,key:string,value:unknown,budget:number)=>{
      if(value===undefined||budget<256)return;
      const detail=sanitize(value,budget,16);const size=JSON.stringify(detail)?.length||0;
      if(size<=remaining){owner[key]=detail;remaining-=size;}
    };
    const groups=1+variations.filter(v=>v.changes?.length).length;
    const perChanges=Math.floor(remaining*.7/groups);
    attach(clean,'changes',changes,perChanges);
    variations.forEach((v,i)=>{if(clean.variations[i])attach(clean.variations[i],'changes',v.changes,perChanges);});
    // If a bounded array contains a truncation marker, expose it as raw detail,
    // not as a malformed normalized change that would invalidate the activity.
    if(parseSnapshot({...envelope,experiments:[clean]})?.experiments.length!==1){
      delete clean.changes;for(const v of clean.variations)delete v.changes;
      clean.detailLimit='Change details exceeded the capture limit.';
    }
    attach(clean,'raw',raw,remaining);
    const size=JSON.stringify(clean).length;
    if(used+size>3_500_000)break;used+=size;
    envelope.experiments.push(clean);
  }
  return envelope;
}

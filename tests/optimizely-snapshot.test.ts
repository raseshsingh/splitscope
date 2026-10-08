import {sanitize} from '../src/core/sanitize';
import test from 'node:test';
import assert from 'node:assert/strict';
import {serializeSnapshot} from '../src/core/bridge/snapshot';
import {parseSnapshot,parseBridgeMessage} from '../src/core/bridge/protocol';
import {normalizedExperiment} from '../src/core/hooks/runtime';
import {optimizelyAdapter} from '../src/adapters/optimizely';

test('Large project snapshots keep the page envelope and every activity assignment',()=>{
 const activities=Array.from({length:75},(_,i)=>normalizedExperiment({platform:'optimizely',id:String(i),name:'Experiment '+i,kind:'ab',status:'running-in',assignedVariationId:'2',variations:[{id:'1',name:'Original'},{id:'2',name:'New',changes:[{type:'js',code:'x'.repeat(90000)}]}],raw:{data:'x'.repeat(100000),more:'y'.repeat(100000)}}));
 const input={url:'https://example.test',capturedAt:1,platforms:[],experiments:activities,page:{title:'Page',referrer:'',readyState:'complete'}};
 assert.equal(parseSnapshot(sanitize(input,2_000_000,16)),null,'Old whole-payload sanitizer loses the trailing page field');
 const payload=serializeSnapshot(input);const parsed=parseSnapshot(payload)!;
 assert.ok(parsed);assert.equal(parsed.page.title,'Page');assert.equal(parsed.experiments.length,75);assert.equal(parsed.omitted,0);assert.ok(parsed.experiments.every(a=>a.assignedVariationId==='2'));
 assert.ok(parseBridgeMessage({namespace:'__splitscope__',nonce:'test',type:'snapshot',payload}));
 activities[0].assignedVariationId='1';assert.equal(parseSnapshot(serializeSnapshot(input))?.experiments[0].assignedVariationId,'1');
});
function setup(){
 let current='2';
 const data={experiments:{'10':{id:'10',type:'ab',variations:[{id:'1',name:'Original'},{id:'2',name:'New'}]}},projectId:'100'};
 const state={getActiveExperimentIds:()=>['10'],getExperimentStates:()=>({'10':{isActive:true,variation:{id:current}}}),getVariationMap:()=>({'10':{id:'1'}})};
 Object.assign(globalThis,{window:{optimizely:{get:(name:string)=>name==='data'?data:state}},location:{href:'https://example.test/'}});
 return {set:(value:string)=>current=value,state,data};
}
test('Optimizely current runtime decision wins over historical assignments and updates on later scans',()=>{
 const fixture=setup();assert.equal(optimizelyAdapter.listExperiments()[0].assignedVariationId,'2');fixture.set('1');assert.equal(optimizelyAdapter.listExperiments()[0].assignedVariationId,'1');
});
test('Optimizely preview replaces duplicate and legacy overrides while retaining other activity overrides',()=>{
 setup();const plan=optimizelyAdapter.force!('10','2','https://example.test/?optimizely_x=1&optimizely_x=99&optimizely_x10=0') as any;
 const url=new URL(plan.url);assert.deepEqual(url.searchParams.getAll('optimizely_x'),['99,2']);assert.equal(url.searchParams.has('optimizely_x10'),false);
 assert.equal(optimizelyAdapter.listExperiments()[0].assignedVariationId,'2');
});
test('Known disabled Optimizely forcing fails clearly; unknown settings never promise untracked traffic',()=>{
 const fixture=setup();
 assert.equal((optimizelyAdapter.force!('10','2','https://example.test/') as any).tracking,'unknown');
 (fixture.data as any).enableForceParameters=false;
 assert.throws(()=>optimizelyAdapter.force!('10','2','https://example.test/'),/disables force variation parameters/);
});

test('Personalization uses the active campaign variation ahead of stored variation map',()=>{
 const fixture=setup();(fixture.state as any).getExperimentStates=()=>({});(fixture.state as any).getCampaignStates=()=>({'20':{isActive:true,experiment:{id:'10'},variation:{id:'2'}}});
 assert.equal(optimizelyAdapter.listExperiments()[0].assignedVariationId,'2');
});

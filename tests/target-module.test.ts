import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyTarget,normalizeWire,targetPropositions} from '../src/core/adobe-target/wire';
import {readTargetActivities} from '../src/adapters/adobe-target';
test('Target classifier supports CNAME without treating general Adobe libraries as Target',()=>{
 assert.equal(classifyTarget('https://target.example.com/rest/v1/delivery?client=foo'),'atjs2');
 assert.equal(classifyTarget('https://target.example.com/m2/foo/mbox/json?mbox=x'),'atjs1');
 assert.equal(classifyTarget('https://assets.adobetarget.com/foo/production/rules.json'),'ode');
 for(const url of ['https://example.com/at.js','https://assets.adobedtm.com/launch-x.js','https://example.com/rest/v1/delivery']) assert.equal(classifyTarget(url),undefined);
});
test('Wire normalization separates TGT from AJO and retains prefetch location evidence',()=>{
 const response={handle:[{type:'personalization:decisions',payload:[{scope:'__view__',scopeDetails:{decisionProvider:'TGT',activity:{id:'1'}}},{scope:'web://example',scopeDetails:{decisionProvider:'AJO'}}]}]};
 assert.equal(targetPropositions(response).length,1);
 const r=normalizeWire({url:'https://edge.example.com/ee/v1/interact?configId=abc',page:'https://example.com',at:1,duration:20,status:200,response});
 assert.equal(r?.target,true);assert.equal(r?.ajoCount,1);
 assert.equal(normalizeWire({url:'https://edge.example.com/ee/v1/interact?configId=abc',page:'x',at:1,duration:20,status:200,response:{handle:[]}})?.target,false);
 Object.assign(globalThis,{location:{href:'https://example.com'}});
 assert.equal(readTargetActivities({scopeDetails:{decisionProvider:'AJO'},responseTokens:{'activity.id':'123'}}).length,0);
 assert.equal(readTargetActivities({responseTokens:{'campaign.id':'123','experience.id':'1'}},'delivered')[0].id,'123');
});
import {targetFindings} from '../src/core/adobe-target/findings';
test('Target findings distinguish HTTP failure and unknown network failure from proven blocking',()=>{
 const base={url:'https://target.example.com/rest/v1/delivery?client=foo',page:'https://example.com',at:1,duration:20,status:200};
 assert.ok(!targetFindings([normalizeWire(base)!]).some(f=>f.id==='T01'));
 const failed=normalizeWire({...base,status:0})!;
 assert.ok(targetFindings([failed]).some(f=>f.id==='T01'));
 assert.ok(!targetFindings([failed]).some(f=>f.id==='T05'));
 assert.ok(targetFindings([{...failed,error:'ERR_BLOCKED_BY_CLIENT'}]).some(f=>f.id==='T05'));
});

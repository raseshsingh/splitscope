import {walk} from './wire';
export function privacySignals(request:unknown,response:unknown) {
 const result:Array<{path:string;kind:string}>=[];
 const luhn=(digits:string)=>{let sum=0;for(let i=digits.length-1,j=0;i>=0;i--,j++){let n=Number(digits[i]);if(j%2){n*=2;if(n>9)n-=9;}sum+=n;}return sum%10===0&&!/^0+$/.test(digits);};
 const inspect=(value:unknown,path:string)=>{
 if(typeof value!=='string'||result.length>=30)return;
 const text=value.slice(0,100000);
 if(/[\w.+-]{1,64}@[\w.-]{1,253}\.[a-z]{2,63}/i.test(text))result.push({path,kind:'email-like value'});
 if(/\+\d[\d ().-]{8,22}\d/.test(text))result.push({path,kind:'phone-like value'});
 for(const m of text.matchAll(/\b(?:\d[ -]?){12,18}\d\b/g)){const digits=m[0].replace(/\D/g,'');if(luhn(digits)){result.push({path,kind:'card-like value (Luhn match)'});break;}}
 };
 walk(request,(node,path)=>{if(!/parameters|profileParameters/i.test(path))return;for(const [key,value] of Object.entries(node))inspect(value,path+'.'+key);});
 walk(response,(node,path)=>{if(typeof node.content==='string')inspect(node.content,path+'.content');});
 return result;
}

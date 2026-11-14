#!/usr/bin/env node
/* Cell Bench checks: runs the CELLBENCH-LOGIC block of index.html in Node and checks every
   electrode pair, explanation family and apply type against calculations written here.
   Usage: node tools/check-cellbench.js */
const fs=require('fs'),vm=require('vm'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const line=name=>{const m=new RegExp('(?:const|let) '+name+'\\s*=[^\\n]*').exec(src);if(!m)throw new Error('missing '+name);return m[0]};
const fn=name=>{const i=src.indexOf('function '+name+'(');if(i<0)throw new Error('missing '+name);return src.slice(i,src.indexOf('}',i)+1)};
const a=src.indexOf('/*CELLBENCH-LOGIC-START'),b=src.indexOf('/*CELLBENCH-LOGIC-END*/');
const ctx={Math,Number,String,Object,Array,JSON,console};vm.createContext(ctx);
vm.runInContext([line('CELL_COUPLES'),line('supN'),line('cIon'),line('cellLcm'),line('r2'),fn('sigTol')].join('\n')+'\n'+src.slice(a,b)+'\nthis.cellBenchSpec=cellBenchSpec;this.cbReading=cbReading;this.CELL_COUPLES=CELL_COUPLES;',ctx);
/* independent standard reduction potentials (V, 25 °C; OpenStax Chemistry 2e Appendix L, rounded to 2 decimals) */
const REF={Au:[3,1.50],Ag:[1,0.80],Cu:[2,0.34],Pb:[2,-0.13],Sn:[2,-0.14],Ni:[2,-0.26],Fe:[2,-0.45],Cr:[3,-0.74],Zn:[2,-0.76],Al:[3,-1.66],Mg:[2,-2.37]};
let fails=0,checks=0;const ok=(c,m)=>{checks++;if(!c){fails++;if(fails<30)console.log('FAIL',m)}};
const gcd=(x,y)=>y?gcd(y,x%y):x,lcm=(x,y)=>x*y/gcd(x,y);
for(const c of ctx.CELL_COUPLES){ok(REF[c[0]]&&REF[c[0]][0]===c[1]&&Math.abs(REF[c[0]][1]-c[2])<0.011,'table value for '+c[0]+' disagrees with reference');}
let cases=0;
for(const x of ctx.CELL_COUPLES)for(const y of ctx.CELL_COUPLES){if(x===y||Math.abs(x[2]-y[2])<.3)continue;const an=x[2]<y[2]?x:y,ca=x[2]<y[2]?y:x;
 for(const fam of ['bridge','mass','coef'])for(const apply of ['newpair','dg'])for(const leftIsAnode of [true,false])for(const redOnCath of [true,false]){
  const s=ctx.cellBenchSpec(an,ca,{fam,apply,leftIsAnode,redOnCath});cases++;const tag=an[0]+'|'+ca[0]+' '+fam+' '+apply;
  const E=Math.round((REF[ca[0]][1]-REF[an[0]][1])*100)/100,n=lcm(REF[an[0]][0],REF[ca[0]][0]);
  ok(s.an===an&&s.ca===ca&&s.E>0&&Math.abs(s.E-E)<1e-9,tag+': E°cell '+s.E+' vs '+E);
  ok(s.n===n,tag+': n');
  ok((s.n/an[1])*an[1]===(s.n/ca[1])*ca[1],tag+': electrons lost ≠ gained');
  /* balanced net reaction: charge on each side equal */
  const left=(s.n/ca[1])*ca[1],right=(s.n/an[1])*an[1];ok(left===right,tag+': rxn charge');
  ok(s.predict.answer===an[0]&&s.predict.options.length===2&&s.predict.options.some(o=>o.key===ca[0]),tag+': predict');
  ok(ctx.cbReading(s,true)===s.E&&ctx.cbReading(s,false)===-s.E,tag+': voltmeter sign rule');
  ok((s.anodeLeft?s.left:s.right)===an,tag+': beaker placement');
  ok(s.explain.options.some(o=>o.key===s.explain.answer)&&s.explain.options.filter(o=>o.key!==s.explain.answer).every(o=>s.explain.why[o.key]),tag+': explain feedback');
  const ap=s.apply;
  if(ap.kind==='newpair'){const c2=ap.c2;ok(c2!==an&&c2!==ca&&REF[c2[0]][1]-REF[an[0]][1]>=.3,tag+': new cathode not valid');
   ok(Math.abs(ap.answer-Math.round((REF[c2[0]][1]-REF[an[0]][1])*100)/100)<1e-9,tag+': new-pair answer');}
  else{const want=Number((-n*96.485*E).toPrecision(3));ok(Math.abs(ap.answer-want)<1e-9&&ap.answer<0,tag+': ΔG° '+ap.answer+' vs '+want);}
  for(const t of ap.traps)ok(Math.abs(t.v-ap.answer)>Math.max(ap.tol*2,Math.abs(ap.answer)*.02),tag+': trap too close to the answer: '+t.msg);
  const txt=(ap.prompt+s.rxn+s.predict.ask).replace(/<[^>]+>/g,'');ok(!/NaN|undefined|Infinity|\de[+-]\d/.test(txt),tag+': junk in text: '+txt);
 }}
console.log(checks+' checks on '+cases+' bench setups: '+(fails?fails+' FAILED':'all passed'));process.exit(fails?1:0);

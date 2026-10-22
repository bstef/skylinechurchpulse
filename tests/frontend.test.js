import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const client=readFileSync(new URL('../assets/data-client.js',import.meta.url),'utf8');
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
test('manual Sunday entries appear on their matching plans without duplicate calendar reminders', async()=>{
 const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
 const dom=new JSDOM(html,{url:'https://preview.test',runScripts:'outside-only',virtualConsole:vc});
 const w=dom.window;w.matchMedia=()=>({matches:false});w.Chart=class {static defaults={};destroy(){}};
 const records=[
  {id:'manual-early',service_date:'2026-10-18',service_type:'9:30 AM',pco_plan_id:null},
  {id:'manual-late',service_date:'2026-10-18',service_type:'11:00 AM',pco_plan_id:null},
  {id:'different-date',service_date:'2026-10-11',service_type:'9:30 AM',pco_plan_id:null},
  {id:'different-plan',service_date:'2026-10-18',service_type:'9:30 AM',pco_plan_id:'other-plan'},
 ];
 const early={id:'early',plan_id:'oct18',sort_date:'2026-10-18T09:30:00',plan_time_name:'9:30 AM',service_type_name:'Sunday Services',title:'Sunday'};
 const late={...early,id:'late',plan_time_name:'11:00 AM'};
 const plans=[early,late];
 for(const record of records)Object.assign(record,{attendance:75,unity:4,engagement:4,loudness_db:90});
 w.fetch=async path=>{
  if(path==='/api/status')return Response.json({preview:true,emailEnabled:false});
  if(String(path).startsWith('/api/data/'))return Response.json({data:String(path).includes('service_entries')?records:[],nextOffset:null});
  if(String(path).startsWith('/api/pco-plans'))return Response.json({plans});
  return Response.json({error:'Not configured'},{status:503});
 };
 try {
  w.eval(client);w.eval(inline);
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.deepEqual(Array.from(w.entriesForPlan(early),e=>e.id),['manual-early']);
  assert.deepEqual(Array.from(w.entriesForPlan(late),e=>e.id),['manual-late']);
  assert.equal(w.entriesForPlan({...early,plan_time_name:'',service_type_name:'Unknown service'}).length,0);
  w.document.getElementById('tab-pco').click();
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(w.document.querySelectorAll('.pco-view-btn').length,2);
  assert.equal(w.document.querySelectorAll('.pco-log-btn').length,0);
  assert.equal(w.getCalendarEvents().filter(e=>e.kind==='pco').length,0);
  w.document.querySelector('.pco-view-btn').click();
  assert.match(w.document.getElementById('modal-slot').textContent,/Oct 18, 2026/);
  assert.deepEqual(errors,[]);
 } finally {w.close();}
});
test('frontend loads D1 data, renders ledger/exports, and blocks preview email',async()=>{
 const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
 const dom=new JSDOM(html,{url:'https://preview.test',runScripts:'outside-only',virtualConsole:vc});
 const w=dom.window;w.matchMedia=()=>({matches:false});w.Chart=class {static defaults={};destroy(){}};w.confirm=()=>true;
 const date=new Date().toISOString().slice(0,10);
 const record={id:'10000000-0000-4000-8000-000000000001',service_date:date,service_type:'9:30 AM',attendance:123,unity:4,engagement:4,loudness_db:90,sound_clarity:true,spiritual_response:5,transition_clarity:3,lighting_fit:true,talking_fit:true,announcements_fit:true,sermon_fit:true,intro_welcoming:3,notes:'Synthetic worship note',logged_by:'Test logger',created_at:new Date().toISOString()};
 const calls=[];
 w.fetch=async(path,options={})=>{
  calls.push(String(path));
  if(path==='/api/status')return Response.json({preview:true,emailEnabled:false,planningCenterConfigured:false});
  if(String(path).startsWith('/api/data/')){
   const table=String(path).split('/')[3].split('?')[0];
   return Response.json({data:table==='service_entries'?[record]:table==='email_recipients'?[{id:'recipient',email:'test@example.com',created_at:new Date().toISOString()}]:[],nextOffset:null});
  }
  if(String(path).startsWith('/api/pco-'))return Response.json({error:'Planning Center is not configured in this preview.'},{status:503});
  throw new Error('Unexpected request: '+path);
 };
 try {
  w.eval(client);w.eval(inline);
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.match(w.document.getElementById('environment-slot').textContent,/Migration preview/);
  w.document.getElementById('tab-calendar').click();
  assert.match(w.document.getElementById('content').textContent,/123/);
  w.document.getElementById('page-analytics').click();
  assert.match(w.document.getElementById('content').textContent,/Attendance|attendance/);
  w.document.getElementById('page-exports').click();
  assert.match(w.document.getElementById('content').textContent,/test@example.com/);
  w.document.getElementById('email-services-report').click();
  assert.match(w.document.getElementById('error-slot').textContent,/disabled/);
  assert.equal(calls.includes('/api/send-report-email'),false);
  w.document.getElementById('open-form-btn').click();
  assert.ok(w.document.getElementById('f-date'));
  assert.deepEqual(errors,[]);
 } finally {dom.window.close();}
});

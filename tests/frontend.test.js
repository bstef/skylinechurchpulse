import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const client=readFileSync(new URL('../assets/data-client.js',import.meta.url),'utf8');
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
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

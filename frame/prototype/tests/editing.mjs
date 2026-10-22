import { chromium } from 'playwright'; import http from 'http'; import fs from 'fs'; import path from 'path';
// Usage: node prototype/tests/editing.mjs prototype   (needs playwright + Chromium)
const root=process.argv[2];
const srv=http.createServer((q,r)=>{let p=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.end(d);});}).listen(8830);
const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--headless=new']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,acceptDownloads:true});
const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>{errs.push('DIALOG '+d.message());d.dismiss();});
const ok=(n,c,d='')=>console.log(`${c?'PASS':'FAIL'}  ${n}${c?'':'  -> '+d}`);
const tabs=async()=>{for(const t of ['Calendar','Discover','My Watchlist','Friends','Profile']){await pg.click(`#nav button[aria-label="${t}"]`);await pg.waitForTimeout(60);}};
await pg.goto('http://127.0.0.1:8830/');
// add a tricky movie through the real form
await pg.click('#nav button[aria-label="Discover"]'); await pg.click('text=＋ Add a movie or show');
const tricky=`Ocean's <b>Eleven</b> & "Co"`;
await pg.fill('#f-title',tricky); await pg.fill('#f-service','Max'); await pg.screenshot({path:'edit-form.png'});
await pg.click('button:has-text("Add title")'); await pg.waitForTimeout(150);
const id=await pg.evaluate(()=>state.titles.at(-1).id);
ok('custom title saved', await pg.evaluate(()=>state.titles.at(-1).title)===tricky);
ok('tricky title shows as literal text, no HTML injected', await pg.evaluate(t=>document.querySelector('#modal h1').textContent===t && !document.querySelector('#modal h1 b'),tricky));
// rank it via the comparison flow, winning everything
await pg.evaluate(id=>{rank(id);beginCompare(id,'Great');while(compareState.lo<compareState.hi)vote(true);},id);
await pg.reload(); await pg.waitForTimeout(100);
const r=await pg.evaluate(id=>state.ranks.find(r=>r.id===id),id);
ok('new ranking survives reload', r && r.reaction==='Great', JSON.stringify(r));
await pg.evaluate(()=>go('Profile')); ok('ranking listed in Profile', await pg.evaluate(t=>document.querySelector('#content').textContent.includes(t),tricky));
// edit name
await pg.evaluate(id=>titleForm(id),id); await pg.fill('#f-title','Ocean’s Eleven'); await pg.click('button:has-text("Save changes")');
await pg.reload(); ok('edit survives reload', await pg.evaluate(id=>state.titles.find(t=>t.id===id).title,id)==='Ocean’s Eleven');
// show + progress
await pg.evaluate(()=>titleForm()); await pg.fill('#f-title','Shogun'); await pg.selectOption('#f-type','Show'); await pg.fill('#f-eps','5'); await pg.click('button:has-text("Add title")');
const sid=await pg.evaluate(()=>state.titles.at(-1).id);
await pg.evaluate(sid=>start(sid),sid); await pg.evaluate(sid=>{detail(sid);setProgress(sid,1);setProgress(sid,1);setProgress(sid,-1);},sid);
await pg.screenshot({path:'edit-detail.png'});
await pg.reload(); ok('show progress edit survives reload', await pg.evaluate(sid=>state.progress[sid]===1 && state.watching.includes(sid),sid));
// unrank + delete
await pg.evaluate(id=>{detail(id);unrank(id);},id); ok('unrank', await pg.evaluate(id=>!state.ranks.some(r=>r.id===id),id));
await pg.evaluate(id=>{deleteConfirm(id);deleteTitle(id);},id); ok('delete removes title everywhere', await pg.evaluate(id=>!state.titles.some(t=>t.id===id)&&!state.later.includes(id),id));
// delete the sample titles the calendar/feed/hero hardcode, then visit every tab
await pg.evaluate(()=>['silo','dune','severance','white','odyssey','past','bear'].forEach(deleteTitle)); await tabs();
await pg.evaluate(()=>{for(let m=9;m<13;m++)events(2026,m);});
ok('deleting sample titles breaks nothing', errs.length===0, errs.join('; '));
// backup round trip
await pg.evaluate(()=>settings());
const [dl]=await Promise.all([pg.waitForEvent('download'),pg.click('button:has-text("Back up my data")')]);
const file=await dl.path(); const backup=JSON.parse(fs.readFileSync(file,'utf8'));
ok('backup contains titles', backup.app==='frame' && backup.state.titles.some(t=>t.id===sid));
// start fresh -> empty, all tabs fine
await pg.evaluate(()=>{startFreshConfirm();startFresh();}); await tabs();
ok('start fresh empties everything', await pg.evaluate(()=>state.titles.length===0&&state.ranks.length===0));
ok('empty app renders all tabs without errors', errs.length===0, errs.join('; '));
await pg.evaluate(()=>go('Discover')); await pg.screenshot({path:'edit-empty.png'});
// restore
await pg.evaluate(()=>settings()); await pg.setInputFiles('#import-file', file); await pg.waitForTimeout(200); await pg.reload();
ok('restore from backup', await pg.evaluate(sid=>state.titles.some(t=>t.id===sid)&&state.progress[sid]===1,sid));
// corrupted backup rejected
fs.writeFileSync('bad.json','{"hello":1}'); await pg.evaluate(()=>settings()); await pg.setInputFiles('#import-file','bad.json'); await pg.waitForTimeout(200);
ok('non-backup file rejected, data kept', await pg.evaluate(sid=>state.titles.some(t=>t.id===sid),sid));
ok('no errors overall', errs.length===0, errs.join('; '));
await b.close(); srv.close();

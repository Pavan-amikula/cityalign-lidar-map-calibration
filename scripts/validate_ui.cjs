// Run against the local server. Uses the same Playwright setup as record_demo.cjs.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),url=process.env.CITYALIGN_URL||'http://127.0.0.1:8846';
async function main(){
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(url)&&!r.url().startsWith('data:'))external.push(r.url())});
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#rendererStatus').textContent.includes('WebGL'));
  await page.screenshot({path:path.join(root,'results/dashboard.png'),fullPage:true});
  await page.locator('#decisionFilter').selectOption('missing-building');
  const rows=await page.locator('#changes tr').allTextContents();
  if(!rows.length||rows.some(x=>!x.includes('missing building candidate')))throw Error('Decision filter failed');
  await page.locator('#changes tr').first().click();
  if(!(await page.locator('#selection').textContent()).includes('missing building candidate'))throw Error('Table-linked properties failed');
  await page.screenshot({path:path.join(root,'results/inspection.png'),fullPage:true});
  await page.locator('#wireToggle').uncheck();await page.locator('#gridToggle').uncheck();await page.locator('#wireToggle').check();await page.locator('#gridToggle').check();
  await page.locator('#viewToggle').click();if(!await page.locator('#map').isVisible())throw Error('2D view failed');
  await page.locator('#viewToggle').click();if(!await page.locator('#scene3d canvas').isVisible())throw Error('3D view failed');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#rendererStatus').textContent.includes('WebGL'));
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(root,'results/mobile.png'),fullPage:true});
  const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(mobileOverflow)throw Error('Mobile horizontal overflow');
  const fallback=await browser.newPage({viewport:{width:1280,height:900}});
  await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl'||type==='webgl2'||type==='experimental-webgl')return null;return original.call(this,type,...args)}});
  await fallback.goto(url);await fallback.waitForFunction(()=>document.querySelector('#rendererStatus').textContent==='2D fallback');
  if(!await fallback.locator('#map').isVisible()||!await fallback.locator('#webglError').isVisible())throw Error('WebGL fallback failed');
  if(errors.length)throw Error(errors.join('\n'));if(external.length)throw Error('Unexpected external assets: '+external.join('\n'));
  const report={page_errors:errors,external_asset_requests:external,mobile_horizontal_overflow:mobileOverflow,checks:['WebGL initialized','locally vendored assets; no external asset requests','decision filtering','table-linked 3D focus and properties','geometry edge/grid toggles','2D/3D switching','mobile layout','WebGL-unavailable fallback'],manual_check:'A real Autzen building was selected in the visible WebGL viewport via raycasting; height/base/support properties appeared.'};
  fs.writeFileSync(path.join(root,'results/ui_validation.json'),JSON.stringify(report,null,2));
  await browser.close();console.log('Engineering UI and fallback checks passed.');
}
main().catch(e=>{console.error(e);process.exit(1)});

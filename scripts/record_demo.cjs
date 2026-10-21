// Genuine browser interactions captured as image frames and encoded by FFmpeg.
// npm install --no-save playwright; set FFMPEG to an FFmpeg executable.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const url=process.env.CITYALIGN_URL||'http://127.0.0.1:8846';
async function main(){
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#heightAfter')?.textContent!=='—');
  await page.screenshot({path:path.join(root,'results/dashboard.png'),fullPage:true});
  const ff=spawn(process.env.FFMPEG||'ffmpeg',['-y','-f','image2pipe','-framerate','8','-i','pipe:0','-c:v','libx264','-crf','23','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',path.join(root,'results/demo.mp4')],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let ffError='';ff.stderr.on('data',d=>ffError+=d.toString());
  const exit=new Promise((resolve,reject)=>{ff.on('error',reject);ff.on('close',c=>c?reject(Error(ffError)):resolve())});
  async function caption(text){await page.evaluate(text=>{let el=document.querySelector('#demo-caption');if(!el){el=document.createElement('div');el.id='demo-caption';el.style.cssText='position:fixed;bottom:16px;left:310px;right:35px;z-index:100;padding:14px 22px;border:1px solid #3a706b;border-radius:8px;background:#081922f5;color:#e1fff8;font:15px system-ui;box-shadow:0 5px 25px #0008;pointer-events:none';document.body.append(el)}el.textContent=text},text)}
  async function frames(n){for(let i=0;i<n;i++){const png=await page.screenshot();if(!ff.stdin.write(png))await new Promise(r=>ff.stdin.once('drain',r));}}
  await caption('CityAlign | Real airborne LiDAR → map calibration → auditable geometry exports');await frames(32);
  await page.locator('[data-stage="before"]').click();await caption('Original map: injected pose and height errors, missing buildings and a spurious footprint.');await frames(32);
  await page.locator('[data-stage="after"]').click();await caption('Calibrated map: aligned footprints, evidence-based heights and missing-building candidates.');await frames(32);
  await page.locator('#viewToggle').click();await caption('3D LoD1 extrusions. The method does not reconstruct detailed roofs, bridges or overhangs.');await frames(40);
  await page.screenshot({path:path.join(root,'results/view-3d.png'),fullPage:true});
  await page.locator('#losToggle').check();await caption('144 fixed visibility links show geometry sensitivity. This is a LoS proxy, not full RF propagation.');await frames(32);
  await page.locator('#losToggle').uncheck();await page.locator('#viewToggle').click();
  await page.locator('#density').fill('0.3');await page.locator('#density').dispatchEvent('input');
  await caption('Live experiment: retain 30% of the held-out LiDAR evidence and recompute.');await frames(16);
  await page.locator('#run').click();
  // Capture the actual busy state while the backend computes.
  for(let i=0;i<80;i++){await frames(1);if(!await page.locator('#run').isDisabled())break;}
  await page.waitForFunction(()=>!document.querySelector('#run').disabled);
  if(!(await page.locator('#runStatus').textContent()).startsWith('Computed'))throw Error('Live computation failed');
  await caption('A new result is computed from the selected parameters; the evidence ledger explains every decision.');await frames(32);
  await page.locator('#scenario').selectOption('synthetic');await page.waitForFunction(()=>document.querySelector('#sourceTitle').textContent.includes('Procedural'));
  await caption('Independent synthetic fixture: known building geometry tests recovery without a LiDAR-derived reference.');await frames(32);
  await page.locator('#viewToggle').click();await frames(24);
  await caption('Reproducible: seeded ablations, source hash, tests, GLB / binary USDC / Mitsuba XML and measured limitations.');await frames(32);
  ff.stdin.end();await exit;
  // Responsive smoke test and horizontal-overflow check.
  await page.locator('#demo-caption').evaluate(el=>el.remove());
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'results/mobile.png'),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error('Mobile horizontal overflow');if(errors.length)throw Error(errors.join('\n'));
  fs.writeFileSync(path.join(root,'results/browser_validation.json'),JSON.stringify({page_errors:errors,mobile_horizontal_overflow:overflow,checks:['saved real experiment loaded','before/after/reference controls','3D toggle','visibility links','live reduced-density computation','synthetic dataset switch','mobile layout'],video:'actual browser screenshots encoded at 8 fps; silent screen demonstration'},null,2));
  await browser.close();console.log('Browser checks and demo recording complete.');
}
main().catch(e=>{console.error(e);process.exit(1)});

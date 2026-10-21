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
  await page.waitForFunction(()=>document.querySelector('#rendererStatus').textContent.includes('WebGL'));
  await page.screenshot({path:path.join(root,'results/dashboard.png'),fullPage:true});
  const ff=spawn(process.env.FFMPEG||'ffmpeg',['-y','-f','image2pipe','-framerate','8','-i','pipe:0','-c:v','libx264','-crf','23','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',path.join(root,'results/demo.mp4')],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let ffError='';ff.stderr.on('data',d=>ffError+=d.toString());
  const exit=new Promise((resolve,reject)=>{ff.on('error',reject);ff.on('close',c=>c?reject(Error(ffError)):resolve())});
  async function caption(text){await page.evaluate(text=>{let el=document.querySelector('#demo-caption');if(!el){el=document.createElement('div');el.id='demo-caption';el.style.cssText='position:fixed;bottom:38px;left:250px;right:315px;z-index:100;padding:12px 17px;border:1px solid #ced8e6;border-left:3px solid #3971c8;border-radius:3px;background:#f8fbfff5;color:#405575;font:12px Segoe UI,system-ui;box-shadow:0 3px 15px #15283b12;pointer-events:none';document.body.append(el)}el.textContent=text},text)}
  async function frames(n){for(let i=0;i<n;i++){const png=await page.screenshot();if(!ff.stdin.write(png))await new Promise(r=>ff.stdin.once('drain',r));}}
  await caption('CityAlign | Real airborne LiDAR → map calibration → auditable geometry exports');await frames(32);
  await page.locator('[data-stage="before"]').click();await caption('Original map: injected pose and height errors, missing buildings and a spurious footprint.');await frames(32);
  await page.locator('[data-stage="after"]').click();await caption('Calibrated map: aligned footprints, evidence-based heights and missing-building candidates.');await frames(32);
  await page.locator('#compareToggle').click();
  await page.locator('#comparisonRange').fill('35');await page.locator('#comparisonRange').dispatchEvent('input');
  await caption('Drag the divider to compare original and calibrated geometry in the same coordinate space.');await frames(32);
  await page.locator('#comparisonRange').fill('65');await page.locator('#comparisonRange').dispatchEvent('input');await frames(24);
  await page.locator('#compareToggle').click();
  await page.locator('[data-stage="reference"]').click();await frames(16);await page.locator('[data-stage="after"]').click();
  await caption('Orbitable WebGL point cloud with LoD1 building meshes. Roof details, bridges and overhangs remain limitations.');await frames(32);
  const sceneBox=await page.locator('#scene3d canvas').boundingBox();
  await page.mouse.move(sceneBox.x+sceneBox.width*.65,sceneBox.y+sceneBox.height*.55);await page.mouse.down();await page.mouse.move(sceneBox.x+sceneBox.width*.75,sceneBox.y+sceneBox.height*.61,{steps:12});await page.mouse.up();await frames(16);
  await page.locator('#reset').click();
  await page.locator('#demo-caption').evaluate(el=>el.style.visibility='hidden');
  await page.screenshot({path:path.join(root,'results/view-3d.png'),fullPage:true});
  await page.locator('#demo-caption').evaluate(el=>el.style.visibility='visible');
  await page.locator('#colorMode').selectOption('elevation');await caption('Inspect elevation, classification and point density with dedicated display controls.');await frames(24);
  await page.locator('#pointSize').fill('3');await page.locator('#pointSize').dispatchEvent('input');await frames(12);
  await page.locator('#colorMode').selectOption('classification');await page.locator('#pointSize').fill('2');await page.locator('#pointSize').dispatchEvent('input');
  await page.locator('#geometryToggle').uncheck();await frames(12);await page.locator('#geometryToggle').check();
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
  const q=await page.evaluate(()=>{const ring=data.after.features[0].geometry.coordinates[0];const c=ring.slice(0,-1).reduce((s,p)=>[s[0]+p[0]/(ring.length-1),s[1]+p[1]/(ring.length-1)],[0,0]);return project(c)});
  await page.locator('#map').click({position:{x:q[0],y:q[1]}});
  if(!await page.locator('#selection').isVisible())throw Error('Building inspection failed');
  await page.locator('#drawerToggle').click();if(await page.locator('#drawerToggle').getAttribute('aria-expanded')!=='false')throw Error('Drawer failed');await frames(16);
  await page.locator('#drawerToggle').click();await page.locator('#zoomIn').click();await page.locator('#reset').click();
  await page.locator('#viewToggle').click();await frames(24);
  await caption('Reproducible: seeded ablations, source hash, tests, GLB / binary USDC / Mitsuba XML and measured limitations.');await frames(32);
  ff.stdin.end();await exit;
  // Responsive smoke test and horizontal-overflow check.
  await page.locator('#demo-caption').evaluate(el=>el.remove());
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'results/mobile.png'),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error('Mobile horizontal overflow');if(errors.length)throw Error(errors.join('\n'));
  fs.writeFileSync(path.join(root,'results/browser_validation.json'),JSON.stringify({page_errors:errors,mobile_horizontal_overflow:overflow,interface:'professional point-cloud engineering workspace',renderer:'Three.js WebGL; local vendor modules',checks:['saved real experiment loaded','before/after/reference controls','draggable comparison at 35% and 65%','WebGL orbit mouse drag','classification/elevation color modes','point-size control','building layer visibility','3D and 2D views','visibility links','live reduced-density computation','synthetic dataset switch','building click inspection','evidence drawer collapse/expand','zoom and fit','mobile layout'],video:'actual browser screenshots encoded at 8 fps; silent screen demonstration'},null,2));
  await browser.close();console.log('Browser checks and demo recording complete.');
}
main().catch(e=>{console.error(e);process.exit(1)});

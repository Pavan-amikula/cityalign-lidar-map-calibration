'use strict';
const $=id=>document.getElementById(id);
const canvas=$('map'),ctx=canvas.getContext('2d');
let data=null,stage='after',iso=true,zoom=1,pan=[0,0],drag=null,moved=false,selected=null,projected=[],compare=false,split=.5;
let W=1,H=1,center=[0,0],scale=1;
const pct=x=>(100*x).toFixed(1)+'%';
const fixed=x=>x==null?'—':x.toFixed(2);
const colors={after:'#77a3e8',before:'#a8afb9',reference:'#96b4a5'};

function update(view){
  data=view; selected=null; $('selection').hidden=true;
  const r=data.report,a=r.after,b=r.before;
  $('heightAfter').textContent=fixed(a.height_mae_m);$('heightBefore').textContent=fixed(b.height_mae_m);
  $('iouAfter').textContent=fixed(a.mean_iou);$('iouBefore').textContent=fixed(b.mean_iou);
  $('recallAfter').textContent=pct(a.recall);$('recallBefore').textContent=pct(b.recall);
  $('runtime').textContent=fixed(r.elapsed_s);$('pointsCount').textContent=r.input_points.toLocaleString()+' evidence points';
  $('losBefore').textContent=pct(r.visibility_proxy.before_disagreement);$('losAfter').textContent=pct(r.visibility_proxy.after_disagreement);
  $('changeCount').textContent=r.changes.length+' decisions';
  renderChanges();
  $('selectionHint').hidden=false;
  $('samplePoints').textContent=data.points.length.toLocaleString()+' displayed sample points';
  $('sampleStatus').textContent=data.points.length.toLocaleString()+' display points';
  $('layerCount').textContent=data.after.features.length+' calibrated objects';
  const history=r.icp_rmse_history_m,maximum=Math.max(...history,1e-6);
  $('registrationIterations').textContent=history.length+' iterations';
  const path=history.map((v,i)=>(i?'L':'M')+(5+i*250/Math.max(history.length-1,1)).toFixed(1)+','+(42-v/maximum*35).toFixed(1)).join(' ');
  $('convergenceChart').innerHTML='<title>Trimmed ICP residuals in metres: '+history.map(x=>x.toFixed(3)).join(', ')+'</title><path d="M5 42H255" fill="none" stroke="#e1e8f2"/><path d="'+path+'" fill="none" stroke="#6b93d1" stroke-width="1.8"/>';
  const real=r.scenario==='autzen';
  document.querySelector('.source-footer p').textContent=real?'Public classified observations. Source: PDAL / Watershed Sciences / Hobu.':'Procedural roof and ground returns with independently known synthetic geometry.';
  $('mapSubtitle').textContent=real?'Autzen district · Eugene, Oregon':'Procedural district · 16 known buildings';
  $('studyNumber').textContent=real?'001 / OREGON':'002 / SYNTHETIC';
  $('sourceTitle').textContent=real?'Eugene, Oregon':'Procedural city / seed '+r.seed;
  $('sourceText').textContent=real?'Classified airborne returns. Disjoint point split with controlled map corruption.':'Sixteen independent flat-roof reference buildings and sampled roof / ground evidence.';
  $('sourceBadge').textContent=real?'REAL LiDAR / PSEUDO-REFERENCE':'SYNTHETIC / KNOWN GEOMETRY';
  $('caveat').textContent=real?'Real LiDAR uses a derived reference and injected map errors. This is a recovery experiment, not independent survey validation.':'Synthetic reference geometry is known exactly. This fixture tests the estimator under controlled conditions; it does not establish real-world accuracy.';
  $('exports').replaceChildren();
  for(const [label,name] of [['GLB','calibrated.glb'],['USDC','calibrated.usdc'],['XML','scene.xml'],['PLY','calibrated.ply'],['JSON','report.json']]){
    const a=document.createElement('a');a.textContent=label;a.href=`/api/download/${r.scenario}/${name}`;a.title='Saved standard experiment export; reruns shown in viewer are temporary';$('exports').append(a);
  }
  const coords=data.reference.features.flatMap(f=>f.geometry.coordinates[0]);
  const xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);
  center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
  const dx=Math.max(...xs)-Math.min(...xs),dy=Math.max(...ys)-Math.min(...ys);
  $('mapExtent').textContent=Math.round(dx)+' × '+Math.round(dy)+' m';
  fit();zoom=1;pan=[0,0];draw();
}
function fit(){
  if(!data)return;
  const coords=data.reference.features.flatMap(f=>f.geometry.coordinates[0]);
  const xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);
  const dx=Math.max(...xs)-Math.min(...xs),dy=Math.max(...ys)-Math.min(...ys);
  scale=Math.min((W-90)/dx,(H-95)/dy);
  scale=Math.max(.05,scale);
}
function origin(){return [W*.5,H*.5];}
function project(p,z=0){
  let x=p[0]-center[0],y=p[1]-center[1],s=scale*zoom;const [ox,oy]=origin();
  return iso?[ox+(x-y)*.78*s+pan[0],oy+(x+y)*.36*s-z*.95*s+pan[1]]:[ox+x*s+pan[0],oy-y*s+pan[1]];
}
function path(rings,z){
  ctx.beginPath();for(const ring of rings){ring.forEach((p,i)=>{const q=project(p,z);i?ctx.lineTo(...q):ctx.moveTo(...q)});ctx.closePath()}
}
function drawBuildings(which,base){
  if(!$('geometryToggle').checked)return;
  let fs=[...data[which].features];if(iso)fs.sort((a,b)=>{const aa=a.geometry.coordinates[0][0],bb=b.geometry.coordinates[0][0];return aa[0]+aa[1]-bb[0]-bb[1]});
  for(const f of fs){
    const p=f.properties,rings=f.geometry.coordinates;
    const color=which==='after'?(p.status.includes('candidate')?'#b4a3dc':p.status.includes('review')?'#d4a15b':colors.after):colors[which];
    const z=iso?p.base-base+p.height:0;
    if(iso){
      for(const ring of rings)for(let i=0;i<ring.length-1;i++){
        const a=ring[i],b=ring[i+1],q=[project(a,p.base-base),project(b,p.base-base),project(b,z),project(a,z)];
        ctx.beginPath();q.forEach((x,i)=>i?ctx.lineTo(...x):ctx.moveTo(...x));ctx.closePath();
        ctx.fillStyle=color+'30';ctx.fill();ctx.strokeStyle=color+'90';ctx.lineWidth=.7;ctx.stroke();
      }
    }
    path(rings,z);ctx.fillStyle=color+(selected===p.id?'a0':which==='after'?'40':'28');ctx.fill('evenodd');ctx.strokeStyle=color;ctx.lineWidth=selected===p.id?2:1;if($('wireToggle').checked||selected===p.id)ctx.stroke();
    if(!compare)projected.push({feature:f,rings:rings.map(r=>r.map(p=>project(p,z)))});
    if(scale*zoom>1.4){const ring=rings[0],c=ring.reduce((s,p)=>[s[0]+p[0]/ring.length,s[1]+p[1]/ring.length],[0,0]),q=project(c,z);ctx.fillStyle='#b1bfd3';ctx.font='9px monospace';ctx.fillText(p.height.toFixed(1)+'m',q[0]-13,q[1]);}
  }
}
function draw(){
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#262a30';ctx.fillRect(0,0,W,H);
  if($('gridToggle').checked){ctx.lineWidth=.5;ctx.strokeStyle='#50586640';
  const grid=50;for(let i=-35;i<=35;i++){
    let a=project([center[0]+i*grid,center[1]-1800]),b=project([center[0]+i*grid,center[1]+1800]);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
    a=project([center[0]-1800,center[1]+i*grid]);b=project([center[0]+1800,center[1]+i*grid]);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
  }
  // Subtle survey crosses make coordinate space legible without an invented basemap.
  ctx.strokeStyle='#636d7c55';ctx.lineWidth=.7;
  for(let i=-10;i<=10;i++)for(let j=-10;j<=10;j++){
    const q=project([center[0]+i*200,center[1]+j*200]);if(q[0]<0||q[0]>W||q[1]<0||q[1]>H)continue;
    ctx.beginPath();ctx.moveTo(q[0]-3,q[1]);ctx.lineTo(q[0]+3,q[1]);ctx.moveTo(q[0],q[1]-3);ctx.lineTo(q[0],q[1]+3);ctx.stroke();
  }
  }
  if(!data)return;
  const base=Math.min(...data.reference.features.map(f=>f.properties.base));
  if($('cloudToggle').checked){
    for(let i=0;i<data.points.length;i++){
      const p=data.points[i],code=data.classes[i],q=project(p,iso?p[2]-base:0);
      const mode=$('colorMode').value;
      ctx.fillStyle=mode==='uniform'?'#b6c3d3aa':mode==='elevation'?`hsl(${240-Math.min(1,Math.max(0,(p[2]-base)/45))*240} 70% 60%)`:code===6?'#f0b65cbb':code===2?'#9fa9b877':code===5?'#6d9e7599':'#bb91cf99';
      const size=+$('pointSize').value;ctx.fillRect(q[0],q[1],size,size);
    }
  }
  projected=[];
  if(compare){
    ctx.save();ctx.beginPath();ctx.rect(0,0,W*split,H);ctx.clip();drawBuildings('before',base);ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(W*split,0,W*(1-split),H);ctx.clip();drawBuildings('after',base);ctx.restore();
  }else drawBuildings(stage,base);
  if($('losToggle').checked){
    const l=data.links,tx=project(l.tx,iso?l.tx[2]-base:0);
    for(let i=0;i<l.receivers.length;i++){
      const rx=l.receivers[i],q=project(rx,iso?rx[2]-base:0);ctx.strokeStyle=l[stage][i]?'#d4946240':'#789b8755';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(...tx);ctx.lineTo(...q);ctx.stroke();ctx.fillStyle=l[stage][i]?'#d49462':'#789b87';ctx.fillRect(q[0]-1.5,q[1]-1.5,3,3);
    }ctx.fillStyle='#d2dae7';ctx.beginPath();ctx.arc(tx[0],tx[1],4,0,Math.PI*2);ctx.fill();
  }
  const metres=100,pixels=metres*scale*zoom;ctx.strokeStyle='#718098';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(W-27-pixels,H-24);ctx.lineTo(W-27,H-24);ctx.moveTo(W-27-pixels,H-27);ctx.lineTo(W-27-pixels,H-21);ctx.moveTo(W-27,H-27);ctx.lineTo(W-27,H-21);ctx.stroke();ctx.font='8px monospace';ctx.fillStyle='#8495ac';ctx.fillText('100 m',W-27-pixels,H-32);
  $('buildingCount').textContent=data[stage].features.length+' objects / '+(iso?'3D extrusion':'plan view');
  $('viewTag').textContent=iso?'PERSPECTIVE':'PLAN';
  document.querySelector('.navigation-cube').style.display=iso?'flex':'none';
  if(iso)$('cursorCoords').textContent='Local metric frame · Z up';
  $('mapTitle').textContent=iso?'3D calibration viewport':'2D calibration viewport';
  $('navigationHint').textContent=iso?'Left drag: orbit · right drag: pan · wheel: zoom · click: inspect':'Drag: pan · wheel: zoom · click: inspect';
  $('scene3d').style.display=iso?'block':'none';canvas.style.display=iso?'none':'block';
  window.CityScene?.sync(window.CityAlignState());
  $('mapLabel').textContent=compare?'ORIGINAL / CALIBRATED COMPARISON':stage==='after'?'CALIBRATED GEOMETRY':stage==='before'?'MAP WITH INJECTED ERRORS':'REFERENCE GEOMETRY';
}
function resize(){const r=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;W=r.width;H=r.height;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);fit();draw()}
new ResizeObserver(resize).observe(canvas);
function setCompare(value){compare=value;$('comparisonOverlay').hidden=!compare;$('compareToggle').setAttribute('aria-pressed',String(compare));if(compare)$('losToggle').checked=false;$('losToggle').disabled=compare;$('selection').hidden=true;$('selectionHint').hidden=false;selected=null;draw();}
$('compareToggle').onclick=()=>setCompare(!compare);
$('comparisonRange').oninput=()=>{split=+$('comparisonRange').value/100;$('splitLine').style.left=(split*100)+'%';draw()};
$('drawerToggle').onclick=()=>{const closed=$('evidenceDrawer').classList.toggle('collapsed');document.querySelector('.workbench').classList.toggle('drawer-collapsed',closed);$('drawerToggle').setAttribute('aria-expanded',String(!closed));$('drawerToggle').firstChild.textContent=closed?'Expand ':'Collapse ';};
$('zoomIn').onclick=()=>{if(iso)window.CityScene?.zoom(1.3);else{zoom=Math.min(8,zoom*1.3);draw()}};$('zoomOut').onclick=()=>{if(iso)window.CityScene?.zoom(1/1.3);else{zoom=Math.max(.25,zoom/1.3);draw()}};
for(const btn of document.querySelectorAll('[data-stage]'))btn.onclick=()=>{stage=btn.dataset.stage;setCompare(false);document.querySelectorAll('[data-stage]').forEach(b=>b.classList.toggle('active',b===btn));$('selection').hidden=true;selected=null;draw()};
$('cloudToggle').onchange=draw;$('losToggle').onchange=draw;
$('viewToggle').onclick=()=>{iso=!iso;$('viewToggle').textContent=iso?'2D plan':'3D view';zoom=1;pan=[0,0];draw();if(iso)window.CityScene?.fit()};
$('reset').onclick=()=>{pan=[0,0];zoom=1;draw();if(iso)window.CityScene?.fit()};
canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY,...pan];moved=false;canvas.setPointerCapture(e.pointerId)};
canvas.onpointermove=e=>{const rect=canvas.getBoundingClientRect(),o=origin(),x=(e.clientX-rect.left-o[0]-pan[0])/(scale*zoom),y=(e.clientY-rect.top-o[1]-pan[1])/(scale*zoom);let east=iso?(x/.78+y/.36)/2:x,north=iso?(y/.36-x/.78)/2:-y;$('cursorCoords').textContent='X '+(east+center[0]).toFixed(1)+' m  /  Y '+(north+center[1]).toFixed(1)+' m';if(drag){const dx=e.clientX-drag[0],dy=e.clientY-drag[1];if(Math.hypot(dx,dy)>3)moved=true;pan=[drag[2]+dx,drag[3]+dy];draw()}};
canvas.onpointerup=e=>{drag=null;if(moved||compare)return;const r=canvas.getBoundingClientRect(),p=[e.clientX-r.left,e.clientY-r.top];
  function inside(ring){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c}return c}
  const found=[...projected].reverse().find(x=>inside(x.rings[0])&&!x.rings.slice(1).some(inside));
  selectBuilding(found?.feature||null);};
canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.25,Math.min(8,zoom*Math.exp(-e.deltaY*.001)));draw()};
for(const id of ['shift','yaw','density'])$(id).oninput=()=>$(id+'Value').textContent=id==='density'?Math.round(+$(id).value*100)+'%':$(id).value+(id==='shift'?' m':'°');
function selectBuilding(feature){
  $('selection').hidden=!feature;$('selectionHint').hidden=!!feature;selected=feature?.properties.id||null;
  $('selection').replaceChildren();
  if(feature){const o=feature.properties,title=document.createElement('strong');title.textContent=o.id;$('selection').append(title);
    for(const text of [o.status.replaceAll('-',' '),`Height: ${o.height.toFixed(2)} m · base ${o.base.toFixed(2)} m`,`Overlap: ${o.confidence.toFixed(2)} · ${o.support} returns`]){const d=document.createElement('div');d.textContent=text;$('selection').append(d)}
  }document.querySelectorAll('#changes tr').forEach(tr=>tr.classList.toggle('selected-row',tr.dataset.id===selected));draw();
}
function renderChanges(){
  if(!data)return;$('changes').replaceChildren();const filter=$('decisionFilter').value;
  for(const change of data.report.changes){
    if(filter!=='all'&&!change.action.includes(filter))continue;
    const tr=document.createElement('tr');tr.dataset.id=change.id;
    for(const text of [change.id,change.action.replaceAll('-',' '),change.delta_height_m==null?'—':(change.delta_height_m>0?'+':'')+change.delta_height_m.toFixed(2)+' m',change.support??change.ground_returns??'—']){const td=document.createElement('td');td.textContent=text;tr.append(td)}
    tr.tabIndex=0;tr.title='Inspect '+change.id;
    const choose=()=>{let f=data[stage].features.find(f=>f.properties.id===change.id);if(!f){const key=['after','before','reference'].find(k=>data[k].features.some(f=>f.properties.id===change.id));if(key){document.querySelector(`[data-stage="${key}"]`).click();f=data[key].features.find(f=>f.properties.id===change.id)}}if(f){selectBuilding(f);if(iso)window.CityScene?.focus(f)}};
    tr.onclick=choose;tr.onkeydown=e=>{if(e.key==='Enter')choose()};$('changes').append(tr);
  }
}
$('decisionFilter').onchange=renderChanges;
$('colorMode').onchange=()=>{window.CityScene?.setColors();draw()};
$('pointSize').oninput=()=>{$('pointSizeValue').textContent=$('pointSize').value+' px';draw()};
for(const id of ['geometryToggle','wireToggle','gridToggle'])$(id).onchange=draw;
window.CityAlignState=()=>({view:data,stage,iso,compare,split,selected});
window.addEventListener('cityalign:select',e=>selectBuilding(e.detail));
window.addEventListener('cityalign:webgl-unavailable',e=>{iso=false;$('viewToggle').textContent='3D unavailable';$('viewToggle').disabled=true;$('webglError').textContent='WebGL is unavailable in this browser. The 2D calibration view remains active.';$('webglError').hidden=false;draw()});
async function load(){
  $('runStatus').textContent='Loading saved standard experiment…';
  try{const res=await fetch('/api/result/'+$('scenario').value);const v=await res.json();if(!res.ok)throw Error(v.error);update(v);$('runStatus').textContent='Saved standard run. Adjust the controls to test a new calibration.';for(const id of ['shift','yaw','density']){$(id).value=id==='shift'?4:1;$(id).oninput()}}
  catch(e){$('runStatus').textContent=e.message+'. Run calibration to compute it.'}
}
$('scenario').onchange=load;
$('run').onclick=async()=>{
  $('run').disabled=true;$('runStatus').textContent='Extracting evidence → aligning → evaluating…';
  const start=performance.now();
  try{const res=await fetch('/api/calibrate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario:$('scenario').value,shift:+$('shift').value,yaw:+$('yaw').value,density:+$('density').value})});const v=await res.json();if(!res.ok)throw Error(v.error);update(v);$('runStatus').textContent='Computed in '+((performance.now()-start)/1000).toFixed(2)+' s. Temporary view; exports retain the saved standard run.'}
  catch(e){$('runStatus').textContent='Calibration failed: '+e.message}finally{$('run').disabled=false}
};
load();

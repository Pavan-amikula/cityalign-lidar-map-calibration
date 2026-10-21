'use strict';
const $=id=>document.getElementById(id);
const canvas=$('map'),ctx=canvas.getContext('2d');
let data=null,stage='after',iso=false,zoom=1,pan=[0,0],drag=null,moved=false,selected=null,projected=[],compare=false,split=.5;
let W=1,H=1,center=[0,0],scale=1;
const pct=x=>(100*x).toFixed(1)+'%';
const fixed=x=>x==null?'—':x.toFixed(2);
const colors={after:'#ab4b32',before:'#888f8a',reference:'#66734d'};

function update(view){
  data=view; selected=null; $('selection').hidden=true;
  const r=data.report,a=r.after,b=r.before;
  $('heightAfter').textContent=fixed(a.height_mae_m);$('heightBefore').textContent=fixed(b.height_mae_m);
  $('iouAfter').textContent=fixed(a.mean_iou);$('iouBefore').textContent=fixed(b.mean_iou);
  $('recallAfter').textContent=pct(a.recall);$('recallBefore').textContent=pct(b.recall);
  $('runtime').textContent=fixed(r.elapsed_s);$('pointsCount').textContent=r.input_points.toLocaleString()+' evidence points';
  $('losBefore').textContent=pct(r.visibility_proxy.before_disagreement);$('losAfter').textContent=pct(r.visibility_proxy.after_disagreement);
  $('changeCount').textContent=r.changes.length+' decisions';
  $('changes').replaceChildren();
  for(const change of r.changes){
    const tr=document.createElement('tr');
    for(const text of [change.id,change.action.replaceAll('-',' '),change.delta_height_m==null?'—':(change.delta_height_m>0?'+':'')+change.delta_height_m.toFixed(2)+' m',change.support??change.ground_returns??'—']){
      const td=document.createElement('td');td.textContent=text;tr.append(td);
    }$('changes').append(tr);
  }
  const real=r.scenario==='autzen';
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
  fit();zoom=1;pan=[0,0];draw();
}
function fit(){
  if(!data)return;
  const coords=data.reference.features.flatMap(f=>f.geometry.coordinates[0]);
  const xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);
  const dx=Math.max(...xs)-Math.min(...xs),dy=Math.max(...ys)-Math.min(...ys);
  scale=W>760?Math.min((W-330)/dx,(H-105)/dy):Math.min((W-75)/dx,(H-300)/dy);
  scale=Math.max(.05,scale);
}
function origin(){return W>760?[W*.59,H*.48]:[W*.5,H*.60];}
function project(p,z=0){
  let x=p[0]-center[0],y=p[1]-center[1],s=scale*zoom;const [ox,oy]=origin();
  return iso?[ox+(x-y)*.78*s+pan[0],oy+(x+y)*.36*s-z*.95*s+pan[1]]:[ox+x*s+pan[0],oy-y*s+pan[1]];
}
function path(rings,z){
  ctx.beginPath();for(const ring of rings){ring.forEach((p,i)=>{const q=project(p,z);i?ctx.lineTo(...q):ctx.moveTo(...q)});ctx.closePath()}
}
function drawBuildings(which,base){
  let fs=[...data[which].features];if(iso)fs.sort((a,b)=>{const aa=a.geometry.coordinates[0][0],bb=b.geometry.coordinates[0][0];return aa[0]+aa[1]-bb[0]-bb[1]});
  for(const f of fs){
    const p=f.properties,rings=f.geometry.coordinates;
    const color=which==='after'?(p.status.includes('candidate')?'#838751':p.status.includes('review')?'#b08a5f':colors.after):colors[which];
    const z=iso?p.base-base+p.height:0;
    if(iso){
      for(const ring of rings)for(let i=0;i<ring.length-1;i++){
        const a=ring[i],b=ring[i+1],q=[project(a,p.base-base),project(b,p.base-base),project(b,z),project(a,z)];
        ctx.beginPath();q.forEach((x,i)=>i?ctx.lineTo(...x):ctx.moveTo(...x));ctx.closePath();
        ctx.fillStyle=color+'30';ctx.fill();ctx.strokeStyle=color+'90';ctx.lineWidth=.7;ctx.stroke();
      }
    }
    path(rings,z);ctx.fillStyle=color+(selected===p.id?'a0':which==='after'?'40':'28');ctx.fill('evenodd');ctx.strokeStyle=color;ctx.lineWidth=selected===p.id?2:1;ctx.stroke();
    if(!compare)projected.push({feature:f,rings:rings.map(r=>r.map(p=>project(p,z)))});
    if(scale*zoom>1.4){const ring=rings[0],c=ring.reduce((s,p)=>[s[0]+p[0]/ring.length,s[1]+p[1]/ring.length],[0,0]),q=project(c,z);ctx.fillStyle='#494c41';ctx.font='9px monospace';ctx.fillText(p.height.toFixed(1)+'m',q[0]-13,q[1]);}
  }
}
function draw(){
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#f5f2ea';ctx.fillRect(0,0,W,H);
  ctx.lineWidth=.5;ctx.strokeStyle='#deded140';
  const grid=50;for(let i=-35;i<=35;i++){
    let a=project([center[0]+i*grid,center[1]-1800]),b=project([center[0]+i*grid,center[1]+1800]);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
    a=project([center[0]-1800,center[1]+i*grid]);b=project([center[0]+1800,center[1]+i*grid]);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
  }
  // Subtle survey crosses make coordinate space legible without an invented basemap.
  ctx.strokeStyle='#aeb29d44';ctx.lineWidth=.7;
  for(let i=-10;i<=10;i++)for(let j=-10;j<=10;j++){
    const q=project([center[0]+i*200,center[1]+j*200]);if(q[0]<0||q[0]>W||q[1]<0||q[1]>H)continue;
    ctx.beginPath();ctx.moveTo(q[0]-3,q[1]);ctx.lineTo(q[0]+3,q[1]);ctx.moveTo(q[0],q[1]-3);ctx.lineTo(q[0],q[1]+3);ctx.stroke();
  }
  if(!data)return;
  const base=Math.min(...data.reference.features.map(f=>f.properties.base));
  if($('cloudToggle').checked){
    for(let i=0;i<data.points.length;i++){
      const p=data.points[i],code=data.classes[i],q=project(p,iso?p[2]-base:0);
      ctx.fillStyle=code===6?'#646a5b65':code===2?'#93988848':'#92987d35';ctx.fillRect(q[0],q[1],1.25,1.25);
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
      const rx=l.receivers[i],q=project(rx,iso?rx[2]-base:0);ctx.strokeStyle=l[stage][i]?'#ab4b3240':'#747e5255';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(...tx);ctx.lineTo(...q);ctx.stroke();ctx.fillStyle=l[stage][i]?'#ab4b32':'#747e52';ctx.fillRect(q[0]-1.5,q[1]-1.5,3,3);
    }ctx.fillStyle='#292c28';ctx.beginPath();ctx.arc(tx[0],tx[1],4,0,Math.PI*2);ctx.fill();
  }
  const metres=100,pixels=metres*scale*zoom;ctx.strokeStyle='#6f7766';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(W-27-pixels,H-24);ctx.lineTo(W-27,H-24);ctx.moveTo(W-27-pixels,H-27);ctx.lineTo(W-27-pixels,H-21);ctx.moveTo(W-27,H-27);ctx.lineTo(W-27,H-21);ctx.stroke();ctx.font='8px monospace';ctx.fillStyle='#787e6f';ctx.fillText('100 m',W-27-pixels,H-32);
  $('buildingCount').textContent=data[stage].features.length+' objects / '+(iso?'3D extrusion':'plan view');
  $('mapLabel').textContent=compare?'ORIGINAL / CALIBRATED COMPARISON':stage==='after'?'CALIBRATED GEOMETRY':stage==='before'?'MAP WITH INJECTED ERRORS':'REFERENCE GEOMETRY';
}
function resize(){const r=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;W=r.width;H=r.height;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);fit();draw()}
new ResizeObserver(resize).observe(canvas);
function setCompare(value){compare=value;$('comparisonOverlay').hidden=!compare;$('compareToggle').setAttribute('aria-pressed',String(compare));if(compare)$('losToggle').checked=false;$('losToggle').disabled=compare;$('selection').hidden=true;selected=null;draw();}
$('compareToggle').onclick=()=>setCompare(!compare);
$('comparisonRange').oninput=()=>{split=+$('comparisonRange').value/100;$('splitLine').style.left=(split*100)+'%';draw()};
$('drawerToggle').onclick=()=>{const closed=$('evidenceDrawer').classList.toggle('collapsed');$('drawerToggle').setAttribute('aria-expanded',String(!closed));$('drawerToggle').firstChild.textContent=closed?'Expand ':'Collapse ';};
$('zoomIn').onclick=()=>{zoom=Math.min(8,zoom*1.3);draw()};$('zoomOut').onclick=()=>{zoom=Math.max(.25,zoom/1.3);draw()};
for(const btn of document.querySelectorAll('[data-stage]'))btn.onclick=()=>{stage=btn.dataset.stage;setCompare(false);document.querySelectorAll('[data-stage]').forEach(b=>b.classList.toggle('active',b===btn));$('selection').hidden=true;selected=null;draw()};
$('cloudToggle').onchange=draw;$('losToggle').onchange=draw;
$('viewToggle').onclick=()=>{iso=!iso;$('viewToggle').textContent=iso?'Top view':'3D view';zoom=iso?.78:1;pan=[0,0];draw()};
$('reset').onclick=()=>{pan=[0,0];zoom=iso?.78:1;draw()};
canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY,...pan];moved=false;canvas.setPointerCapture(e.pointerId)};
canvas.onpointermove=e=>{const rect=canvas.getBoundingClientRect(),o=origin(),x=(e.clientX-rect.left-o[0]-pan[0])/(scale*zoom),y=(e.clientY-rect.top-o[1]-pan[1])/(scale*zoom);let east=iso?(x/.78+y/.36)/2:x,north=iso?(y/.36-x/.78)/2:-y;$('cursorCoords').textContent='X '+(east+center[0]).toFixed(1)+' m  /  Y '+(north+center[1]).toFixed(1)+' m';if(drag){const dx=e.clientX-drag[0],dy=e.clientY-drag[1];if(Math.hypot(dx,dy)>3)moved=true;pan=[drag[2]+dx,drag[3]+dy];draw()}};
canvas.onpointerup=e=>{drag=null;if(moved||compare)return;const r=canvas.getBoundingClientRect(),p=[e.clientX-r.left,e.clientY-r.top];
  function inside(ring){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c}return c}
  const found=[...projected].reverse().find(x=>inside(x.rings[0])&&!x.rings.slice(1).some(inside));
  $('selection').hidden=!found;
  if(found){const o=found.feature.properties;selected=o.id;$('selection').replaceChildren();const title=document.createElement('strong');title.textContent=o.id;$('selection').append(title);for(const text of [o.status.replaceAll('-',' '),`Height: ${o.height.toFixed(2)} m · base ${o.base.toFixed(2)} m`,`Overlap confidence: ${o.confidence.toFixed(2)} · ${o.support} returns`]){const d=document.createElement('div');d.textContent=text;$('selection').append(d)}}else selected=null;draw();};
canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.25,Math.min(8,zoom*Math.exp(-e.deltaY*.001)));draw()};
for(const id of ['shift','yaw','density'])$(id).oninput=()=>$(id+'Value').textContent=id==='density'?Math.round(+$(id).value*100)+'%':$(id).value+(id==='shift'?' m':'°');
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

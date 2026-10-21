'use strict';
const $=id=>document.getElementById(id);
const canvas=$('map'),ctx=canvas.getContext('2d');
let data=null,stage='after',iso=false,zoom=1,pan=[0,0],drag=null,moved=false,selected=null,projected=[];
let W=1,H=1,center=[0,0],scale=1;
const pct=x=>(100*x).toFixed(1)+'%';
const fixed=x=>x==null?'—':x.toFixed(2);
const colors={after:'#36d5b4',before:'#f1b364',reference:'#75b9ed'};

function update(view){
  data=view; selected=null;
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
  scale=Math.min((W-100)/dx,(H-80)/dy);zoom=1;pan=[0,0];draw();
}
function project(p,z=0){
  let x=p[0]-center[0],y=p[1]-center[1],s=scale*zoom;
  return iso?[W/2+(x-y)*.78*s+pan[0],H/2+(x+y)*.36*s-z*.95*s+pan[1]]:[W/2+x*s+pan[0],H/2-y*s+pan[1]];
}
function path(rings,z){
  ctx.beginPath();for(const ring of rings){ring.forEach((p,i)=>{const q=project(p,z);i?ctx.lineTo(...q):ctx.moveTo(...q)});ctx.closePath()}
}
function draw(){
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#0c1420';ctx.fillRect(0,0,W,H);
  ctx.lineWidth=.5;ctx.strokeStyle='#253244';
  const grid=50;for(let i=-30;i<=30;i++){
    let a=project([center[0]+i*grid,center[1]-1500]),b=project([center[0]+i*grid,center[1]+1500]);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
    a=project([center[0]-1500,center[1]+i*grid]);b=project([center[0]+1500,center[1]+i*grid]);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
  }
  if(!data)return;
  const base=Math.min(...data.reference.features.map(f=>f.properties.base));
  if($('cloudToggle').checked){
    for(let i=0;i<data.points.length;i++){
      const p=data.points[i],code=data.classes[i];const q=project(p,iso?p[2]-base:0);
      ctx.fillStyle=code===6?'#8199ad99':code===2?'#35475a99':'#5c70824d';ctx.fillRect(q[0],q[1],1.4,1.4);
    }
  }
  projected=[];
  let fs=[...data[stage].features];if(iso)fs.sort((a,b)=>{const aa=a.geometry.coordinates[0][0],bb=b.geometry.coordinates[0][0];return aa[0]+aa[1]-bb[0]-bb[1]});
  for(const f of fs){
    const p=f.properties,rings=f.geometry.coordinates;
    const color=stage==='after'?(p.status.includes('candidate')?'#a9abff':p.status.includes('review')?'#f1b364':colors.after):colors[stage];
    const z=iso?p.base-base+p.height:0;
    if(iso){
      for(const ring of rings)for(let i=0;i<ring.length-1;i++){
        const a=ring[i],b=ring[i+1],q=[project(a,p.base-base),project(b,p.base-base),project(b,z),project(a,z)];
        ctx.beginPath();q.forEach((x,i)=>i?ctx.lineTo(...x):ctx.moveTo(...x));ctx.closePath();ctx.fillStyle=color+'25';ctx.fill();ctx.strokeStyle=color+'66';ctx.stroke();
      }
    }
    path(rings,z);ctx.fillStyle=color+(selected===p.id?'aa':'44');ctx.fill('evenodd');ctx.strokeStyle=color;ctx.lineWidth=selected===p.id?2:1;ctx.stroke();
    projected.push({feature:f,rings:rings.map(r=>r.map(p=>project(p,z)))});
    if(scale*zoom>1.4){const ring=rings[0],c=ring.reduce((s,p)=>[s[0]+p[0]/ring.length,s[1]+p[1]/ring.length],[0,0]),q=project(c,z);ctx.fillStyle='#dbece8';ctx.font='9px monospace';ctx.fillText(p.height.toFixed(1)+'m',q[0]-13,q[1]);}
  }
  if($('losToggle').checked){
    const l=data.links,tx=project(l.tx,iso?l.tx[2]-base:0);
    for(let i=0;i<l.receivers.length;i++){
      const rx=l.receivers[i],q=project(rx,iso?rx[2]-base:0);ctx.strokeStyle=l[stage][i]?'#ed9a6040':'#36d5b45c';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(...tx);ctx.lineTo(...q);ctx.stroke();ctx.fillStyle=l[stage][i]?'#ed9a60':'#36d5b4';ctx.fillRect(q[0]-2,q[1]-2,4,4);
    }ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(tx[0],tx[1],5,0,Math.PI*2);ctx.fill();
  }
  const metres=100,pixels=metres*scale*zoom;ctx.strokeStyle='#8da7b7';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(W-28-pixels,H-22);ctx.lineTo(W-28,H-22);ctx.stroke();ctx.font='9px monospace';ctx.fillStyle='#9aafbf';ctx.fillText('100 m',W-28-pixels,H-30);
  $('buildingCount').textContent=data[stage].features.length+' buildings · '+(iso?'3D extrusion':'top view');
  $('mapLabel').textContent=stage==='after'?'CALIBRATED GEOMETRY':stage==='before'?'MAP WITH INJECTED ERRORS':'REFERENCE GEOMETRY';
}
function resize(){const r=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;W=r.width;H=r.height;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);draw()}
new ResizeObserver(resize).observe(canvas);
for(const btn of document.querySelectorAll('[data-stage]'))btn.onclick=()=>{stage=btn.dataset.stage;document.querySelectorAll('[data-stage]').forEach(b=>b.classList.toggle('active',b===btn));$('selection').hidden=true;selected=null;draw()};
$('cloudToggle').onchange=draw;$('losToggle').onchange=draw;
$('viewToggle').onclick=()=>{iso=!iso;$('viewToggle').textContent=iso?'Top view':'3D view';zoom=iso?.78:1;pan=[0,0];draw()};
$('reset').onclick=()=>{pan=[0,0];zoom=iso?.78:1;draw()};
canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY,...pan];moved=false;canvas.setPointerCapture(e.pointerId)};
canvas.onpointermove=e=>{if(drag){const dx=e.clientX-drag[0],dy=e.clientY-drag[1];if(Math.hypot(dx,dy)>3)moved=true;pan=[drag[2]+dx,drag[3]+dy];draw()}};
canvas.onpointerup=e=>{drag=null;if(moved)return;const r=canvas.getBoundingClientRect(),p=[e.clientX-r.left,e.clientY-r.top];
  function inside(ring){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c}return c}
  const found=[...projected].reverse().find(x=>inside(x.rings[0])&&!x.rings.slice(1).some(inside));
  $('selection').hidden=!found;
  if(found){const o=found.feature.properties;selected=o.id;$('selection').replaceChildren();const title=document.createElement('strong');title.textContent=o.id;$('selection').append(title);for(const text of [o.status.replaceAll('-',' '),`Height: ${o.height.toFixed(2)} m · base ${o.base.toFixed(2)} m`,`Overlap confidence: ${o.confidence.toFixed(2)} · ${o.support} returns`]){const d=document.createElement('div');d.textContent=text;$('selection').append(d)}}else selected=null;draw();};
canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.25,Math.min(8,zoom*Math.exp(-e.deltaY*.001)));draw()};
for(const id of ['shift','yaw','density'])$(id).oninput=()=>$(id+'Value').textContent=id==='density'?Math.round(+$(id).value*100)+'%':$(id).value+(id==='shift'?' m':'°');
async function load(){
  $('runStatus').textContent='Loading saved standard experiment…';
  try{const res=await fetch('/api/result/'+$('scenario').value);const v=await res.json();if(!res.ok)throw Error(v.error);update(v);$('runStatus').textContent='Saved standard experiment loaded. Exports refer to this standard run.';for(const id of ['shift','yaw','density']){$(id).value=id==='shift'?4:1;$(id).oninput()}}
  catch(e){$('runStatus').textContent=e.message+'. Run calibration to compute it.'}
}
$('scenario').onchange=load;
$('run').onclick=async()=>{
  $('run').disabled=true;$('runStatus').textContent='Extracting evidence → aligning geometry → evaluating changes…';
  const start=performance.now();
  try{const res=await fetch('/api/calibrate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario:$('scenario').value,shift:+$('shift').value,yaw:+$('yaw').value,density:+$('density').value})});const v=await res.json();if(!res.ok)throw Error(v.error);update(v);$('runStatus').textContent='Computed in '+((performance.now()-start)/1000).toFixed(2)+' s. Viewer shows this temporary run; downloads remain the saved standard experiment.'}
  catch(e){$('runStatus').textContent='Calibration failed: '+e.message}finally{$('run').disabled=false}
};
load();

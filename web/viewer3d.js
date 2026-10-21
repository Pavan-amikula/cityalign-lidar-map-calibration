import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

// All geometry uses metres. East/north/up -> Three.js east/up/-north.
const host=document.getElementById('scene3d');
let renderer,scene,camera,controls,world,cloud,grid,modelGroups={},view=null,state=null,origin=[0,0,0],extent=1;
const pickable=[],raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
let pointerStart=null;

function disposeWorld(){
  world.traverse(obj=>{obj.geometry?.dispose();if(Array.isArray(obj.material))obj.material.forEach(m=>m.dispose());else obj.material?.dispose()});
  world.clear();pickable.length=0;modelGroups={};
}

function coords(p){return new THREE.Vector3(p[0]-origin[0],p[2]-origin[2],-(p[1]-origin[1]));}

function fit(){
  if(!view)return;
  const box=new THREE.Box3().setFromObject(world),size=box.getSize(new THREE.Vector3()),target=box.getCenter(new THREE.Vector3());
  const distance=Math.max(size.x/Math.max(camera.aspect,.4),size.z,size.y*3)*1.28;
  extent=Math.max(size.x,size.z,100);
  controls.target.copy(target);
  camera.position.copy(target).add(new THREE.Vector3(distance*.64,distance*.78,distance*.92));
  camera.near=.1;camera.far=Math.max(10000,distance*20);camera.updateProjectionMatrix();controls.maxDistance=distance*6;controls.minDistance=2;controls.update();render();
}

function colorFor(code,z){
  const mode=document.getElementById('colorMode').value;
  if(mode==='uniform')return new THREE.Color('#b6c3d3');
  if(mode==='elevation')return new THREE.Color().setHSL(.66-Math.max(0,Math.min(1,(z-origin[2])/45))*.66,.78,.57);
  return new THREE.Color(code===2?'#9fa9b8':code===6?'#f0b65c':code===5?'#6d9e75':'#bb91cf');
}

function updateColors(){
  if(!cloud||!view)return;
  const values=cloud.geometry.attributes.color;
  view.points.forEach((p,i)=>{const c=colorFor(view.classes[i],p[2]);values.setXYZ(i,c.r,c.g,c.b)});values.needsUpdate=true;render();
}

function shapeFor(feature){
  const rings=feature.geometry.coordinates;
  const points=ring=>ring.slice(0,-1).map(p=>new THREE.Vector2(p[0]-origin[0],p[1]-origin[1]));
  const shape=new THREE.Shape(points(rings[0]));
  rings.slice(1).forEach(r=>shape.holes.push(new THREE.Path(points(r))));
  return shape;
}

function build(next){
  view=next;disposeWorld();
  const xs=view.points.map(p=>p[0]),ys=view.points.map(p=>p[1]),zs=view.points.map(p=>p[2]);
  origin=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2,Math.min(...zs)];
  const positions=new Float32Array(view.points.length*3),colors=new Float32Array(view.points.length*3);
  view.points.forEach((p,i)=>{const q=coords(p),c=colorFor(view.classes[i],p[2]);positions.set([q.x,q.y,q.z],i*3);colors.set([c.r,c.g,c.b],i*3)});
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  cloud=new THREE.Points(geometry,new THREE.PointsMaterial({size:+document.getElementById('pointSize').value,vertexColors:true,sizeAttenuation:false}));world.add(cloud);
  const size=Math.ceil(Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))/100)*100+200;
  grid=new THREE.GridHelper(size,size/50,0x525b68,0x373d46);grid.position.y=-.3;world.add(grid);
  for(const key of ['before','after','reference']){
    const group=new THREE.Group();modelGroups[key]=group;world.add(group);
    for(const feature of view[key].features){
      const p=feature.properties;
      const color=key==='after'?(p.status.includes('candidate')?0xb4a3dc:p.status.includes('review')?0xd4a15b:0x77a3e8):key==='reference'?0x96b4a5:0xa8afb9;
      const geometry=new THREE.ExtrudeGeometry(shapeFor(feature),{depth:p.height,bevelEnabled:false,steps:1,curveSegments:1});
      geometry.rotateX(-Math.PI/2);geometry.translate(0,p.base-origin[2],0);
      const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,transparent:true,opacity:.38,roughness:.9,metalness:0,depthWrite:false,side:THREE.DoubleSide}));
      mesh.userData={feature,stage:key};group.add(mesh);pickable.push(mesh);
      const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,30),new THREE.LineBasicMaterial({color,transparent:true,opacity:.9}));edges.userData.edges=true;group.add(edges);
    }
  }
  const linkGroup=new THREE.Group();linkGroup.name='links';world.add(linkGroup);
  fit();
}

function updateLinks(){
  const group=world.getObjectByName('links');if(!group||!view)return;
  group.children.forEach(o=>{o.geometry.dispose();o.material.dispose()});group.clear();
  if(!document.getElementById('losToggle').checked||state.compare)return;
  const links=view.links,tx=coords(links.tx);
  links.receivers.forEach((rx,i)=>{const geometry=new THREE.BufferGeometry().setFromPoints([tx,coords(rx)]);group.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color:links[state.stage][i]?0xd49462:0x789b87,transparent:true,opacity:.35})))});
}

function apply(){
  if(!state||!renderer)return;
  host.style.display=state.iso?'block':'none';document.getElementById('map').style.display=state.iso?'none':'block';
  if(!state.view)return;
  const changed=view!==state.view;if(changed)build(state.view);
  cloud.visible=document.getElementById('cloudToggle').checked;cloud.material.size=+document.getElementById('pointSize').value;
  grid.visible=document.getElementById('gridToggle').checked;
  const models=document.getElementById('geometryToggle').checked,edges=document.getElementById('wireToggle').checked;
  for(const [key,group]of Object.entries(modelGroups)){group.visible=models&&key===state.stage;group.children.forEach(obj=>{if(obj.userData.edges)obj.visible=edges;else{const active=obj.userData.feature.properties.id===state.selected;obj.material.opacity=active?.72:.38;obj.material.emissive.setHex(active?0x142b4a:0x000000)}})}
  updateLinks();resize();render();
}

function render(){
  if(!renderer||!state?.iso||!view)return;
  const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
  const rotation=camera.quaternion.clone().invert();
  const axes=[['X',new THREE.Vector3(1,0,0),'#d99186'],['Y',new THREE.Vector3(0,0,-1),'#95b79a'],['Z',new THREE.Vector3(0,1,0),'#8bafd9']];
  document.querySelector('.navigation-cube svg').innerHTML=axes.map(([name,axis,color])=>{axis.applyQuaternion(rotation);const x=25+axis.x*16,y=25-axis.y*16;return `<path d="M25 25L${x} ${y}" stroke="${color}" stroke-width="1.2"/><text x="${25+axis.x*23}" y="${28-axis.y*23}" fill="${color}" stroke="none" text-anchor="middle" font-size="8">${name}</text>`}).join('');
  if(state.compare){
    const visible=document.getElementById('geometryToggle').checked;
    renderer.setScissorTest(true);
    for(const [key,x,width]of [['before',0,w*state.split],['after',w*state.split,w*(1-state.split)]]){
      Object.entries(modelGroups).forEach(([k,g])=>g.visible=visible&&k===key);
      renderer.setScissor(x,0,width,h);renderer.render(scene,camera);
    }renderer.setScissorTest(false);
  }else renderer.render(scene,camera);
}

function resize(){
  if(!renderer)return;
  const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();render();
}

function select(event){
  if(!state?.iso||state.compare||!pointerStart||Math.hypot(event.clientX-pointerStart[0],event.clientY-pointerStart[1])>5)return;
  const bounds=renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);
  raycaster.setFromCamera(mouse,camera);
  const hits=raycaster.intersectObjects(pickable.filter(m=>modelGroups[m.userData.stage].visible),false);
  window.dispatchEvent(new CustomEvent('cityalign:select',{detail:hits[0]?.object.userData.feature||null}));
}

try{
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x262a30);renderer.outputColorSpace=THREE.SRGBColorSpace;host.append(renderer.domElement);
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(43,1,.1,20000);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;controls.screenSpacePanning=true;controls.maxPolarAngle=Math.PI*.49;
  world=new THREE.Group();scene.add(world);scene.add(new THREE.HemisphereLight(0xe8efff,0x465164,2));const key=new THREE.DirectionalLight(0xffffff,2);key.position.set(300,600,400);scene.add(key);
  controls.addEventListener('change',render);renderer.setAnimationLoop(()=>{if(state?.iso)controls.update()});
  renderer.domElement.addEventListener('pointerdown',e=>pointerStart=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',select);
  renderer.domElement.setAttribute('aria-label','Orbitable 3D LiDAR scene');renderer.domElement.tabIndex=0;
  new ResizeObserver(resize).observe(host);
  window.CityScene={sync(next){state=next;apply()},fit,zoom(factor){camera.position.sub(controls.target).multiplyScalar(1/factor).add(controls.target);controls.update();render()},setColors:updateColors,focus(feature){if(!feature)return;const ring=feature.geometry.coordinates[0],c=ring.slice(0,-1).reduce((s,p)=>[s[0]+p[0]/(ring.length-1),s[1]+p[1]/(ring.length-1)],[0,0]);const target=coords([c[0],c[1],feature.properties.base+feature.properties.height/2]);const delta=camera.position.clone().sub(controls.target);controls.target.copy(target);camera.position.copy(target).add(delta);controls.update();render()}};
  document.getElementById('rendererStatus').textContent='WebGL · Three.js';
  document.querySelector('.navigation-cube>span')?.remove();
  document.querySelector('.navigation-cube small').textContent='ENU';
  if(window.CityAlignState)window.CityScene.sync(window.CityAlignState());
}catch(error){
  document.getElementById('rendererStatus').textContent='2D fallback';
  window.dispatchEvent(new CustomEvent('cityalign:webgl-unavailable',{detail:error.message}));
}

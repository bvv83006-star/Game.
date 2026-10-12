import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Net } from './multiplayer.js';

/* ========== STORAGE ========== */
const S = {
  trans:localStorage.getItem('rr_trans')||'auto',
  gfx:localStorage.getItem('rr_gfx')||'medium',
  bloom:localStorage.getItem('rr_bloom')||'normal',
  traffic:+(localStorage.getItem('rr_traffic')||16),
  vol:+(localStorage.getItem('rr_vol')||60),
  paint:localStorage.getItem('rr_paint')||'#ff3b30',
  carId:localStorage.getItem('rr_car')||'sport'
};
const save=()=>Object.entries({rr_trans:S.trans,rr_gfx:S.gfx,rr_bloom:S.bloom,
  rr_traffic:S.traffic,rr_vol:S.vol,rr_paint:S.paint,rr_car:S.carId})
  .forEach(([k,v])=>localStorage.setItem(k,v));

/* ========== RENDERER ========== */
const canvas=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:S.gfx!=='low',powerPreference:'high-performance',stencil:false});
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
function applyGfx(){
  const dpr=devicePixelRatio;
  const pr=S.gfx==='low'?Math.min(dpr,1):S.gfx==='medium'?Math.min(dpr,1.5):
            S.gfx==='ultra'?Math.min(dpr,2):Math.min(dpr,1.75);
  renderer.setPixelRatio(pr);
  if(composer) composer.setPixelRatio(pr);
}
applyGfx();

/* ========== SCENE ========== */
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x03040a);
scene.fog=new THREE.FogExp2(0x05070f,0.0055);

/* sky dome */
{
  const g=new THREE.SphereGeometry(900,32,16);
  const m=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{top:{value:new THREE.Color(0x080b1a)},bot:{value:new THREE.Color(0x1a0d2e)},hor:{value:new THREE.Color(0xff2f6b)}},
    vertexShader:`varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec3 vP;uniform vec3 top;uniform vec3 bot;uniform vec3 hor;
      void main(){float h=normalize(vP).y;
        vec3 c=mix(hor,mix(bot,top,smoothstep(-0.3,0.5,h)),smoothstep(-0.15,0.15,h));
        gl_FragColor=vec4(c,1.0);}`
  });
  scene.add(new THREE.Mesh(g,m));
}

/* lights */
scene.add(new THREE.HemisphereLight(0x445a9e,0x0a0a14,0.85));
const moon=new THREE.DirectionalLight(0x9fc0ff,0.9); moon.position.set(-120,200,-80); scene.add(moon);
const fill=new THREE.DirectionalLight(0xff3d9e,0.35); fill.position.set(80,30,120); scene.add(fill);

/* stars */
{
  const g=new THREE.BufferGeometry();
  const p=new Float32Array(1200*3);
  for(let i=0;i<1200;i++){
    p[i*3]=(Math.random()-.5)*2000;
    p[i*3+1]=100+Math.random()*500;
    p[i*3+2]=(Math.random()-.5)*2000;
  }
  g.setAttribute('position',new THREE.BufferAttribute(p,3));
  scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xc8d5ff,size:1.6,sizeAttenuation:true,fog:false,transparent:true,opacity:.85})));
}

/* ========== CAMERA ========== */
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,0.1,900);

/* ========== POST-PROCESSING ========== */
let composer=null;
function setupComposer(){
  if(S.bloom==='off'||S.gfx==='low'){ composer=null; return; }
  composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  const pass=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),
    S.bloom==='heavy'?1.35:0.85,0.75,0.15);
  composer.addPass(pass);
  composer.addPass(new OutputPass());
  composer.setSize(innerWidth,innerHeight);
  applyGfx();
}

/* ========== PHYSICS ========== */
const world=new CANNON.World({gravity:new CANNON.Vec3(0,-22,0)});
world.broadphase=new CANNON.SAPBroadphase(world);
world.defaultContactMaterial.friction=0.32;
world.defaultContactMaterial.restitution=0.05;
const groundBody=new CANNON.Body({mass:0,shape:new CANNON.Plane()});
groundBody.quaternion.setFromEuler(-Math.PI/2,0,0);
world.addBody(groundBody);

/* ========== TRACK ========== */
const TILE_LEN=80,NUM_TILES=11,ROAD_HALF=13,LANES=[-9.5,-3.2,3.2,9.5];
const matAsphalt=new THREE.MeshStandardMaterial({color:0x0c0e16,roughness:.42,metalness:.55});
const matGround=new THREE.MeshStandardMaterial({color:0x04060c,roughness:.9});
const matLine=new THREE.MeshBasicMaterial({color:0xffe9a8});
const matBarrier=new THREE.MeshStandardMaterial({color:0x14182a,roughness:.5,metalness:.7});
const matBuild=new THREE.MeshStandardMaterial({color:0x0a0d16,roughness:.85,metalness:.2});
const matPole=new THREE.MeshStandardMaterial({color:0x1a1f30,roughness:.6,metalness:.7});
const matLamp=new THREE.MeshBasicMaterial({color:0xfff2b8});
const matNeonR=new THREE.MeshBasicMaterial({color:0xff3b60});
const matNeonM=new THREE.MeshBasicMaterial({color:0x3cf2c4});
const matNeonB=new THREE.MeshBasicMaterial({color:0x3d7dff});
const matNeonP=new THREE.MeshBasicMaterial({color:0xff3d9e});
const neonPool=[matNeonR,matNeonM,matNeonB,matNeonP];

{ const g=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000),matGround);
  g.rotation.x=-Math.PI/2; g.position.y=-0.02; scene.add(g); }

const geoRoad=new THREE.PlaneGeometry(ROAD_HALF*2,TILE_LEN);
const geoDash=new THREE.PlaneGeometry(.24,3.6);
const geoBarrier=new THREE.BoxGeometry(.6,1.2,TILE_LEN);
const geoBuild=new THREE.BoxGeometry(1,1,1);
const geoBand=new THREE.BoxGeometry(1,.35,1);
const geoPole=new THREE.CylinderGeometry(.12,.12,7.2,6);
const geoLamp=new THREE.SphereGeometry(.36,8,6);
const geoGlow=new THREE.PlaneGeometry(3.2,3.2);
const geoEdge=new THREE.BoxGeometry(.32,.08,TILE_LEN);
const geoWin=new THREE.PlaneGeometry(.7,.4);

const texGlow=(()=>{
  const c=document.createElement('canvas');c.width=c.height=128;
  const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,255,255,1)');
  g.addColorStop(.35,'rgba(255,255,255,.35)');
  g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
})();
const matGlowAdd=new THREE.MeshBasicMaterial({map:texGlow,transparent:true,
  blending:THREE.AdditiveBlending,depthWrite:false,fog:false});

const tiles=[];
function buildTile(z){
  const tile=new THREE.Group(); tile.position.z=z;

  const road=new THREE.Mesh(geoRoad,matAsphalt);
  road.rotation.x=-Math.PI/2; road.position.y=.01; tile.add(road);

  for(const lx of[-6.4,0,6.4]){
    for(let dz=-TILE_LEN/2+5;dz<TILE_LEN/2;dz+=11){
      const d=new THREE.Mesh(geoDash,matLine);
      d.rotation.x=-Math.PI/2; d.position.set(lx,.02,dz); tile.add(d);
    }
  }
  for(const sx of[-1,1]){
    const e=new THREE.Mesh(geoEdge,sx<0?matNeonM:matNeonR);
    e.position.set(sx*(ROAD_HALF-.7),.06,0); tile.add(e);
    const b=new THREE.Mesh(geoBarrier,matBarrier);
    b.position.set(sx*(ROAD_HALF+.4),.6,0); tile.add(b);
    for(const dz of[-TILE_LEN/4,0,TILE_LEN/4]){
      const p=new THREE.Mesh(geoPole,matPole);
      p.position.set(sx*(ROAD_HALF+1.8),3.6,dz); tile.add(p);
      const l=new THREE.Mesh(geoLamp,matLamp);
      l.position.set(sx*(ROAD_HALF+1.2),7.0,dz); tile.add(l);
      const gl=new THREE.Mesh(geoGlow,matGlowAdd);
      gl.position.set(sx*(ROAD_HALF+1.2),7.0,dz); gl.scale.setScalar(2.6); gl.renderOrder=5; tile.add(gl);
    }
  }
  for(const sx of[-1,1]){
    for(let i=0;i<4;i++){
      const w=7+Math.random()*10,d=7+Math.random()*10,h=12+Math.random()*70;
      const b=new THREE.Mesh(geoBuild,matBuild);
      b.scale.set(w,h,d);
      b.position.set(sx*(22+Math.random()*26),h/2,-TILE_LEN/2+Math.random()*TILE_LEN);
      tile.add(b);
      const band=new THREE.Mesh(geoBand,neonPool[(Math.random()*neonPool.length)|0]);
      band.scale.set(w+.4,1,d+.4);
      band.position.set(b.position.x,h*(.55+Math.random()*.4),b.position.z);
      tile.add(band);
      if(Math.random()>.4){
        const v=new THREE.Mesh(new THREE.BoxGeometry(.15,h*.8,.15),neonPool[(Math.random()*neonPool.length)|0]);
        v.position.set(b.position.x+(Math.random()-.5)*w*.7,h*.45,b.position.z+d*.5);
        tile.add(v);
      }
      if(Math.random()>.3){
        for(let k=0;k<3;k++){
          const win=new THREE.Mesh(geoWin,new THREE.MeshBasicMaterial({color:0xffc247}));
          win.position.set(b.position.x+(Math.random()-.5)*w*.7,2+Math.random()*h*.75,b.position.z+d*.51);
          tile.add(win);
        }
      }
    }
  }
  scene.add(tile);
  return tile;
}
for(let i=0;i<NUM_TILES;i++) tiles.push(buildTile(-320+i*TILE_LEN));

/* ========== CARS ========== */
const CARS=[
  {id:'sport',name:'SPORT',color:'#ff3b30',power:1600,grip:3.4,top:64},
  {id:'muscle',name:'MUSCLE',color:'#3d7dff',power:2100,grip:2.9,top:70},
  {id:'drift',name:'DRIFT',color:'#c74dff',power:1500,grip:2.3,top:60},
  {id:'offroad',name:'OFFROAD',color:'#3cf2c4',power:1750,grip:3.8,top:54},
  {id:'luxury',name:'LUXURY',color:'#ffc247',power:1550,grip:3.6,top:66},
  {id:'racer',name:'RACER',color:'#ff3d9e',power:1900,grip:3.1,top:74}
];
const gearRatios=[0,2.10,1.55,1.20,0.98,0.83,0.72];
const statsFor=id=>CARS.find(c=>c.id===id)||CARS[0];

const matTyre=new THREE.MeshStandardMaterial({color:0x08080c,roughness:.95});
const matRim=new THREE.MeshStandardMaterial({color:0xc8c8d0,metalness:.9,roughness:.25});
const matGlass=new THREE.MeshStandardMaterial({color:0x080c15,roughness:.05,metalness:.95});
const matHead=new THREE.MeshBasicMaterial({color:0xfff6d8});
const matTail=new THREE.MeshBasicMaterial({color:0xff1a1a});
const matShadow=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.5,depthWrite:false});

const geoBody=new THREE.BoxGeometry(1.9,.62,4.0);
const geoBodyUp=new THREE.BoxGeometry(1.6,.42,2.4);
const geoCabin=new THREE.BoxGeometry(1.5,.5,1.9);
const geoWheel=new THREE.CylinderGeometry(.42,.42,.34,16); geoWheel.rotateZ(Math.PI/2);
const geoRimG=new THREE.CylinderGeometry(.24,.24,.36,10); geoRimG.rotateZ(Math.PI/2);
const geoLight=new THREE.BoxGeometry(.4,.14,.1);
const geoShadow=new THREE.CircleGeometry(1.5,24);
const geoHeadGlow=new THREE.PlaneGeometry(1.6,2.2);

function createCarMesh(colorHex){
  const g=new THREE.Group();
  const paint=new THREE.MeshStandardMaterial({color:colorHex,roughness:.22,metalness:.85});
  g.add(Object.assign(new THREE.Mesh(geoBody,paint),{position:new THREE.Vector3(0,-0.05,0)}));
  const up=new THREE.Mesh(geoBodyUp,paint); up.position.set(0,.35,-.3); g.add(up);
  const cabin=new THREE.Mesh(geoCabin,matGlass); cabin.position.set(0,.62,-.2); g.add(cabin);
  const wheels=[];
  const wPts=[[0.9,1.35],[-0.9,1.35],[0.9,-1.35],[-0.9,-1.35]];
  for(const [x,z] of wPts){
    const w=new THREE.Mesh(geoWheel,matTyre); w.position.set(x,-.5,z); g.add(w);
    const r=new THREE.Mesh(geoRimG,matRim); r.position.set(x,-.5,z); g.add(r);
    wheels.push(w);
  }
  for(const x of[-0.6,0.6]){
    const hl=new THREE.Mesh(geoLight,matHead); hl.position.set(x,.02,2.02); g.add(hl);
    const tl=new THREE.Mesh(geoLight,matTail); tl.position.set(x,.02,-2.02); g.add(tl);
    const gl=new THREE.Mesh(geoHeadGlow,matGlowAdd.clone());
    gl.material.opacity=.75; gl.position.set(x,.02,2.1); gl.rotation.x=-Math.PI/2; gl.renderOrder=6; g.add(gl);
  }
  scene.add(g);
  return {group:g,wheels,paint};
}

function createCar(colorHex,stats,startX,startZ,sim){
  const {group,wheels,paint}=createCarMesh(colorHex);
  const blob=new THREE.Mesh(geoShadow,matShadow);
  blob.rotation.x=-Math.PI/2; blob.position.y=.04; scene.add(blob);
  const car={group,blob,wheels,paint,stats,sim,chassisBody:null,vehicle:null,
    nitro:100,gear:1,shiftCd:0,wheelSpin:0,alive:true};
  if(sim){
    const chassisBody=new CANNON.Body({mass:260});
    chassisBody.addShape(new CANNON.Box(new CANNON.Vec3(.95,.34,1.95)));
    chassisBody.position.set(startX,1.6,startZ);
    chassisBody.angularDamping=.4; chassisBody.linearDamping=.03;
    world.addBody(chassisBody); car.chassisBody=chassisBody;
    const vehicle=new CANNON.RaycastVehicle({chassisBody,indexRightAxis:0,indexUpAxis:1,indexForwardAxis:2});
    const wo={radius:.42,directionLocal:new CANNON.Vec3(0,-1,0),
      suspensionStiffness:42,suspensionRestLength:.46,frictionSlip:stats.grip,
      dampingRelaxation:2.4,dampingCompression:4.6,maxSuspensionForce:120000,
      rollInfluence:.015,axleLocal:new CANNON.Vec3(-1,0,0),
      chassisConnectionPointLocal:new CANNON.Vec3(.9,-.32,1.35),
      maxSuspensionTravel:.34,customSlidingRotationalSpeed:-30,useCustomSlidingRotationalSpeed:true};
    for(const [x,z] of[[.9,1.35],[-.9,1.35],[.9,-1.35],[-.9,-1.35]]){
      wo.chassisConnectionPointLocal.set(x,-.32,z); vehicle.addWheel(wo);
    }
    vehicle.addToWorld(world); car.vehicle=vehicle;
  }
  return car;
}

const myCarStats=statsFor(S.carId);
const myCar=createCar(S.paint,myCarStats,0,0,true);
/* other players' cars — created on demand up to 3 */
const otherCars=[];

/* ========== TRAFFIC ========== */
const traffic=[]; const trafficById=new Map();
const trafficPalette=[0xcfd6e8,0x8892a8,0xd93b3b,0x3bd97a,0x3b6fd9,0xe8c33b,0x9b3bd9,0xff7f30];
const trafMats=trafficPalette.map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.4,metalness:.6}));
const geoTrafBody=new THREE.BoxGeometry(1.9,1.1,4.1);
const geoTrafCabin=new THREE.BoxGeometry(1.55,.55,2.0);
const geoTrafTail=new THREE.BoxGeometry(.34,.14,.1);
const geoTrafHead=new THREE.BoxGeometry(.34,.14,.1);

function createTrafficMesh(ci){
  const g=new THREE.Group();
  g.add(new THREE.Mesh(geoTrafBody,trafMats[ci%trafMats.length]));
  const c=new THREE.Mesh(geoTrafCabin,matGlass); c.position.set(0,.72,-.15); g.add(c);
  for(const x of[-0.6,0.6]){
    const t=new THREE.Mesh(geoTrafTail,matTail); t.position.set(x,.1,-2.07); g.add(t);
    const h=new THREE.Mesh(geoTrafHead,matHead); h.position.set(x,.1,2.07); g.add(h);
  }
  scene.add(g); return g;
}
let nextTrafficId=1;
function spawnTrafficHost(){
  const lane=LANES[(Math.random()*LANES.length)|0];
  const leadZ=myCar.chassisBody?myCar.chassisBody.position.z:-500;
  const z=leadZ+240+Math.random()*280;
  const ci=(Math.random()*trafficPalette.length)|0;
  const body=new CANNON.Body({mass:0});
  body.addShape(new CANNON.Box(new CANNON.Vec3(.95,.55,2.05)));
  body.position.set(lane+(Math.random()-.5)*1.2,.65,z);
  world.addBody(body);
  const id=nextTrafficId++;
  const group=createTrafficMesh(ci);
  const entry={id,body,group,speed:12+Math.random()*18,colorIdx:ci};
  traffic.push(entry); trafficById.set(id,entry);
}
function removeTrafficHost(id){
  const e=trafficById.get(id); if(!e) return;
  world.removeBody(e.body); scene.remove(e.group);
  trafficById.delete(id);
  const i=traffic.indexOf(e); if(i>=0) traffic.splice(i,1);
}
function setTrafficGuest(id,x,z,ci){
  let e=trafficById.get(id);
  if(!e){ e={id,group:createTrafficMesh(ci),colorIdx:ci}; trafficById.set(id,e); }
  e.group.position.set(x,.65,z);
}
function pruneTrafficGuest(alive){
  for(const [id,e] of trafficById){
    if(!alive.has(id)){ scene.remove(e.group); trafficById.delete(id); }
  }
}
function syncTrafficCountHost(){
  while(traffic.length<S.traffic) spawnTrafficHost();
  while(traffic.length>S.traffic) removeTrafficHost(traffic[traffic.length-1].id);
}

/* ========== INPUT ========== */
const keys=Object.create(null);
const BLOCK=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftRight'];
addEventListener('keydown',e=>{
  if(BLOCK.includes(e.code)) e.preventDefault();
  keys[e.code]=true;
  if(e.code==='Escape') togglePause();
  if(e.code==='KeyC') cycleCamera();
  if(e.code==='KeyR'&&myCar.sim) resetCar(myCar);
});
addEventListener('keyup',e=>{keys[e.code]=false;});

const CTRL={fwd:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',nos:'ShiftLeft',up:'KeyQ',down:'KeyE'};
const remoteInputs=new Map(); // playerId -> input

/* ========== DRIVING ========== */
function resetCar(car){
  if(!car.chassisBody) return;
  car.chassisBody.position.y=2.0;
  car.chassisBody.velocity.set(0,0,0);
  car.chassisBody.angularVelocity.set(0,0,0);
  car.chassisBody.quaternion.setFromEuler(0,0,0);
}
const _fwd=new CANNON.Vec3(),_up=new CANNON.Vec3();
function driveCar(car,inputs,dt,manual){
  if(!car.sim||!car.vehicle||!car.chassisBody) return;
  const body=car.chassisBody,v=body.velocity;
  body.quaternion.vmult(new CANNON.Vec3(0,0,1),_fwd);
  body.quaternion.vmult(new CANNON.Vec3(0,1,0),_up);
  const speed=v.length(),fwdSpeed=v.dot(_fwd),kmh=speed*3.6;
  car.shiftCd=Math.max(0,car.shiftCd-dt);
  if(manual){
    if(inputs.up&&car.gear<6&&car.shiftCd===0){car.gear++;car.shiftCd=.16;}
    if(inputs.down&&car.gear>1&&car.shiftCd===0){car.gear--;car.shiftCd=.16;}
    if(car.gear>1&&kmh<car.gear*6) car.gear--;
  }else{
    const t=Math.min(6,Math.max(1,Math.floor(kmh/17)+1));
    if(t!==car.gear&&car.shiftCd===0){car.gear=t;car.shiftCd=.1;}
  }
  const ratio=gearRatios[car.gear];
  let engine=0,brake=0;
  const maxF=car.stats.power*ratio;
  if(inputs.f) engine=maxF;
  if(inputs.b){ if(fwdSpeed>1.2) brake=60; else engine=-maxF*.5; }
  let boost=1;
  if(inputs.n&&car.nitro>1&&engine>0&&fwdSpeed>1){
    boost=1.9; car.nitro=Math.max(0,car.nitro-dt*30);
  }else{ car.nitro=Math.min(100,car.nitro+dt*8); }
  if(kmh>car.stats.top*3.6) engine*=.15;
  car.vehicle.applyEngineForce(engine*boost,2);
  car.vehicle.applyEngineForce(engine*boost,3);
  car.vehicle.applyEngineForce(0,0); car.vehicle.applyEngineForce(0,1);
  for(let i=0;i<4;i++) car.vehicle.applyBrake(brake,i);
  const steerMax=.6*(1-Math.min(kmh/240,.7));
  let steer=0;
  if(inputs.l) steer=steerMax;
  if(inputs.r) steer=-steerMax;
  car.vehicle.setSteeringValue(steer,0);
  car.vehicle.setSteeringValue(steer,1);
  body.applyForce(new CANNON.Vec3(0,-speed*5,0),body.position);
  if(_up.y<.25||body.position.y<-6) resetCar(car);
  car.wheelSpin+=(fwdSpeed*dt)/.42;
  for(const w of car.wheels) w.rotation.x=car.wheelSpin;
}

/* ========== CAMERA ========== */
let camMode=0;
const CAM_MODES=['CHASE','FAR','HOOD'];
function cycleCamera(){ camMode=(camMode+1)%3; showToast(CAM_MODES[camMode]); }

const _tmpP=new THREE.Vector3(),_tmpL=new THREE.Vector3();
let menuAngle=0;
function updateCamera(dt,mode){
  if(mode==='menu'){
    menuAngle+=dt*0.35;
    const r=9;
    const tx=0,tz=0;
    camera.position.set(Math.sin(menuAngle)*r,3.2+Math.sin(menuAngle*1.3)*0.5,Math.cos(menuAngle)*r);
    camera.lookAt(tx,1.0,tz);
    camera.fov+=(60-camera.fov)*Math.min(1,dt*3);
    camera.updateProjectionMatrix();
    return;
  }
  const p=myCar.chassisBody?myCar.chassisBody.position:myCar.group.position;
  const q=myCar.chassisBody?myCar.chassisBody.quaternion:myCar.group.quaternion;
  const fwd=new THREE.Vector3(0,0,1).applyQuaternion(q);
  const spd=myCar.chassisBody?myCar.chassisBody.velocity.length():0;
  let back,high,ahead;
  if(camMode===0){back=9.5;high=3.8;ahead=8;}
  else if(camMode===1){back=16;high=7.0;ahead=12;}
  else{back=-0.3;high=0.9;ahead=16;}
  _tmpP.set(p.x-fwd.x*back,p.y+high,p.z-fwd.z*back);
  camera.position.lerp(_tmpP,camMode===2?1:1-Math.pow(0.0014,dt));
  _tmpL.set(p.x+fwd.x*ahead,p.y+(camMode===2?.8:1.2),p.z+fwd.z*ahead);
  camera.lookAt(_tmpL);
  const targetFov=72+Math.min(spd*.95,26);
  camera.fov+=(targetFov-camera.fov)*Math.min(1,dt*3.5);
  camera.updateProjectionMatrix();
}

/* ========== HUD ========== */
const el=id=>document.getElementById(id);
let hudTick=0,fpsTick=0,frames=0;
function updateHud(){
  const spd=myCar.chassisBody?myCar.chassisBody.velocity.length()*3.6:0;
  el('spd').textContent=spd.toFixed(0);
  el('gear').textContent=myCar.gear||'N';
  el('nosBar').style.width=myCar.nitro+'%';
  el('boostBar').style.width=Math.min(100,spd/2.2)+'%';
}

/* ========== UI ========== */
function showToast(txt){
  const t=el('toast');
  t.textContent=txt;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),900);
}
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const s=el('screen-'+id);
  if(s) s.classList.add('active');
  if(id==='main'||id==='play'||id==='garage'||id==='settings'||id==='controls') mode='menu';
  el('hud').classList.remove('on');
  el('app').style.pointerEvents='auto';
  canvas.style.pointerEvents='none';
}
document.querySelectorAll('[data-goto]').forEach(b=>{
  b.addEventListener('click',()=>showScreen(b.dataset.goto));
});
let mode='menu';
let running=false,paused=false;

/* garage */
function buildCarList(){
  const list=el('carList'); list.innerHTML='';
  CARS.forEach(c=>{
    const d=document.createElement('div');
    d.className='car'+(c.id===S.carId?' selected':'');
    d.innerHTML=`<div class="swatch" style="background:linear-gradient(160deg,${c.color},${c.color}cc)"></div>
      <div class="nm">${c.name}</div>
      <div class="st">PWR ${Math.round(c.power/22)} · GRIP ${c.grip.toFixed(1)} · TOP ${c.top}</div>`;
    d.onclick=()=>{
      S.carId=c.id; S.paint=c.color; save();
      applyPaint(); buildCarList(); buildPaint(); updatePreview();
    };
    list.appendChild(d);
  });
}
function buildPaint(){
  const row=el('paintRow'); row.innerHTML='';
  CARS.forEach(c=>{
    const b=document.createElement('button');
    b.style.background=c.color;
    b.title=c.name;
    if(c.color===S.paint) b.classList.add('selected');
    b.onclick=()=>{
      S.paint=c.color; S.carId=c.id; save();
      applyPaint(); buildPaint(); updatePreview();
    };
    row.appendChild(b);
  });
}
function applyPaint(){
  const st=statsFor(S.carId);
  myCar.paint.color.set(S.paint);
  myCar.stats=st;
}
function updatePreview(){
  const c=CARS.find(x=>x.id===S.carId)||CARS[0];
  el('previewName').textContent=c.name;
  el('previewStats').textContent=`PWR ${Math.round(c.power/22)} · GRIP ${c.grip.toFixed(1)} · TOP ${c.top}`;
}
buildCarList(); buildPaint(); updatePreview();

/* settings */
el('setGfx').value=S.gfx;
el('setBloom').value=S.bloom;
el('setTrans').value=S.trans;
el('setTraffic').value=S.traffic;
el('setVol').value=S.vol;
el('valTraffic').textContent=S.traffic;
el('valVol').textContent=S.vol;
el('setGfx').onchange=()=>{S.gfx=el('setGfx').value;save();applyGfx();};
el('setBloom').onchange=()=>{S.bloom=el('setBloom').value;save();setupComposer();};
el('setTrans').onchange=()=>{S.trans=el('setTrans').value;save();};
el('setTraffic').oninput=()=>{S.traffic=+el('setTraffic').value;el('valTraffic').textContent=S.traffic;save();
  if(mode==='race') syncTrafficCountHost();};
el('setVol').oninput=()=>{S.vol=+el('setVol').value;el('valVol').textContent=S.vol;save();};
el('btnWipe').onclick=()=>{localStorage.clear();location.reload();};

/* ========== MULTIPLAYER UI ========== */
el('modeSolo').onclick=()=>{ Net.role='solo'; startRace(); };
el('modeHost').onclick=()=>{
  showScreen('host');
  Net.onLobbyUpdate=()=>{
    el('playerCount').textContent=`(${Net.playerCount}/4)`;
    for(let i=1;i<4;i++){
      const el2=document.querySelector(`[data-slot="${i}"]`);
      const g=Net.guests.find(g=>g.id===i+1);
      if(g){ el2.classList.remove('empty'); el2.querySelector('.name').textContent='Player '+(i+1); }
      else { el2.classList.add('empty'); el2.querySelector('.name').textContent='Waiting…'; }
    }
  };
  Net.onInput=(id,input)=>{ remoteInputs.set(id,input); };
  Net.onDisconnect=(msg)=>{ el('hostStatus').textContent=msg; el('hostStatus').className='panel-status err'; };
  Net.host();
  el('codeDisplay').innerHTML=Net.code.split('').map(ch=>`<span>${ch}</span>`).join('');
  el('hostStatus').textContent='Waiting for players…';
  el('hostStatus').className='panel-status ok';
};
el('startHostRace').onclick=()=>{
  Net.startRace();
  startRace();
};
el('modeJoin').onclick=()=>{ showScreen('join'); setTimeout(()=>el('joinCode').focus(),100); };
el('joinCode').addEventListener('input',e=>{
  e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);
});
el('joinCode').addEventListener('keydown',e=>{ if(e.key==='Enter') el('joinBtn').click(); });
el('joinBtn').onclick=()=>{
  const code=el('joinCode').value.trim();
  if(code.length!==4){ el('joinStatus').textContent='Enter a 4-letter code'; el('joinStatus').className='panel-status err'; return; }
  el('joinStatus').textContent='Connecting…'; el('joinStatus').className='panel-status';
  Net.onState=(pkt)=>applyHostState(pkt);
  Net.onStart=()=>startRace();
  Net.onDisconnect=(msg)=>{ el('joinStatus').textContent=msg; el('joinStatus').className='panel-status err'; };
  Net.join(code,()=>{
    el('joinStatus').textContent='Connected! Waiting for host…';
    el('joinStatus').className='panel-status ok';
  },(err)=>{
    el('joinStatus').textContent='Error: '+err;
    el('joinStatus').className='panel-status err';
  });
};
Net.onDisconnect=msg=>{ showToast(msg||'DISCONNECTED'); setTimeout(()=>location.reload(),1500); };

/* ========== RACE ========== */
function startRace(){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  el('hud').classList.add('on');
  el('netPill').style.display=Net.role==='solo'?'none':'block';
  el('playersPill').style.display=Net.role==='solo'?'none':'block';
  el('playersPill').textContent=(Net.role==='host'?Net.playerCount+'/4':'2/4');
  el('whoLabel').textContent=Net.role==='host'?'PLAYER 1 (HOST)':Net.role==='guest'?'PLAYER 2 (YOU)':'PLAYER 1';

  mode='race'; running=true; paused=false;
  resetCar(myCar);
  const startX=Net.role==='guest'?3.5:-3.5;
  myCar.chassisBody.position.set(startX,1.6,0);
  myCar.nitro=100; myCar.gear=1;

  /* clear traffic */
  for(const e of [...traffic]) removeTrafficHost(e.id);

  if(Net.role==='host'){
    /* create remote car for each guest */
    otherCars.forEach(c=>{ if(c.chassisBody) world.removeBody(c.chassisBody); scene.remove(c.group); scene.remove(c.blob); });
    otherCars.length=0;
    Net.guests.forEach((g,i)=>{
      const lane=(i+1)%2===0?-9.5:9.5;
      const car=createCar('#3cf2c4',myCar.stats,lane,0,true);
      car.playerId=g.id;
      otherCars.push(car);
      remoteInputs.set(g.id,{f:false,b:false,l:false,r:false,n:false,up:false,down:false});
    });
    syncTrafficCountHost();
  } else if(Net.role==='solo'){
    syncTrafficCountHost();
  }

  showToast('GO!');
}

function applyHostState(pkt){
  /* pkt.cars = [[id,x,y,z,qx,qy,qz,qw,speed,gear,nitro], ...] */
  for(const row of pkt.cars){
    const [id,x,y,z,qx,qy,qz,qw,speed,gear,nitro]=row;
    if(id===Net.myId){
      /* update my remote visual */
      myCar.group.position.set(x,y,z);
      myCar.group.quaternion.set(qx,qy,qz,qw);
      myCar.blob.position.set(x,0.04,z);
    } else {
      let car=otherCars.find(c=>c.playerId===id);
      if(!car){ car=createCar('#ffc247',myCar.stats,x,y,false); car.playerId=id; otherCars.push(car); }
      car.group.position.set(x,y,z);
      car.group.quaternion.set(qx,qy,qz,qw);
      car.blob.position.set(x,0.04,z);
      car.remoteSpeed=speed; car.remoteGear=gear; car.remoteNitro=nitro;
    }
  }
  const alive=new Set();
  for(const [id,x,z,ci] of pkt.traffic){
    alive.add(id); setTrafficGuest(id,x,z,ci);
  }
  pruneTrafficGuest(alive);
}

function sendHostState(){
  const cars=[];
  /* my car */
  const c1=myCar.chassisBody;
  cars.push([0,c1.position.x,c1.position.y,c1.position.z,
    c1.quaternion.x,c1.quaternion.y,c1.quaternion.z,c1.quaternion.w,
    c1.velocity.length(),myCar.gear,Math.round(myCar.nitro)]);
  for(const car of otherCars){
    const c=car.chassisBody;
    cars.push([car.playerId,c.position.x,c.position.y,c.position.z,
      c.quaternion.x,c.quaternion.y,c.quaternion.z,c.quaternion.w,
      c.velocity.length(),car.gear,Math.round(car.nitro)]);
  }
  const tr=[];
  for(const e of traffic) tr.push([e.id,+e.body.position.x.toFixed(2),+e.body.position.z.toFixed(2),e.colorIdx]);
  Net.sendState({t:'s',cars,traffic:tr});
}

function sendGuestInput(){
  Net.sendInput({
    f:!!keys[CTRL.fwd],b:!!keys[CTRL.back],l:!!keys[CTRL.left],r:!!keys[CTRL.right],
    n:!!keys[CTRL.nos],up:!!keys[CTRL.up],down:!!keys[CTRL.down]
  });
}

function togglePause(force){
  if(!running) return;
  paused=force===undefined?!paused:force;
  el('screen-pause').classList.toggle('active',paused);
  el('app').style.pointerEvents=paused?'auto':'none';
}
el('resumeBtn').onclick=()=>togglePause(false);
el('toMenuBtn').onclick=()=>{
  running=false; paused=false;
  Net.disconnect();
  for(const e of [...traffic]) removeTrafficHost(e.id);
  otherCars.forEach(c=>{ if(c.chassisBody) world.removeBody(c.chassisBody); scene.remove(c.group); scene.remove(c.blob); });
  otherCars.length=0;
  myCar.chassisBody.position.set(0,1.6,0);
  resetCar(myCar);
  showScreen('main');
};

/* ========== LOOP ========== */
let last=performance.now(),netSendTick=0;
function animate(){
  requestAnimationFrame(animate);
  const now=performance.now();
  const dt=Math.min((now-last)/1000,1/25);
  last=now;
  frames++; fpsTick+=dt;
  if(fpsTick>0.5){ el('fps').textContent=(frames/fpsTick).toFixed(0)+' FPS'; frames=0; fpsTick=0; }

  if(running&&!paused){
    if(Net.role==='solo'||Net.role==='host'){
      const inp={f:!!keys[CTRL.fwd],b:!!keys[CTRL.back],l:!!keys[CTRL.left],r:!!keys[CTRL.right],
        n:!!keys[CTRL.nos],up:!!keys[CTRL.up],down:!!keys[CTRL.down]};
      driveCar(myCar,inp,dt,S.trans==='manual');
      for(const car of otherCars){
        const ri=remoteInputs.get(car.playerId)||{};
        driveCar(car,ri,dt,S.trans==='manual');
      }
      if(Net.role==='solo'||Net.role==='host'){
        simulateTrafficHost(dt);
        simulateTiles(myCar.chassisBody.position.z);
      }
    } else if(Net.role==='guest'){
      netSendTick+=dt;
      if(netSendTick>0.033){ netSendTick=0; sendGuestInput(); }
      simulateTiles(myCar.group.position.z);
    }

    if(Net.role==='host'){
      netSendTick+=dt;
      if(netSendTick>0.05){ netSendTick=0; sendHostState(); }
    }

    /* sync visuals for local sims */
    for(const car of [myCar,...otherCars]){
      if(!car.sim||!car.chassisBody) continue;
      car.group.position.copy(car.chassisBody.position);
      car.group.quaternion.copy(car.chassisBody.quaternion);
      car.blob.position.set(car.chassisBody.position.x,0.04,car.chassisBody.position.z);
    }

    updateCamera(dt,'race');
    hudTick+=dt;
    if(hudTick>0.08){ hudTick=0; updateHud(); }
  } else if(mode==='menu'){
    updateCamera(dt,'menu');
  }

  if(composer) composer.render();
  else renderer.render(scene,camera);
}

function simulateTrafficHost(dt){
  const trailZ=myCar.chassisBody?myCar.chassisBody.position.z:0;
  for(const e of traffic){
    e.body.position.z+=e.speed*dt;
    e.body.aabbNeedsUpdate=true;
    e.group.position.set(e.body.position.x,.65,e.body.position.z);
  }
  for(let i=traffic.length-1;i>=0;i--){
    if(traffic[i].body.position.z<trailZ-100){ removeTrafficHost(traffic[i].id); spawnTrafficHost(); }
  }
  syncTrafficCountHost();
}
function simulateTiles(leadZ){
  for(const tile of tiles){
    if(tile.position.z<leadZ-240){
      let maxZ=-Infinity;
      for(const t of tiles) maxZ=Math.max(maxZ,t.position.z);
      tile.position.z=maxZ+TILE_LEN;
    }
  }
}

/* ========== RESIZE ========== */
addEventListener('resize',()=>{
  renderer.setSize(innerWidth,innerHeight);
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  if(composer) composer.setSize(innerWidth,innerHeight);
  applyGfx();
});

/* mouse rotate menu */
let mouseDown=false,lastX=0;
canvas.addEventListener('mousedown',e=>{ if(mode==='menu'){mouseDown=true;lastX=e.clientX;} });
canvas.addEventListener('mouseup',()=>mouseDown=false);
canvas.addEventListener('mousemove',e=>{
  if(mouseDown&&mode==='menu'){ menuAngle+=(e.clientX-lastX)*0.008; lastX=e.clientX; }
});

/* ========== INIT ========== */
setupComposer();
animate();

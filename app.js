/* TGD - The Grand Design | Mark I
   Script detection: IN/OUT divider lines -> sequences within scenes.
   Data model: localStorage tgd.v1 */
"use strict";
const LS_KEY="tgd.v1";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

/* ---------- state ---------- */
let S=load()||{projectTitle:"",scriptText:"",dividers:[],breakdowns:{},acceptedAuto:false,theme:"auto"};
function load(){try{return JSON.parse(localStorage.getItem(LS_KEY))}catch(e){return null}}
function save(){localStorage.setItem(LS_KEY,JSON.stringify(S))}

/* ---------- screenplay parsing ---------- */
const SCENE_RE=/^\s*((INT|EXT|EST|INT\.?\/EXT|I\/E)[\.\s])/i;
const CHAR_RE=/^\s*[A-Z][A-Z0-9 '\-\.\(\)]{1,29}$/;
function lines(){return S.scriptText.split(/\r?\n/)}
function parseScenes(ls){
  const sc=[];let cur=null;
  ls.forEach((t,i)=>{
    if(SCENE_RE.test(t)&&t.trim().length>3){
      cur={heading:t.trim(),start:i,end:i,divs:[]};sc.push(cur);
    }else if(cur){cur.end=i}
  });
  return sc;
}
function lineKind(t){
  if(!t.trim())return"blank";
  if(SCENE_RE.test(t))return"scene";
  if(CHAR_RE.test(t.trim()))return"char";
  const tr=t.trim();
  if(/^\(.*\)$/.test(tr))return"paren";
  if(/^(CUT TO|FADE|SMASH|MATCH|DISSOLVE|BACK TO|CONTINUED)/.test(tr.toUpperCase())&&tr===tr.toUpperCase())return"trans";
  return"action";
}

/* ---------- dividers & sequences ---------- */
/* divider: {id, line (boundary index: sequence starts at this line), auto:bool, accepted:bool}
   boundary index = the line number where the following content begins. Sorted by line; odd=IN, even=OUT. */
function sortedDivs(){return [...S.dividers].sort((a,b)=>a.line-b.line)}
function divRole(idx){return idx%2===0?"IN":"OUT"}
function sequences(){
  const ds=sortedDivs(),out=[],ls=lines(),sc=parseScenes(ls);
  for(let i=0;i<ds.length;i+=2){
    const din=ds[i],dout=ds[i+1]||null;
    const start=din.line,end=dout?dout.line:ls.length;
    const scn=sc.find(s=>start>=s.start&&start<=s.end)||sc.find(s=>start<s.start)||sc[0]||null;
    out.push({id:din.id,inDiv:din,outDiv:dout,start,end,scene:scn,scIdx:sc.indexOf(scn),open:!dout});
  }
  return out;
}
function sceneSequences(scIdx){
  const sc=parseScenes(lines())[scIdx];
  return sequences().filter(q=>q.scene===sc);
}

/* ---------- views ---------- */
let VIEW="script", SEQ_SEL=null, MODE="cursor";
function go(v){VIEW=v;render();
  $$("nav button").forEach(b=>b.classList.toggle("on",b.dataset.v===v));
  window.scrollTo({top:0});
}

/* ---------- render ---------- */
function render(){
  const old=$("#tbox");if(old)old.remove();
  const app=$("#app");app.innerHTML="";
  if(VIEW==="script")renderScript(app);
  else if(VIEW==="macro")renderMacro(app);
  else if(VIEW==="breakdown")renderBreakdown(app);
  else if(VIEW==="settings")renderSettings(app);
  requestAnimationFrame(placeDividers);
}

/* ===== SCRIPT VIEW ===== */
function renderScript(app){
  const hd=el(`<div><div class="hdsp"></div><h1>Script</h1><div class="sub">${S.projectTitle?esc(S.projectTitle.toUpperCase())+" • ":""}${S.scriptText.trim()?lines().length+" LINES":""}</div></div>`);
  app.appendChild(hd);
  if(!S.scriptText.trim()){renderImport(app);return}
  /* toolbar (TradingView-style) */
  const tb=el(`<div class="tbox" id="tbox">
    <button data-m="cursor" title="Select / move">${ico.cursor}</button>
    <button data-m="line" title="Divider line">${ico.hline}</button>
    <button data-m="draw" title="Freehand draw">${ico.draw}</button>
    <button data-m="auto" title="Auto-detect sequences">${ico.auto}</button>
    <button data-m="trash" title="Delete selected">${ico.trash}</button>
  </div>`);
  tb.querySelectorAll("button").forEach(b=>{
    b.classList.toggle("on",b.dataset.m===MODE);
    b.onclick=()=>setMode(b.dataset.m);
  });
  document.body.appendChild(tb);
  /* script page */
  const page=el(`<div class="page" id="page"></div>`);
  const inner=el(`<div class="ptext" id="ptext"></div>`);
  lines().forEach((t,i)=>{
    const k=lineKind(t);
    const d=el(`<div class="ln ${k}" data-i="${i}">${esc(t)||"&nbsp;"}</div>`);
    inner.appendChild(d);
  });
  page.appendChild(inner);
  /* divider layer */
  const layer=el(`<div class="dlayer" id="dlayer"></div>`);
  page.appendChild(layer);
  /* draw canvas */
  const cv=el(`<canvas class="dcv" id="dcv"></canvas>`);
  page.appendChild(cv);
  app.appendChild(page);
  /* hint bar */
  const hint=el(`<div class="hintbar" id="hintbar"></div>`);
  app.appendChild(hint);
  updateHint();
  bindPage(page,cv);
  renderImportRow(app);
}
function updateHint(){
  const h=$("#hintbar");if(!h)return;
  const seqs=sequences(),open=seqs.filter(q=>q.open).length;
  const n=seqs.length;
  h.textContent=n?`${n} SEQUENCE${n>1?"S":""}${open?" • 1 OPEN (NEEDS OUT)":""}`:"DRAW A DIVIDER ACROSS THE SCRIPT TO MARK AN IN";
}
function renderImport(app){
  const c=el(`<div class="card imp">
    <h2>Import your script</h2>
    <div class="sub2">Paste screenplay text or load a file (PDF or text). Scene headings (INT. / EXT.) are detected automatically.</div>
    <textarea id="impText" rows="10" placeholder=""></textarea>
    <div class="rowbtns">
      <button class="btn" id="impGo">LOAD TEXT</button>
      <button class="btn" id="impFile">CHOOSE FILE</button>
      <input type="file" id="impInput" accept="application/pdf,text/plain,.pdf,.txt,.md,.fountain" hidden>
    </div>
  </div>`);
  app.appendChild(c);
  $("#impGo").onclick=()=>{const t=$("#impText").value;if(t.trim()){S.scriptText=t;S.dividers=[];S.breakdowns={};S.acceptedAuto=false;save();render();}};
  $("#impFile").onclick=()=>$("#impInput").click();
  $("#impInput").onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    if(f.type==="application/pdf"||f.name.toLowerCase().endsWith(".pdf")){
      try{const t=await pdfText(f);if(t.trim()){S.scriptText=t;S.dividers=[];S.breakdowns={};S.acceptedAuto=false;save();render();}else alertInline(app,"Could not read text from that PDF.")}
      catch(err){alertInline(app,"PDF import failed - paste the text instead.")}
    }else{
      const t=await f.text();S.scriptText=t;S.dividers=[];S.breakdowns={};S.acceptedAuto=false;save();render();
    }
  };
}
function renderImportRow(app){
  const r=el(`<div class="rowbtns" style="margin:14px 2px 0">
    <button class="btn" id="reImp">REPLACE SCRIPT</button>
  </div>`);
  r.querySelector("#reImp").onclick=()=>{
    confirmInline(r,"Replace the script and clear all dividers and breakdowns?","REPLACE",()=>{S.scriptText="";S.dividers=[];S.breakdowns={};S.acceptedAuto=false;save();render();});
  };
  app.appendChild(r);
}
function alertInline(app,msg){const a=el(`<div class="warn">${esc(msg)}</div>`);app.appendChild(a)}
async function pdfText(f){
  if(!window.pdfjsLib){
    await new Promise((res,rej)=>{const s=document.createElement("script");s.src="pdf.min.js";s.onload=res;s.onerror=rej;document.head.appendChild(s)});
    pdfjsLib.GlobalWorkerOptions.workerSrc="pdf.worker.min.js";
  }
  const buf=await f.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  let out="";
  for(let p=1;p<=pdf.numPages;p++){
    const pg=await pdf.getPage(p),tc=await pg.getTextContent();
    let lastY=null;
    for(const it of tc.items){
      const y=it.transform[5];
      if(lastY!==null&&Math.abs(y-lastY)>2)out+="\n";
      out+=it.str;lastY=y;
    }
    out+="\n";
  }
  return out;
}

/* ===== divider placement & interaction ===== */
function lineY(i){
  /* y of boundary before line i (i may be lines().length) */
  const ptext=$("#ptext");if(!ptext)return 0;
  const ls=lines();
  if(i>=ls.length){const last=ptext.children[ls.length-1];return last?last.offsetTop+last.offsetHeight:0}
  const eli=ptext.children[i];return eli?eli.offsetTop:0;
}
function placeDividers(){
  const layer=$("#dlayer");if(!layer)return;
  layer.innerHTML="";
  const ds=sortedDivs();
  ds.forEach((d,idx)=>{
    const role=divRole(idx);
    const y=lineY(d.line);
    const eld=el(`<div class="div ${role.toLowerCase()}${d.auto&&!d.accepted?" sug":""}" data-id="${d.id}" style="top:${y-13}px">
      <span class="tag ${role.toLowerCase()}">${role}</span>
    </div>`);
    layer.appendChild(eld);
  });
}
function nearestBoundary(y){
  const ptext=$("#ptext"),ls=lines();
  let best=0,bd=1e9;
  for(let i=0;i<=ls.length;i++){
    const ly=lineY(i),dd=Math.abs(ly-y);
    if(dd<bd){bd=dd;best=i}
  }
  return best;
}
function setMode(m){
  if(m==="auto"){autoDetect();return}
  if(m==="trash"){trashSelected();return}
  MODE=m;
  $$(".tbox button").forEach(b=>b.classList.toggle("on",b.dataset.m===MODE));
  const page=$("#page");
  page.classList.toggle("drawmode",MODE==="draw"||MODE==="line");
}
let SEL=null;
function trashSelected(){
  if(SEL){S.dividers=S.dividers.filter(d=>d.id!==SEL);SEL=null;save();render()}
}
function autoDetect(){
  /* "automatic drawings": place IN at each scene start and OUT at each scene end - one sequence per scene - as the baseline.
     Only fills scenes that have no dividers yet. */
  const sc=parseScenes(lines());
  const existing=sequences();
  let added=0;
  const seqs=sequences();
  sc.forEach(s=>{
    /* a scene is uncovered when no sequence's range overlaps its lines */
    const covered=seqs.some(q=>q.start<s.end&&q.end>s.start);
    if(!covered){
      S.dividers.push({id:uid(),line:s.start,auto:true,accepted:true});
      S.dividers.push({id:uid(),line:s.end+1,auto:true,accepted:true});
      added++;
    }
  });
  if(added){save();render()}
  else{const h=$("#hintbar");if(h)h.textContent="EVERY SCENE ALREADY HAS DIVIDERS - ADD MORE BY HAND"}
}
function addDivider(line,auto){
  /* ignore duplicates at same boundary */
  if(S.dividers.some(d=>d.line===line))return;
  S.dividers.push({id:uid(),line,auto:!!auto,accepted:!auto});
  save();render();
}
function bindPage(page,cv){
  const ctx=cv.getContext("2d");
  let drawing=false,pts=[];
  function fit(){cv.width=page.clientWidth*devicePixelRatio;cv.height=page.clientHeight*devicePixelRatio;cv.style.width=page.clientWidth+"px";cv.style.height=page.clientHeight+"px";ctx.scale(devicePixelRatio,devicePixelRatio)}
  fit();
  function pos(e){const r=page.getBoundingClientRect();const p=e.touches?e.touches[0]:e;return{x:p.clientX-r.left,y:p.clientY-r.top}}
  function down(e){
    const p=pos(e);
    const hit=e.target.closest&&e.target.closest(".div");
    if(MODE==="cursor"){
      if(hit){SEL=hit.dataset.id;$$(".div").forEach(x=>x.classList.toggle("sel",x.dataset.id===SEL));startDrag(hit,e)}
      else{SEL=null;$$(".div").forEach(x=>x.classList.remove("sel"))}
      return;
    }
    if(MODE==="line"){
      const line=nearestBoundary(p.y);
      addDivider(line,false);
      return;
    }
    if(MODE==="draw"){
      drawing=true;pts=[p];e.preventDefault();
    }
  }
  function startDrag(hit,e){
    const id=hit.dataset.id;
    const d0=S.dividers.find(x=>x.id===id);
    if(!d0)return;
    const grabOff=pos(e).y-lineY(d0.line); /* where inside the fat handle the finger landed */
    let moved=false;
    const move=ev=>{
      const p=pos(ev);
      if(!moved&&Math.abs(p.y-(lineY(d0.line)+grabOff))<4)return;
      moved=true;
      hit.style.top=(p.y-grabOff-13)+"px";
      ev.preventDefault();
    };
    const up=ev=>{
      window.removeEventListener("pointermove",move);
      window.removeEventListener("pointerup",up);
      if(!moved){return} /* plain tap = select only */
      const p=pos(ev);
      const d=S.dividers.find(x=>x.id===id);
      if(d){
        const nl=nearestBoundary(p.y-grabOff);
        if(!S.dividers.some(x=>x.id!==id&&x.line===nl))d.line=nl;
        d.auto=false;d.accepted=true;save();
      }
      render();
    };
    window.addEventListener("pointermove",move,{passive:false});
    window.addEventListener("pointerup",up);
  }
  function move(e){
    if(!drawing)return;
    pts.push(pos(e));
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.strokeStyle="rgba(220,222,228,.9)";ctx.lineWidth=1.5;ctx.beginPath();
    pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.stroke();e.preventDefault();
  }
  function up(){
    if(!drawing)return;
    drawing=false;
    ctx.clearRect(0,0,cv.width,cv.height);
    /* straighten: average y of stroke -> divider (automatic straightening) */
    const avg=pts.reduce((a,p)=>a+p.y,0)/pts.length;
    addDivider(nearestBoundary(avg),false);
  }
  page.addEventListener("pointerdown",down);
  page.addEventListener("pointermove",move,{passive:false});
  window.addEventListener("pointerup",up);
  window.addEventListener("resize",()=>{fit()});
}

/* ===== MACRO VIEW ===== */
function renderMacro(app){
  const seqs=sequences(),sc=parseScenes(lines());
  app.appendChild(el(`<div><div class="hdsp"></div><h1>Macro</h1><div class="sub">${sc.length} SCENE${sc.length===1?"":"S"} • ${seqs.length} SEQUENCE${seqs.length===1?"":"S"}</div></div>`));
  if(!S.scriptText.trim()){app.appendChild(el(`<div><div class="hdsp"></div><h1>Macro</h1><div class="card imp"><h2>No script yet</h2><div class="sub2">Import a script in the Script tab first.</div></div></div>`));return}
  if(!sc.length){app.appendChild(el(`<div class="card imp"><h2>No scenes detected</h2><div class="sub2">Scene headings start with INT. or EXT. Check the script formatting.</div></div>`));return}
  sc.forEach((s,si)=>{
    const sq=seqs.filter(q=>q.scIdx===si);
    const card=el(`<div class="card sc">
      <div class="sc-h" data-jump="${s.start}">
        <div class="sc-n">SCENE ${si+1}</div>
        <div class="sc-t">${esc(s.heading)}</div>
        <div class="sc-c">${sq.length} SEQ</div>
      </div>
      <div class="sc-seqs"></div>
    </div>`);
    const wrap=card.querySelector(".sc-seqs");
    sq.forEach((q,qi)=>{
      const firstLine=(lines().slice(q.start,q.end).find(t=>t.trim())||"").trim();
      const row=el(`<button class="sqr${q.open?" open":""}" data-seq="${q.id}">
        <span class="sqn">${si+1}.${qi+1}</span>
        <span class="sqp">${esc(firstLine.slice(0,44))||"&nbsp;"}</span>
        <span class="sqm">${q.end-q.start} LN${q.open?" • OPEN":""}</span>
      </button>`);
      row.onclick=()=>{SEQ_SEL=q.id;go("breakdown")};
      wrap.appendChild(row);
    });
    if(!sq.length)wrap.appendChild(el(`<div class="sqe">NO SEQUENCES - DRAW AN IN/OUT ON THE SCRIPT</div>`));
    card.querySelector(".sc-h").onclick=e=>{
      go("script");
      setTimeout(()=>{const t=$(`.ln[data-i="${s.start}"]`);if(t)t.scrollIntoView({block:"center"})},80);
    };
    app.appendChild(card);
  });
}

/* ===== BREAKDOWN (MICRO) VIEW ===== */
const BD_SECTIONS=[
 {t:"HEADER",fields:[
  {k:"project",l:"PROJECT TITLE",type:"text",auto:()=>S.projectTitle},
  {k:"scene",l:"SCENE #",type:"text"},
  {k:"ie",l:"INT. / EXT.",type:"opts",opts:["INT.","EXT.","INT./EXT."]},
  {k:"dn",l:"D / N / DSK / DWN",type:"opts",opts:["D","N","DSK","DWN"]},
  {k:"page",l:"PAGE #",type:"text"},
  {k:"eighths",l:"PAGE COUNT (EIGHTHS)",type:"opts",opts:["1/8","2/8","3/8","4/8","5/8","6/8","7/8","1","1+"]},
  {k:"ver",l:"VER",type:"text"},
  {k:"estrt",l:"EST. RT",type:"text"},
  {k:"tod",l:"TOD / TON [RWF]",type:"text"},
 ]},
 {t:"INDEX",fields:[
  {k:"idx_loc",l:"LOCATION [INDEX]",type:"text"},
  {k:"idx_char",l:"CHARACTER [INDEX]",type:"text"},
  {k:"idx_prop",l:"PROP [INDEX]",type:"text"},
  {k:"idx_veh",l:"VEHICLE [INDEX]",type:"text"},
  {k:"idx_ani",l:"ANIMAL [INDEX]",type:"text"},
 ]},
 {t:"SCRIPT ELEMENTS",mark:true,fields:[
  {k:"el_blue",l:"[BLUE MARK] SPECIAL FX",type:"multi",opts:["PRACTICAL FX","MECHANICAL FX","PHYSICAL OPTICAL IN-CAMERA FX","PROSTHETIC HMU FX","MINIATURE FX","WARDROBE FX","PROP FX"]},
  {k:"el_red",l:"[RED MARK] LIGHT SOURCES & SPECIAL EQUIPMENT",type:"multi",opts:["PRODUCTION DESIGN LIGHT","VFX RCT LIGHT","PROP LIGHT","HMU LIGHT","WARDROBE LIGHT"]},
  {k:"el_green",l:"[GREEN MARK] VISUAL FX",type:"multi",opts:["G/B SCREEN","CGI","ANIMATION","MATTE","ROTOSCOPE","DIGITAL COMPOSITING","MOTION CONTROL","WIRE REMOVAL","BULLET TIME"]},
  {k:"el_orange",l:"[ORANGE MARK] HAZARDOUS RISK ACTIVITIES",type:"multi",opts:["STUNTS","FIGHTS","SPORTS","CONCERTS","VEHICLES","WATERCRAFTS","AIRCRAFTS","ANIMALS"]},
 ]},
 {t:"LIGHTING SCHEME",fields:[
  {k:"ls_source",l:"LIGHT SOURCE",type:"opts",opts:["PRACTICALISM","MINIMALISM","NATURALISM"]},
  {k:"ls_class",l:"LIGHTING CLASSIFICATION",type:"opts",opts:["MAGIC REALISM","SURREALISM","REALISM"]},
  {k:"ls_hum",l:"[X] LIGHT HUMIDITY",type:"opts",opts:["0 HYPER REALISM","1/8-1/4 REALISM","1/2 MID GROUND","1 MYSTERY/FANTASY","2 MYSTERY/HYPER FANTASY"]},
  {k:"ls_traj",l:"[1] LIGHT TRAJECTORY - EYE LIGHT",type:"opts",opts:["EYE LIGHT - SOUL","EYE LIGHT - CURIOSITY","NO EYE LIGHT - ADD POLARIZER"]},
  {k:"ls_charxy",l:"CHARACTER LIGHTING XY AXIS",type:"multi",opts:["ANGELIC EFFECT","DEMONIC EFFECT","TOP BACK LIGHT","TOP TOP LIGHT","SILHOUETTE","EDGE LIGHT - IMPORTANCE"]},
  {k:"ls_vuln",l:"CHARACTER VULNERABILITY (X AXIS)",type:"opts",opts:["VULNERABLE - BEAUTY FRONT","VULNERABLE - HALF LIGHT","GUARDED"]},
  {k:"ls_trust",l:"CHARACTER TRUST (Y AXIS)",type:"opts",opts:["TRUTHFUL - TOP FRONT","DECEITFUL - BOTTOM"]},
  {k:"ls_obj",l:"OBJECT LIGHTING X,Y,XY AXIS",type:"text"},
  {k:"ls_flare",l:"LENS FLARE LIGHTING",type:"opts",opts:["SOURCE OF LIFE","CURIOSITY","MYSTERY","ENERGY","MYSTICAL","MAGICAL","NO LENS FLARE"]},
  {k:"ls_qty",l:"[2A] LIGHT QUANTITY - EMPHASIS",type:"text"},
  {k:"ls_qual",l:"[2B] LIGHT QUALITY / GRADATION",type:"opts",opts:["HIGH KEY 1:1-2:1","MID KEY 4:1","LOW KEY 8:1","NOIRE 16:1-32:1","FADED MIDS LOWKEY"]},
  {k:"ls_chroma",l:"[4A] LIGHT CHROMATICITY - MOODS",type:"text"},
  {k:"ls_cast",l:"[4B] LIGHT COLOR CAST / EMISSION",type:"opts",opts:["PROFOUND - NEUTRAL WHITE","VIOLENT - MAGENTA","HAPPY - WARM YELLOW","LETHARGIC - GREEN","SAD - COOL BLUE"]},
  {k:"ls_act",l:"[5] LIGHT ACTIVITY",type:"opts",opts:["STATIONARY","MOTION"]},
  {k:"ls_freq",l:"[6] LIGHT FREQUENCY",type:"opts",opts:["CONTINUOUS LIGHT","FLICKERING LIGHT"]},
 ]},
 {t:"REAL WORLD FACTORS",fields:[
  {k:"rw_season",l:"SEASON",type:"opts",opts:["WINTER","SPRING","SUMMER","FALL"]},
  {k:"rw_weather",l:"WEATHER",type:"text"},
  {k:"rw_cloudalt",l:"CLOUD ALTITUDE",type:"opts",opts:["HIGH","MIDDLE","LOW"]},
  {k:"rw_cloud",l:"CLOUD LEVELS",type:"opts",opts:["0% NO CLOUDS","1-10% FEW","10-25% ISOLATED","25-50% SCATTERED","50-90% BROKEN","90-100% OVERCAST"]},
  {k:"rw_moon",l:"MOON PHASE",type:"opts",opts:["NEW MOON","WANING CRESCENT","FIRST 1/4","HALF WAXING","WAXING GIBBOUS","FULL MOON","WANING GIBBOUS","LAST 1/4","HALF WANING"]},
  {k:"rw_cond",l:"[X] LIGHTING CONDENSATION",type:"multi",opts:["DUST","FOG","SMOKE","HAZE","MIST","STEAM","SMOG","VAPOR MOISTURE","HUMIDITY","DRY AIR"]},
  {k:"rw_dir",l:"[1] LIGHTING DIRECTION - TIME OF DAY/NIGHT",type:"text"},
  {k:"rw_illum",l:"[2A] LIGHTING ILLUMINATION - GENRE/MOOD",type:"opts",opts:["NIGHT HORROR -2","NIGHT DRAMA -1","NIGHT COMEDY 0","NOIRE 0","DAY DRAMA 0","DAY COMEDY +1","DAY FANTASY +2"]},
 ]},
 {t:"COMPOSITION SCHEME",fields:[
  {k:"cp_prep",l:"[OPERATION] PREPARATION PROCEDURE",type:"opts",opts:["SHOOT TO EDIT - PRE-PRO STORYBOARD, SHOT LIST, DIAGRAM","SHOOT FOR COVERAGE - PRE-PRO SHOT LIST, DIAGRAM","SHOOT ON THE FLY - ON-SET DIAGRAM, SHOT LIST"]},
  {k:"cp_cam",l:"[POSITION] CAMERA MOVEMENT TOOL",type:"opts",opts:["OBSERVING - PSYCHOLOGICAL EXPERIENCE (MIND)","OBSERVING - SPIRITUAL EXPERIENCE (SOUL)","PARTICIPATING - PERSONAL EXPERIENCE (BODY)"]},
  {k:"cp_focal",l:"[IDENTIFICATION] NON POV FOCAL LENGTH COVERAGE",type:"opts",opts:["FEEL WITH - 42-59MM","FEEL FOR - 60-400MM","MULTIPLE CHARACTERS","SINGLE CHARACTER"]},
  {k:"cp_pov",l:"[ACTION-REACTION] POV COVERAGE",type:"multi",opts:["MULTIPLE CHARACTERS INTERNALIZATION","SINGLE CHARACTER INTERNALIZATION","ACTION IMPORTANCE","OBJECT IMPORTANCE","NO POV COVERAGE AT ALL"]},
  {k:"cp_size",l:"[EMOTION] SHOT SIZE COVERAGE TYPE",type:"opts",opts:["EWS","WS","FS","MS","WCU","MCU","CU","XCU"]},
  {k:"cp_insert",l:"[ACTION] INSERT SHOT",type:"text"},
  {k:"cp_conn",l:"[CONNECTION] NON POV COVERAGE TYPE",type:"opts",opts:["OTS/OTF + MASTER COVERAGE","SINGLE + MASTER COVERAGE"]},
  {k:"cp_frame",l:"[CONDITION] NON POV SINGLE SHOT FRAMING",type:"multi",opts:["VULNERABILITY - WHO'S HIDING SOMETHING","HIERARCHY - WHO'S IN POWER","SERENITY - WHO'S UNSTABLE","MENTALITY - WHO'S SENTIMENTAL"]},
 ]},
 {t:"MEMORANDUM",fields:[
  {k:"memo",l:"MEMORANDUM MODULE",type:"long"},
 ]},
 {t:"CAMERA",fields:[
  {k:"cam_fps",l:"FPS",type:"text"},{k:"cam_shut",l:"SHUTTER",type:"text"},{k:"cam_ei",l:"EI",type:"text"},
  {k:"cam_wb",l:"WB",type:"text"},{k:"cam_cc",l:"CC",type:"text"},{k:"cam_iris",l:"IRIS",type:"text"},{k:"cam_filter",l:"FILTER[S]",type:"text"},
 ]},
];
function bdData(qid){
  if(!S.breakdowns[qid])S.breakdowns[qid]={};
  return S.breakdowns[qid];
}
function renderBreakdown(app){
  const seqs=sequences();
  let q=seqs.find(x=>x.id===SEQ_SEL)||seqs[0];
  if(!S.scriptText.trim()){app.appendChild(el(`<div><div class="hdsp"></div><h1>Breakdown</h1><div class="card imp"><h2>No script yet</h2><div class="sub2">Import a script in the Script tab first.</div></div></div>`));return}
  if(!q){app.appendChild(el(`<div><div class="hdsp"></div><h1>Breakdown</h1><div class="card imp"><h2>No sequences yet</h2><div class="sub2">Draw an IN and an OUT divider on the script to create a sequence.</div></div></div>`));return}
  SEQ_SEL=q.id;
  const sc=parseScenes(lines());
  const si=q.scIdx, qi=seqs.filter(x=>x.scIdx===si).indexOf(q);
  const seqName=`SCENE ${si+1} • SEQUENCE ${si+1}.${qi+1}${q.open?" (OPEN)":""}`;
  /* pager */
  const idx=seqs.indexOf(q);
  const pg=el(`<div><div class="hdsp"></div><h1>Breakdown</h1>
  <div class="pager">
    <button class="pgb" id="pgPrev" ${idx===0?"disabled":""}>&lt;</button>
    <div class="pgt">${esc(seqName)}</div>
    <button class="pgb" id="pgNext" ${idx===seqs.length-1?"disabled":""}>&gt;</button>
  </div></div>`);
  app.appendChild(pg);
  $("#pgPrev").onclick=()=>{SEQ_SEL=seqs[idx-1].id;render()};
  $("#pgNext").onclick=()=>{SEQ_SEL=seqs[idx+1].id;render()};
  /* passage */
  const passage=lines().slice(q.start,q.end).join("\n").trim();
  const pc=el(`<div class="card"><h2>Script passage</h2><pre class="passage">${esc(passage)||" "}</pre></div>`);
  app.appendChild(pc);
  /* breakdown sections */
  const data=bdData(q.id);
  BD_SECTIONS.forEach(sec=>{
    const sc_el=el(`<div class="card bdsec"><h2>${esc(sec.t)}</h2></div>`);
    sec.fields.forEach(f=>{
      const fw=el(`<div class="bdf"><div class="bdfl">${esc(f.l)}</div></div>`);
      if(f.type==="text"){
        const inp=el(`<input type="text" value="${esc(data[f.k]||(f.auto?f.auto():""))}">`);
        inp.onchange=()=>{data[f.k]=inp.value;save()};
        fw.appendChild(inp);
      }else if(f.type==="long"){
        const ta=el(`<textarea rows="3">${esc(data[f.k]||"")}</textarea>`);
        ta.onchange=()=>{data[f.k]=ta.value;save()};
        fw.appendChild(ta);
      }else if(f.type==="opts"){
        const ow=el(`<div class="optrow"></div>`);
        f.opts.forEach(o=>{
          const b=el(`<button class="opt${data[f.k]===o?" on":""}">${esc(o)}</button>`);
          b.onclick=()=>{data[f.k]=data[f.k]===o?undefined:o;save();render()};
          ow.appendChild(b);
        });
        fw.appendChild(ow);
      }else if(f.type==="multi"){
        const ow=el(`<div class="optrow"></div>`);
        const arr=data[f.k]||[];
        f.opts.forEach(o=>{
          const b=el(`<button class="opt${arr.includes(o)?" on":""}">${esc(o)}</button>`);
          b.onclick=()=>{const i=arr.indexOf(o);if(i>=0)arr.splice(i,1);else arr.push(o);data[f.k]=arr;save();render()};
          ow.appendChild(b);
        });
        fw.appendChild(ow);
      }
      sc_el.appendChild(fw);
    });
    app.appendChild(sc_el);
  });
}

/* ===== SETTINGS VIEW ===== */
function renderSettings(app){
  app.appendChild(el(`<div><div class="hdsp"></div><h1>Settings</h1><div class="sub">TGD • MARK I</div></div>`));
  const th=el(`<div class="card"><h2>Theme</h2><div class="optrow" id="thRow">
    ${["auto","day","night"].map(t=>`<button class="opt${S.theme===t?" on":""}" data-t="${t}">${t.toUpperCase()}</button>`).join("")}
  </div></div>`);
  app.appendChild(th);
  th.querySelectorAll(".opt").forEach(b=>b.onclick=()=>{S.theme=b.dataset.t;applyTheme(S.theme);save();render()});
  const pj=el(`<div class="card"><h2>Project</h2><div class="bdf"><div class="bdfl">PROJECT TITLE</div><input type="text" id="pjT" value="${esc(S.projectTitle)}"></div></div>`);
  app.appendChild(pj);
  pj.querySelector("#pjT").onchange=e=>{S.projectTitle=e.target.value;save()};
  const io=el(`<div class="card"><h2>Backup</h2><div class="rowbtns">
    <button class="btn" id="expBtn">EXPORT</button>
    <button class="btn" id="impBtn2">IMPORT</button>
    <input type="file" id="impFile2" accept=".json" hidden>
  </div></div>`);
  app.appendChild(io);
  $("#expBtn").onclick=()=>{
    const blob=new Blob([JSON.stringify(S,null,1)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="tgd-backup.json";a.click();
  };
  $("#impBtn2").onclick=()=>$("#impFile2").click();
  $("#impFile2").onchange=async e=>{
    const f=e.target.files[0];if(!f)return;
    try{const d=JSON.parse(await f.text());if(d&&typeof d==="object"&&"scriptText"in d){S=d;applyTheme(S.theme||"auto");save();render()}}catch(err){}
  };
  const danger=el(`<div class="card"><h2>Reset</h2><div id="dangerZone"></div></div>`);
  app.appendChild(danger);
  const dz=danger.querySelector("#dangerZone");
  const b=el(`<button class="btn danger">RESET EVERYTHING</button>`);
  b.onclick=()=>confirmInline(dz,"This clears the script, dividers and every breakdown on this device.","DELETE",()=>{
    S={projectTitle:"",scriptText:"",dividers:[],breakdowns:{},acceptedAuto:false,theme:S.theme};save();render();
  });
  dz.appendChild(b);
}

/* ===== inline confirm (no pop-ups, guarded destructive) ===== */
function confirmInline(host,msg,word,fn){
  host.innerHTML="";
  const c=el(`<div class="warn"><div>${esc(msg)}</div>
    <div class="bdfl" style="margin-top:8px">TYPE ${esc(word)} TO CONFIRM</div>
    <input type="text" autocapitalize="characters">
    <div class="rowbtns"><button class="btn danger" disabled>CONFIRM</button><button class="btn">CANCEL</button></div>
  </div>`);
  host.appendChild(c);
  const inp=c.querySelector("input"),ok=c.querySelectorAll("button")[0],cancel=c.querySelectorAll("button")[1];
  inp.oninput=()=>{ok.disabled=inp.value.trim().toUpperCase()!==word};
  ok.onclick=fn;
  cancel.onclick=()=>render();
}

/* ===== icons ===== */
const ico={
 cursor:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3l12 9-7 1.5L8 21z"/></svg>`,
 hline:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12h18M12 8v8"/></svg>`,
 draw:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 18c3-8 6-10 8-8s5 2 8-4"/></svg>`,
 auto:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M5.6 18.4l2.2-2.2M16.2 7.8l2.2-2.2"/><circle cx="12" cy="12" r="3"/></svg>`,
 trash:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>`,
 script:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="3" width="14" height="18"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`,
 macro:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 5h16M4 12h16M4 19h16"/></svg>`,
 bd:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16"/><path d="M4 10h16M10 10v10"/></svg>`,
 gear:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>`,
};

/* ===== helpers ===== */
function el(html){const t=document.createElement("template");t.innerHTML=html.trim();return t.content.firstChild}
function esc(s){return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function uid(){return Math.random().toString(36).slice(2,10)}
function applyTheme(t){
  const d=t==="day"||(t==="auto"&&matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.classList.toggle("day",d);
  const m=document.querySelector('meta[name=theme-color]');if(m)m.content=d?"#ededed":"#121212";
}

/* ===== boot ===== */
applyTheme(S.theme||"auto");
$$("nav button").forEach(b=>b.onclick=()=>go(b.dataset.v));
render();

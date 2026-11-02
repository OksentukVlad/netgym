import { fromInt, toInt } from '../../engine/ip.js';

function graphFromLinks(names,links){
  const g=Object.fromEntries(names.map(r=>[r,[]]));
  links.forEach(l=>{if(!g[l.from])g[l.from]=[];if(!g[l.to])g[l.to]=[];g[l.from].push(l.to);g[l.to].push(l.from);});
  return g;
}
function isSimpleChain(names,graph,links){
  if(names.length<=1)return false;
  if(links.length!==names.length-1)return false;
  const deg=names.map(r=>graph[r]?.length||0);
  return deg.filter(d=>d===1).length===2&&deg.every(d=>d<=2);
}
function chainOrder(names,graph){
  // Start at a chain end so links do not cross a router.
  const start=names.find(r=>/^(R1|R-INET|R-GW|R-HQ)$/i.test(r)&&(graph[r]||[]).length===1)||names.find(r=>(graph[r]||[]).length===1)||names[0];
  const order=[],vis=new Set();let cur=start,prev=null;
  while(cur&&!vis.has(cur)){order.push(cur);vis.add(cur);const nx=(graph[cur]||[]).find(n=>n!==prev&&!vis.has(n));prev=cur;cur=nx;}
  names.forEach(r=>{if(!vis.has(r))order.push(r);});
  return order;
}
/** Place routers from their names and supplied links. */
export function layoutRouters(task,links){
  const names=Object.keys(task.routers),graph=graphFromLinks(names,links),pos={};
  if(names.length===1){pos[names[0]]={x:50,y:44};return{pos,mode:"single"};}
  if(isSimpleChain(names,graph,links)){
    const order=chainOrder(names,graph);
    order.forEach((n,i)=>{const span=Math.max(order.length-1,1);pos[n]={x:14+(72*i)/span,y:40};});
    return{pos,mode:"chain"};
  }
  const center=names.find(n=>/(CORE|HUB|GW|HQ)/i.test(n)&&(graph[n]||[]).length>=2)||names.find(n=>(graph[n]||[]).length>=3);
  if(center&&names.length<=6){
    pos[center]={x:50,y:36};
    const leaves=names.filter(n=>n!==center);
    const n=leaves.length;
    leaves.forEach((name,i)=>{
      const t=n===1?0.5:i/(n-1);
      const a=(Math.PI*0.15)+(Math.PI*0.70)*t; // Lower arc.
      pos[name]={x:50+38*Math.cos(a),y:36+34*Math.sin(a)};
    });
    return{pos,mode:"star"};
  }
  if(links.length>=names.length){
    const R=names.length<=3?27:30;
    names.forEach((name,i)=>{const a=(-Math.PI/2)+(i*Math.PI*2)/names.length;pos[name]={x:50+R*Math.cos(a),y:44+R*0.8*Math.sin(a)};});
    return{pos,mode:"cycle"};
  }
  const root=names.find(n=>/INET/i.test(n))||names.find(n=>/(CORE|HUB|GW|HQ)/i.test(n))||names[0];
  const lv=new Map([[root,0]]),q=[root];
  while(q.length){const r=q.shift();(graph[r]||[]).forEach(n=>{if(!lv.has(n)){lv.set(n,lv.get(r)+1);q.push(n);}});}
  names.forEach(n=>{if(!lv.has(n))lv.set(n,0);});
  const maxL=Math.max(...lv.values(),1),byL=new Map();
  names.forEach(n=>{const l=lv.get(n)||0;if(!byL.has(l))byL.set(l,[]);byL.get(l).push(n);});
  byL.forEach((items,l)=>{items.forEach((n,i)=>{const x=8+34*l;const y=items.length===1?42:8+(66*i)/Math.max(items.length-1,1);pos[n]={x,y};});});
  return{pos,mode:"tree"};
}
// Diagram geometry.
// Pure router, LAN/ISP box, port and link-label positions plus the viewBox.
// TopologyMap only renders the returned geometry.
// Conservative text widths: monospace is 0.62 em per character
// (DejaVu Sans Mono and Courier New 0.60, Consolas 0.55); bold sans-serif is
// 0.78 for capitals, digits and Cyrillic, 0.62 otherwise (measured: DejaVu Sans
// Bold up to 0.74 for capitalised words, Arial Bold up to 0.66).
export const DIAGRAM_FONT={net:2.5,ports:2.05,label:2.9,ip:2.4,prefix:2.1,port:2.1,name:3.6,model:2};
// NetGym's larger set (round 2 step 7). It has no `model`: NetGym draws no
// «Cisco»/«MikroTik» line in the circles. DIAGRAM_FONT is the round 1 apps'
// set (retired in step 8; the frozen geometry fixture and diagram.test.mjs
// still check it), and with it every number below stays exactly as it was
// (the factors are 1).
export const NETGYM_DIAGRAM_FONT={net:3.0,ports:2.6,label:3.4,ip:2.9,prefix:2.5,port:2.6,name:4.0};
export const DIAGRAM_R={router:7.6,ring:9.5,keep:9.75}; // Router circle, selection ring, outer edge.
const DIAGRAM_GAP=0.6;                             // Minimum gap between diagram items.
function diagramTextWidth(text,size,sans){
  let em=0;
  for(const ch of String(text))em+=!sans?0.62:/[A-Z0-9\u0400-\u04FF]/.test(ch)?0.78:0.62;
  return em*size;
}
function routerNameSize(name,F=DIAGRAM_FONT){return Math.min(F.name,12.6/(diagramTextWidth(name,1,true)||1));}
/** Box and line spacing grow with the font: k is 1 for DIAGRAM_FONT. */
const boxScale=F=>F.ip/DIAGRAM_FONT.ip;
/** The link label box grows with its font: 1 for DIAGRAM_FONT. */
export const linkScale=F=>F.net/DIAGRAM_FONT.net;
function endpointShape(ep,parseAddress,F=DIAGRAM_FONT){
  const k=boxScale(F),ip=String(ep.ip),internet=ep.type==="internet";
  const isp=String(ep.note||"").match(/ISP\s*\d*/i);
  // A caller may name the box too (round 5 5b-2: «Знайди несправність» says «Інтернет (ISP)», as its pings do).
  const label=ep.label??(internet?(isp?isp[0].replace(/\s+/g,""):"Internet"):(ep.note||ep.name));
  // Show the provider link network so the local address is not mistaken for its gateway.
  const [addr,pfx]=ip.split("/");
  // A caller may say what the box shows (round 4: a LAN's network, a provider's gateway).
  const shown=ep.shown??(internet&&pfx?fromInt((parseAddress(addr)&((0xffffffff<<(32-Number(pfx)))>>>0))>>>0):addr);
  const lines=[{text:label,size:F.label,sans:true,dy:-1.4*k},{text:shown,size:F.ip,sans:false,dy:1.6*k}];
  if(ip.includes("/"))lines.push({text:`/${ip.split("/")[1]}`,size:F.prefix,sans:false,dy:4.4*k});
  const tw=Math.max(...lines.map(l=>diagramTextWidth(l.text,l.size,l.sans)));
  if(!internet)return{label,lines,shape:"rect",w:Math.max(18,tw+2.4),h:10.8*k};
  // Each line must fit the ellipse at its own height.
  const ry=5.2*k,rx=Math.max(9.5,...lines.map(l=>{
    const ym=Math.max(Math.abs(l.dy-0.75*l.size),Math.abs(l.dy+0.25*l.size));
    return(diagramTextWidth(l.text,l.size,l.sans)/2+0.3*k)/Math.sqrt(Math.max(0.05,1-(ym/ry)**2));
  }));
  return{label,lines,shape:"ellipse",rx,ry,w:2*rx,h:2*ry};
}
const boxAt=(cx,cy,w,h)=>({x:cx-w/2,y:cy-h/2,w,h,cx,cy});
const rectsOverlap=(a,b,g)=>a.x<b.x+b.w+g&&b.x<a.x+a.w+g&&a.y<b.y+b.h+g&&b.y<a.y+a.h+g;
const rectHitsCircle=(b,c,g)=>Math.hypot(Math.max(b.x-c.x,0,c.x-b.x-b.w),Math.max(b.y-c.y,0,c.y-b.y-b.h))<c.r+g;
const supportOf=(b,ux,uy)=>b.rx?Math.hypot(b.rx*ux,b.ry*uy):Math.abs(ux)*b.w/2+Math.abs(uy)*b.h/2;
function segmentHitsRect(s,b,g){ // Liang–Barsky intersection with a rectangle expanded by g.
  const x0=b.x-g,y0=b.y-g,x1=b.x+b.w+g,y1=b.y+b.h+g,dx=s.x2-s.x1,dy=s.y2-s.y1;let t0=0,t1=1;
  for(const[p,q]of[[-dx,s.x1-x0],[dx,x1-s.x1],[-dy,s.y1-y0],[dy,y1-s.y1]]){
    if(p===0){if(q<0)return false;continue;}
    const t=q/p;
    if(p<0){if(t>t1)return false;if(t>t0)t0=t;}else{if(t<t0)return false;if(t<t1)t1=t;}
  }
  return true;
}
function segmentHitsCircle(s,c,g){
  const dx=s.x2-s.x1,dy=s.y2-s.y1,L2=dx*dx+dy*dy||1;
  const t=Math.max(0,Math.min(1,((c.x-s.x1)*dx+(c.y-s.y1)*dy)/L2));
  return Math.hypot(s.x1+t*dx-c.x,s.y1+t*dy-c.y)<c.r+g;
}
/**
 * Compute geometry without changing the supplied topology or task.
 * Interface names and endpoint kinds come from the caller's topology.
 * @param {{routers: Object}} task
 * @param {{links: object[], endpoints: object[]}} topology
 * @param {(ip: string) => number|null} parseAddress Legacy app parser for provider labels.
 * @param {object} font Text sizes: DIAGRAM_FONT (round 1, the default) or NETGYM_DIAGRAM_FONT.
 * @returns {object} Router, endpoint and label positions, clashes and viewBox.
 */
export function diagramGeometry(task,topology,parseAddress=toInt,font=DIAGRAM_FONT){
  const F=font,K=DIAGRAM_R.keep,G=DIAGRAM_GAP;
  const names=Object.keys(task.routers);
  const{links,endpoints}=topology;
  const{pos:base,mode}=layoutRouters(task,links);
  const lastOct=ip=>String(ip).split("/")[0].split(".").pop();
  const c0={x:names.reduce((s,n)=>s+base[n].x,0)/names.length,y:names.reduce((s,n)=>s+base[n].y,0)/names.length};
  const shapes=endpoints.map(ep=>endpointShape(ep,parseAddress,F));
  // The port label: the interface name, or the caller's lines (round 4: «g0/1» over «.1»).
  const portLines=ep=>ep.portLines??[ep.name];
  const portSize=ep=>ep.type==="internet"?null:{w:Math.max(...portLines(ep).map(t=>diagramTextWidth(t,F.port,false)))+1,h:F.port*1.25*portLines(ep).length};
  // Box rows: Internet above; LAN below for chains, right for trees,
  // or away from the centre for stars and cycles. Upward LANs share
  // a row with Internet endpoints.
  const groups=[];
  names.forEach(router=>{
    const idx=endpoints.map((e,i)=>e.router===router?i:-1).filter(i=>i>=0);
    const inet=idx.filter(i=>endpoints[i].type==="internet"),loc=idx.filter(i=>endpoints[i].type!=="internet");
    let u={x:0,y:1};
    if(mode==="tree")u={x:1,y:0};
    if(mode==="star"||mode==="cycle"){const dx=base[router].x-c0.x,dy=base[router].y-c0.y,L=Math.hypot(dx,dy);if(L>=3)u={x:dx/L,y:dy/L};}
    if(inet.length&&loc.length&&u.y<-0.5)groups.push({router,u:{x:0,y:-1},members:[...inet,...loc]});
    else{
      if(inet.length)groups.push({router,u:{x:0,y:-1},members:inet});
      if(loc.length)groups.push({router,u,members:loc});
    }
  });
  const dMin=mode==="tree"?23:mode==="star"||mode==="cycle"?22:24;
  // Box row at distance D; port labels sit on the line just beyond the ring,
  // `lift` further out where the larger NetGym names would touch.
  const placeRow=(rp,u,members,D,lift=0)=>{
    let v={x:-u.y,y:u.x};if(v.x<0||(v.x===0&&v.y<0))v={x:-v.x,y:-v.y};
    const offs=[0];
    for(let k=1;k<members.length;k++){
      const a=shapes[members[k-1]],b=shapes[members[k]];
      const px=Math.abs(v.x)>1e-6?((a.w+b.w)/2+2)/Math.abs(v.x):Infinity;
      const py=Math.abs(v.y)>1e-6?((a.h+b.h)/2+2)/Math.abs(v.y):Infinity;
      offs.push(offs[k-1]+Math.min(px,py));
    }
    const mid=(offs[0]+offs[offs.length-1])/2;
    return members.map((i,k)=>{
      const sh=shapes[i],ep=endpoints[i];
      const ox=D*u.x+(offs[k]-mid)*v.x,oy=D*u.y+(offs[k]-mid)*v.y,L=Math.hypot(ox,oy),ux=ox/L,uy=oy/L;
      const x=rp.x+ox,y=rp.y+oy,box={...boxAt(x,y,sh.w,sh.h),...(sh.rx?{rx:sh.rx,ry:sh.ry}:{})};
      const ps=portSize(ep),t=ps&&K+2*G+supportOf(ps,ux,uy)+lift;
      const port=ps&&{text:portLines(ep).join(" "),...(ep.portLines?{lines:ep.portLines}:{}),size:F.port,...boxAt(rp.x+t*ux,rp.y+t*uy,ps.w,ps.h)};
      const sb=sh.rx?1/Math.hypot(ux/sh.rx,uy/sh.ry):Math.min(sh.w/2/Math.abs(ux),sh.h/2/Math.abs(uy)); // Line entry into the box.
      return{key:`${rp.name}-${ep.name}`,router:rp.name,ep,type:ep.type,label:sh.label,lines:sh.lines,shape:sh.shape,x,y,box,port,
        line:{x1:rp.x,y1:rp.y,x2:x,y2:y},visible:{x1:rp.x+K*ux,y1:rp.y+K*uy,x2:x-sb*ux,y2:y-sb*uy}};
    });
  };
  const rowFits=(rp,row)=>row.every(e=>{
    const own={x:rp.x,y:rp.y,r:K};
    return !rectHitsCircle(e.box,own,2*G)&&(!e.port||(!rectHitsCircle(e.port,own,G)&&!rectsOverlap(e.port,e.box,G)));
  });
  // Port names of one row clear of each other (always so with DIAGRAM_FONT).
  const portsApart=row=>row.every((e,i)=>!e.port||row.slice(i+1).every(o=>!o.port||!rectsOverlap(e.port,o.port,G)));
  const place=s=>{
    const routers=names.map(name=>({name,x:c0.x+(base[name].x-c0.x)*s,y:c0.y+(base[name].y-c0.y)*s,
      r:DIAGRAM_R.router,ring:DIAGRAM_R.ring,keep:K,nameSize:routerNameSize(name,F)}));
    const at=Object.fromEntries(routers.map(r=>[r.name,r]));
    const eps=[];
    groups.forEach(({router,u,members})=>{
      let D=dMin,lift=0,row=placeRow(at[router],u,members,D);
      const settle=()=>{while(!rowFits(at[router],row)&&D<80){D+=0.5;row=placeRow(at[router],u,members,D,lift);}};
      settle();
      while(!portsApart(row)&&lift<24){lift+=0.5;row=placeRow(at[router],u,members,D,lift);settle();}
      eps.push(...row);
    });
    const clashes=[],circles=routers.map(r=>({x:r.x,y:r.y,r:K,name:r.name}));
    const fixed=[...eps.map(e=>({...e.box,key:e.key,id:`бокс ${e.key}`})),...eps.filter(e=>e.port).map(e=>({...e.port,key:e.key,id:`порт ${e.key}`}))];
    const linkSegs=links.map(l=>{
      const a=at[l.from],b=at[l.to],L=Math.hypot(b.x-a.x,b.y-a.y)||1,ux=(b.x-a.x)/L,uy=(b.y-a.y)/L;
      return{x1:a.x+K*ux,y1:a.y+K*uy,x2:b.x-K*ux,y2:b.y-K*uy,from:l.from,to:l.to,id:`лінк ${l.from}-${l.to}`};
    });
    const epSegs=eps.map(e=>({...e.visible,key:e.key,router:e.router,id:`лінія ${e.key}`}));
    fixed.forEach((b,i)=>{
      fixed.slice(i+1).forEach(o=>{if(rectsOverlap(b,o,G))clashes.push(`${b.id} × ${o.id}`);});
      circles.forEach(c=>{if(rectHitsCircle(b,c,G))clashes.push(`${b.id} × ${c.name}`);});
      linkSegs.forEach(sg=>{if(segmentHitsRect(sg,b,G/2))clashes.push(`${b.id} × ${sg.id}`);});
      epSegs.forEach(sg=>{if(sg.key!==b.key&&segmentHitsRect(sg,b,G/2))clashes.push(`${b.id} × ${sg.id}`);});
    });
    [...linkSegs,...epSegs].forEach(sg=>circles.forEach(c=>{
      if(c.name!==sg.from&&c.name!==sg.to&&c.name!==sg.router&&segmentHitsCircle(sg,c,G))clashes.push(`${sg.id} × ${c.name}`);
    }));
    // Place link labels near the midpoint on a free side.
    const placed=[];
    const outLinks=links.map((l,li)=>{
      const a=at[l.from],b=at[l.to],L=Math.hypot(b.x-a.x,b.y-a.y)||1,flip=b.x<a.x||(b.x===a.x&&b.y<a.y)?-1:1;
      const nx=flip*(b.y-a.y)/L,ny=-flip*(b.x-a.x)/L; // Upward normal (left for vertical lines).
      // Round 4 (spec R1): `full` links name both ends' whole addresses, the
      // left (or upper) router's first; otherwise the round 1 «port.octet».
      const first=a.x<b.x-1e-6||(Math.abs(a.x-b.x)<=1e-6&&a.y<=b.y);
      const ends=l.full?(first?[l.a,l.b]:[l.b,l.a]).map((e,i)=>({router:i===0===first?l.from:l.to,ip:String(e.ip).split("/")[0]})):null;
      const lines=[{text:l.network,size:F.net,sans:false},{text:ends?`${ends[0].ip} ↔ ${ends[1].ip}`:`${l.a.name}.${lastOct(l.a.ip)}↔${l.b.name}.${lastOct(l.b.ip)}`,size:F.ports,sans:false}];
      const w=Math.max(19,...lines.map(t=>diagramTextWidth(t.text,t.size,false)+2.4)),h=9*linkScale(F);
      const off=supportOf({w,h},nx,ny)+2.1;
      const free=box=>!circles.some(c=>rectHitsCircle(box,c,G))&&![...fixed,...placed].some(o=>rectsOverlap(box,o,G))
        &&![...linkSegs.filter((_,j)=>j!==li),...epSegs].some(sg=>segmentHitsRect(sg,box,G/2));
      let best=null;
      for(const t of[0.5,0.42,0.58,0.34,0.66]){
        for(const side of[1,-1]){
          const box=boxAt(a.x+(b.x-a.x)*t+side*off*nx,a.y+(b.y-a.y)*t+side*off*ny,w,h);
          if(free(box)){best=box;break;}
        }
        if(best)break;
      }
      if(!best){best=boxAt((a.x+b.x)/2+off*nx,(a.y+b.y)/2+off*ny,w,h);clashes.push(`підпис ${l.from}-${l.to}`);}
      placed.push(best);
      return{...l,key:`${l.from}-${l.to}-${li}`,x1:a.x,y1:a.y,x2:b.x,y2:b.y,label:{...best,lines,...(ends?{ends}:{})}};
    });
    // Enclose everything with a margin of 2.
    const all=[...routers.map(r=>boxAt(r.x,r.y,2*K,2*K)),...fixed,...placed];
    const minX=Math.min(...all.map(b=>b.x))-2,minY=Math.min(...all.map(b=>b.y))-2;
    const maxX=Math.max(...all.map(b=>b.x+b.w))+2,maxY=Math.max(...all.map(b=>b.y+b.h))+2;
    return{mode,scale:s,routers,links:outLinks,endpoints:eps,clashes,viewBox:{x:minX,y:minY,w:maxX-minX,h:maxY-minY}};
  };
  // Spread routers from the centre until nothing overlaps.
  let geo=place(1);
  for(let k=1;k<=40&&geo.clashes.length;k++)geo=place(1+k*0.05);
  return geo;
}

/** Mix two opaque #rrggbb colours; t is the weight of a. */
export function mixHex(a,b,t){
  const p=h=>[1,3,5].map(i=>parseInt(String(h).slice(i,i+2),16));
  const x=p(a),y=p(b);
  return"#"+x.map((v,i)=>Math.round(v*t+y[i]*(1-t)).toString(16).padStart(2,"0")).join("");
}

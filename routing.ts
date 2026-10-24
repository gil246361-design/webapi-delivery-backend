// Route planner for the lunch delivery assignment.
// Uses OSRM road-network distance/duration matrix; it deliberately does NOT
// fall back to straight-line distance when road routing is unavailable.
export const SHOP = { lat: 16.2465, lng: 103.2535 };
export const RULES = {
  maxOrdersPerRider: 3,
  pricePerBox: 65,
  costPerBox: 40,
  riderFeePerTrip: 15,
  feePerKmPerBox: 2,
  speedKmh: 30,
  deadlineMin: 60,
  customerRadiusKm: 3,
};
export interface Item { order_id: number; customer: string; phone: string; boxes: number; lat: number; lng: number; }
export interface PlanStop extends Item { sequence: number; arrive_min: number; late: boolean; }
export interface RiderRoute { rider: string; job_code: string; total_boxes: number; total_distance_km: number; total_time_min: number; cost: number; stops: PlanStop[]; }
export interface RoutePlan {
  plan_no: number; candidates: number; total_orders: number; total_boxes: number;
  revenue: number; food_cost: number; rider_cost: number; profit: number;
  total_distance_km: number; total_time_min: number; late_count: number;
  all_on_time: boolean; routes: RiderRoute[];
}
export function haversineKm(lat1:number,lng1:number,lat2:number,lng2:number):number {
  const rad=(d:number)=>(d*Math.PI)/180;
  const a=Math.sin(rad(lat2-lat1)/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(rad(lng2-lng1)/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
type Matrix = { distanceKm:number[][]; durationMin:number[][] };
async function roadMatrix(items: Item[]): Promise<Matrix> {
  const points = [SHOP, ...items.map(i => ({lat:i.lat,lng:i.lng}))];
  const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=distance,duration`;
  let response: Response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(25000) }); }
  catch { throw new Error('ไม่สามารถเชื่อมต่อบริการหาเส้นทางถนน OSRM ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); }
  if (!response.ok) throw new Error(`บริการหาเส้นทางถนนตอบกลับ HTTP ${response.status}`);
  const data:any = await response.json();
  if (data.code !== 'Ok' || !Array.isArray(data.distances) || !Array.isArray(data.durations))
    throw new Error('บริการหาเส้นทางไม่สามารถเชื่อมต่อจุดส่งบางจุดด้วยถนนได้ กรุณาตรวจสอบพิกัดลูกค้า');
  const distanceKm:number[][] = data.distances.map((row:number[]) => row.map(v => v == null ? Infinity : v/1000));
  const durationMin:number[][] = data.durations.map((row:number[]) => row.map(v => v == null ? Infinity : v/60));
  for (let i=0;i<points.length;i++) for (let j=0;j<points.length;j++) {
    if (!Number.isFinite(distanceKm[i]?.[j]) || !Number.isFinite(durationMin[i]?.[j]))
      throw new Error('มีจุดส่งที่ไม่มีเส้นทางถนนเชื่อมต่อ กรุณาตรวจสอบพิกัดลูกค้า');
  }
  return {distanceKm,durationMin};
}
function rng(seed:number):()=>number { let s=seed>>>0; return ()=>((s=(s*1664525+1013904223)>>>0)/4294967296); }
function pathMetric(group:Item[], matrix:number[][], itemIndex:Map<number,number>):number {
  let total=0, prev=0;
  for (const item of group) { const next=itemIndex.get(item.order_id)!; total += matrix[prev]![next]!; prev=next; }
  return total;
}
function permutations<T>(a:T[]):T[][] { if(a.length<=1)return[a]; return a.flatMap((x,i)=>permutations([...a.slice(0,i),...a.slice(i+1)]).map(p=>[x,...p])); }
function bestOrder(group:Item[], matrix:Matrix, itemIndex:Map<number,number>):Item[] {
  let best=group, bestScore=Infinity;
  for(const p of permutations(group)) {
    const d=pathMetric(p,matrix.distanceKm,itemIndex), t=pathMetric(p,matrix.durationMin,itemIndex);
    const score=15+2*p.reduce((s,x)=>s+x.boxes,0)*d+(t>RULES.deadlineMin?100000+(t-RULES.deadlineMin)*100:0);
    if(score<bestScore){bestScore=score;best=p;}
  }
  return best;
}
function evaluate(groups:Item[][], matrix:Matrix, itemIndex:Map<number,number>) {
  const ordered=groups.map(g=>bestOrder(g,matrix,itemIndex));
  let cost=0, latePenalty=0;
  for(const g of ordered){const d=pathMetric(g,matrix.distanceKm,itemIndex),t=pathMetric(g,matrix.durationMin,itemIndex),boxes=g.reduce((s,x)=>s+x.boxes,0);cost+=15+2*boxes*d;if(t>60)latePenalty+=100000+(t-60)*100;}
  return {ordered,obj:cost+latePenalty};
}
function sweepStart(items:Item[],rand:()=>number):Item[][] {
  const sorted=[...items].sort((a,b)=>Math.atan2(a.lat-SHOP.lat,a.lng-SHOP.lng)-Math.atan2(b.lat-SHOP.lat,b.lng-SHOP.lng));
  const shift=Math.floor(rand()*sorted.length), ring=[...sorted.slice(shift),...sorted.slice(0,shift)];
  const k=Math.ceil(ring.length/RULES.maxOrdersPerRider), groups:Item[][]=Array.from({length:k},()=>[]);
  ring.forEach((item,i)=>groups[Math.floor(i/3)]!.push(item));
  return groups.filter(g=>g.length);
}
function improve(groups:Item[][],rand:()=>number,matrix:Matrix,index:Map<number,number>):Item[][] {
  let cur=groups.map(g=>[...g]), score=evaluate(cur,matrix,index).obj;
  for(let it=0;it<500 && cur.length>1;it++){
    const a=Math.floor(rand()*cur.length);let b=Math.floor(rand()*cur.length);if(a===b)b=(b+1)%cur.length;
    const next=cur.map(g=>[...g]),ga=next[a]!,gb=next[b]!;if(!ga.length||!gb.length)continue;
    const i=Math.floor(rand()*ga.length);
    if(gb.length<RULES.maxOrdersPerRider&&rand()<0.5)gb.push(ga.splice(i,1)[0]!);
    else {const j=Math.floor(rand()*gb.length);[ga[i],gb[j]]=[gb[j]!,ga[i]!];}
    const cleaned=next.filter(g=>g.length);if(cleaned.some(g=>g.length>3))continue;
    const s=evaluate(cleaned,matrix,index).obj;if(s<score){cur=cleaned;score=s;}
  }
  return cur;
}
const signature=(groups:Item[][])=>groups.map(g=>g.map(x=>x.order_id).join('>')).sort().join('|');
function newCode(used:Set<string>):string {const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let c='';do{c='J'+Array.from({length:4},()=>chars[Math.floor(Math.random()*chars.length)]).join('');}while(used.has(c));used.add(c);return c;}
export async function buildPlan(items:Item[],attempt:number):Promise<RoutePlan>{
  if(items.length===0)throw new Error('ยังไม่มีออร์เดอร์ให้จัดเส้นทาง');
  const outside=items.filter(i=>haversineKm(SHOP.lat,SHOP.lng,i.lat,i.lng)>RULES.customerRadiusKm);
  if(outside.length)throw new Error(`มีลูกค้า ${outside.length} รายการอยู่นอกรัศมี 3 กม. จากร้าน (ออร์เดอร์ ${outside.map(x=>x.order_id).join(', ')}) กรุณาแก้พิกัดก่อนจัดเส้นทาง`);
  const matrix=await roadMatrix(items), index=new Map<number,number>();items.forEach((item,i)=>index.set(item.order_id,i+1));
  const idSum=items.reduce((a,s)=>a+s.order_id,0),rand=rng(items.length*7919+idSum);
  const pool=new Map<string,{ordered:Item[][];obj:number}>();
  for(let n=0;n<100;n++){const e=evaluate(improve(sweepStart(items,rand),rand,matrix,index),matrix,index);const sig=signature(e.ordered);if(!pool.has(sig))pool.set(sig,e);}
  const cands=[...pool.values()].sort((a,b)=>a.obj-b.obj);
  const pick=cands[(Math.max(1,attempt)-1)%cands.length]!;
  const used=new Set<string>();
  const routes:RiderRoute[]=pick.ordered.map((g,idx)=>{
    let dist=0,time=0,prev=0;
    const stops:PlanStop[]=g.map((s,i)=>{const n=index.get(s.order_id)!;dist+=matrix.distanceKm[prev]![n]!;time+=matrix.durationMin[prev]![n]!;prev=n;const t=Math.ceil(time);return {...s,sequence:i+1,arrive_min:t,late:t>RULES.deadlineMin};});
    const boxes=g.reduce((a,s)=>a+s.boxes,0),cost=RULES.riderFeePerTrip+RULES.feePerKmPerBox*boxes*dist;
    return {rider:`ไรเดอร์ ${idx+1}`,job_code:newCode(used),total_boxes:boxes,total_distance_km:+dist.toFixed(2),total_time_min:Math.ceil(time),cost:+cost.toFixed(2),stops};
  });
  const totalBoxes=routes.reduce((a,r)=>a+r.total_boxes,0),revenue=totalBoxes*65,foodCost=totalBoxes*40,riderTotal=routes.reduce((a,r)=>a+r.cost,0),lateCount=routes.reduce((a,r)=>a+r.stops.filter(s=>s.late).length,0);
  return {plan_no:attempt,candidates:cands.length,total_orders:items.length,total_boxes:totalBoxes,revenue,food_cost:foodCost,rider_cost:+riderTotal.toFixed(2),profit:+(revenue-foodCost-riderTotal).toFixed(2),total_distance_km:+routes.reduce((a,r)=>a+r.total_distance_km,0).toFixed(2),total_time_min:Math.max(...routes.map(r=>r.total_time_min)),late_count:lateCount,all_on_time:routes.every(r=>r.total_time_min<=RULES.deadlineMin),routes};
}

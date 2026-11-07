/** Counts only observed organizations. No synthetic history or growth percentages. */
export function suiteDistribution(tenants,suiteNames=new Map()){
 const counts=new Map();
 for(const tenant of tenants??[]){
  if(!tenant?.suiteId)continue;
  counts.set(tenant.suiteId,(counts.get(tenant.suiteId)||0)+1);
 }
 return [...counts].map(([id,count])=>({id,name:suiteNames.get(id)||id,count}))
  .sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
}

export function searchState(search) {
  const params=new URLSearchParams(search),page=Number(params.get('page'));
  return {kind:params.get('type')==='monsters'?'monsters':'items',query:params.get('q') || '',filter:params.get('filter') || '',page:Number.isSafeInteger(page)&&page>0?page:1};
}
export function searchQuery({kind,query,filter,page=1,preview=false}) {
  const params=new URLSearchParams();params.set('type',kind);
  if(preview)params.set('preview','1');
  if(query.trim())params.set('q',query.trim());if(filter)params.set('filter',filter);if(page>1)params.set('page',page);
  return '?'+params.toString();
}
export function imageFileUrl(base,filename) {
  if(typeof filename!=='string' || !filename || /[\\/\x00-\x1f]/.test(filename) || filename==='.' || filename==='..')return null;
  return base+encodeURIComponent(filename);
}
export function findRecords(records,kind,query,filter) {
  const q=query.trim().toLowerCase(),field=kind==='items'?'Type':'Race';
  return records.filter(record=>{
    if(filter && String(record.server?.[field])!==filter)return false;
    if(!q)return true;
    if(/^\d+$/.test(q))return record.id===Number(q);
    return [record.name,record.aegisName,record.server?.Name,...(record.description || [])].some(value=>String(value ?? '').replace(/\^[0-9a-f]{6}/gi,'').toLowerCase().includes(q));
  });
}

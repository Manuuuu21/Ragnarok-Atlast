import { databaseStore } from './shared.js';
import { dropIndex } from './data-core.js?v=monster-mapping-3';
import {searchState,searchQuery,imageFileUrl,findRecords} from './search-core.js';
const $=window.jQuery;
const config={sourceLabel:'Website data · Renewal',useBrowserPreview:true,itemImageBase:'data/items/',monsterImageBase:'data/monster/',cardImageBase:'data/cardbmp/',manifestUrl:'data/sprite-manifest.json',manifestBase:'data/',...window.atlasDatabaseConfig};
let tables={itemDATA:typeof itemDATA==='undefined'?{}:itemDATA,monsterDATA:typeof mobDATA!=='undefined'?mobDATA:typeof monsterDATA==='undefined'?{}:monsterDATA},kind='items',page=1,dropLookup={index:new Map(),byName:new Map()},sprites=[];
let ready=false,entriesByKind={items:[],monsters:[]};
const pageSize=10;
const preview=config.useBrowserPreview && new URLSearchParams(location.search).has('preview');
const pretty=value=>value===undefined || value===null ? 'Not supplied' : typeof value==='object' ? JSON.stringify(value) : String(value);
const label=key=>key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ');
const stripColors=text=>String(text).replace(/\^[0-9a-f]{6}/gi,'');
const formatNumber=value=>typeof value==='number' ? value.toLocaleString() : pretty(value);
function textColors(text){
  const node=$('<p>');let color=null;
  for(const part of String(text).split(/(\^[0-9a-f]{6})/gi)){
    if(/^\^[0-9a-f]{6}$/i.test(part)){color=part.slice(1)==='000000'?null:'#'+part.slice(1);continue;}
    $('<span>').text(part).css('color',color || '').appendTo(node);
  }return node;
}
function tableFor(){return kind==='items'?tables.itemDATA:tables.monsterDATA;}
function updateFilters(){
  const select=$('#type-filter').empty().append($('<option>').val('').text(kind==='items'?'All types':'All races'));
  const key=kind==='items'?'Type':'Race';
  [...new Set(Object.values(tableFor()).map(e=>e.server?.[key]).filter(v=>v!==undefined))].sort((a,b)=>String(a).localeCompare(String(b))).forEach(v=>$('<option>').val(v).text(v).appendTo(select));
}
function setKind(value){if(!ready)return;kind=value;page=1;$('#tab-items').toggleClass('active',kind==='items').attr('aria-pressed',kind==='items');$('#tab-monsters').toggleClass('active',kind==='monsters').attr('aria-pressed',kind==='monsters');updateFilters();render();}
function navigate(value,id){kind=value;$('#db-search').val(String(id));setKind(value);window.scrollTo({top:0,behavior:'smooth'});}
function recordLink(value,id,name){return $('<a>').attr('href',searchQuery({kind:value,query:String(id),preview})).text(name).on('click',e=>{if(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)return;e.preventDefault();navigate(value,id);});}
function detail(card,title,content){const row=$('<div>').addClass('detail-row').appendTo(card);$('<div>').addClass('detail-label').text(title).appendTo(row);$('<div>').addClass('detail-content').append(content).appendTo(row);}
function stats(card,db,specs){const grid=$('<dl>').addClass('stats-grid').appendTo(card);for(const [key,title,formatter] of specs){const row=$('<div>').addClass('stat').appendTo(grid);$('<dt>').text(title).appendTo(row);$('<dd>').text(formatter ? formatter(db[key]) : formatNumber(db[key])).appendTo(row);}}
function mapChips(value){
  if(!value || typeof value!=='object')return $('<span>').text(pretty(value));
  const div=$('<div>');for(const [name,enabled] of Object.entries(value))$('<span>').addClass('job-chip').text(`${name}${enabled===false?' (excluded)':''}`).appendTo(div);return div;
}
function dropRate(drop){return Number.isFinite(drop.Rate)?`${drop.Rate/100}% base rate`:'Rate not supplied';}
function spriteImage(record,isItem){
  const placeholder=$('<span>').addClass('id-placeholder').attr('aria-hidden','true').text(isItem?'◇':'♧');
  if(isItem){
    const img=$('<img>').addClass('record-icon').attr({src:imageFileUrl(config.itemImageBase,`${record.id}.png`),alt:record.name,loading:'lazy'}).hide();
    img.on('load',()=>{placeholder.hide();img.show();}).on('error',()=>img.remove());return [placeholder,img];
  }
  const match=sprites.find(s=>s.monsterId===record.id || String(s.name).toLowerCase()===record.aegisName.toLowerCase());
  const direct=imageFileUrl(config.monsterImageBase,record.gif);
  const legacy=match && typeof match.file==='string' && /^(?:monster|sprites)\//.test(match.file) && !match.file.split('/').includes('..') ? config.manifestBase+match.file.split('/').map(encodeURIComponent).join('/') : null;
  if(!direct && !legacy)return [placeholder];
  const img=$('<img>').addClass('record-monster').attr({src:direct || legacy,alt:record.name,loading:'lazy'}).hide();
  img.on('load',()=>{placeholder.hide();img.show();}).on('error',()=>img.remove());return [placeholder,img];
}
function cardHeader(record,isItem){
  const card=$('<article>').addClass('result-card'),head=$('<div>').addClass('result-heading').appendTo(card);
  head.append(...spriteImage(record,isItem));const title=$('<div>').appendTo(head);
  let name=stripColors(record.name),slots=record.server.Slots;
  if(isItem && slots>0 && !name.endsWith(`[${slots}]`))name+=` [${slots}]`;
  $('<h2>').text(name).appendTo(title);$('<p>').text(`${isItem?'Item':'Monster'} #${record.id} · ${record.aegisName || 'No server name supplied'}`).appendTo(title);
  $('<span>').addClass('type-pill').text(isItem?pretty(record.server.Type):pretty(record.server.Race)).appendTo(head);return card;
}
function extras(card,db,shown){
  const fields=Object.entries(db).filter(([key])=>!shown.has(key));
  for(const [key,value] of fields)detail(card,label(key),typeof value==='object'?$('<pre>').text(JSON.stringify(value,null,2)):$('<span>').text(pretty(value)));
}
function sourceFields(card,record){
  const details=$('<details>').addClass('raw-fields').appendTo(card);$('<summary>').text('Source fields & import provenance').appendTo(details);$('<pre>').text(JSON.stringify(record,null,2)).appendTo(details);
}
function itemCard(record){
  const db=record.server,card=cardHeader(record,true);
  const specs=[['Type','Type'],['SubType','Class / subtype'],['Buy','Buy price',v=>v===undefined?'Not supplied':`${formatNumber(v)} z`],['Sell','Sell price',v=>v===undefined?'Not supplied':`${formatNumber(v)} z`],['Weight','Weight',v=>v===undefined?'Not supplied':`${v/10} (${v} raw)`],['Attack','Attack'],['MagicAttack','Magic attack'],['Defense','Defense'],['EquipLevelMin','Required level'],['EquipLevelMax','Maximum level'],['WeaponLevel','Weapon level'],['Slots','Slots'],['Range','Attack range'],['Gender','Gender'],['Refineable','Refineable'],['ArmorLevel','Armor level']];
  stats(card,db,specs);
  for(const key of ['Jobs','Classes','Locations'])if(db[key]!==undefined)detail(card,key==='Jobs'?'Applicable jobs':label(key),mapChips(db[key]));
  const descriptions=$('<div>').addClass('description-lines');
  if(record.description?.length)record.description.forEach(line=>descriptions.append(textColors(line)));else descriptions.text('No client description supplied. Add iteminfo.lua in the Data Builder.');
  detail(card,'Description',descriptions);
  if(record.cardBmp){
    const art=$('<div>').addClass('card-art'),url=imageFileUrl(config.cardImageBase,record.cardBmp);
    if(url){const link=$('<a>').attr({href:url,target:'_blank',rel:'noopener'}).appendTo(art);$('<img>').attr({src:url,alt:`${stripColors(record.name)} illustration`,loading:'lazy'}).on('error',()=>link.replaceWith($('<span>').addClass('muted').text('Illustration file unavailable.'))).appendTo(link);}
    $('<small>').text(record.cardBmp).appendTo(art);detail(card,'Card illustration',art);
  }
  for(const key of ['Script','EquipScript','UnEquipScript'])detail(card,label(key),$('<pre>').text(db[key]===undefined?'Not supplied':db[key] || '(empty)'));
  const drops=$('<div>').addClass('drop-list'),matches=dropLookup.index.get(record.id) || [];
  for(const {monster,drop,kind:dropKind} of matches){const entry=$('<span>').append(recordLink('monsters',monster.id,monster.name));$('<small>').text(`(${dropRate(drop)}${dropKind==='MvpDrops'?', MVP reward':''})`).appendTo(entry);drops.append(entry);}
  if(!matches.length)drops.addClass('no-drop-result').text('No Result');
  detail(card,'Dropped by',drops);
  const shown=new Set(['Id','AegisName','Name','Jobs','Classes','Locations','Script','EquipScript','UnEquipScript',...specs.map(s=>s[0])]);extras(card,db,shown);
  for(const [key,value] of Object.entries(record.client || {}))if(!['identifiedDisplayName','identifiedDescriptionName'].includes(key))detail(card,'Client: '+label(key),typeof value==='object'?$('<pre>').text(JSON.stringify(value,null,2)):$('<span>').text(pretty(value)));
  sourceFields(card,record);return card;
}
function monsterCard(record){
  const db=record.server,card=cardHeader(record,false);
  const specs=[['Level','Level'],['Hp','HP'],['Sp','SP'],['BaseExp','Base EXP'],['JobExp','Job EXP'],['MvpExp','MVP EXP'],['Attack','Base attack'],['Attack2','Base magic attack'],['Defense','Defense'],['MagicDefense','Magic defense'],['Size','Size'],['Race','Race'],['Element','Element'],['ElementLevel','Element level'],['Str','STR'],['Agi','AGI'],['Vit','VIT'],['Int','INT'],['Dex','DEX'],['Luk','LUK'],['AttackRange','Attack range'],['SkillRange','Skill range'],['ChaseRange','Chase range'],['WalkSpeed','Walk speed']];stats(card,db,specs);
  for(const key of ['Drops','MvpDrops']){
    const drops=$('<div>').addClass('drop-list');
    for(const drop of db[key] || []){
      const id=typeof drop.Item==='number'?drop.Item:dropLookup.byName.get(String(drop.Item).toLowerCase()),item=tables.itemDATA[id];
      const entry=$('<span>').append(item?recordLink('items',id,item.name):$('<span>').text(pretty(drop.Item)));
      $('<small>').text(`(${dropRate(drop)})`).appendTo(entry);
      const other=Object.fromEntries(Object.entries(drop).filter(([k])=>!['Item','Rate'].includes(k)));if(Object.keys(other).length)$('<small>').text(JSON.stringify(other)).appendTo(entry);drops.append(entry);
    }
    if(!(db[key] || []).length)drops.text('No entries supplied.');detail(card,key==='Drops'?'Drops':'MVP rewards',drops);
  }
  extras(card,db,new Set(['Id','AegisName','Name','Drops','MvpDrops',...specs.map(s=>s[0])]));sourceFields(card,record);return card;
}
function render(){
  if(!ready)return;
  const entries=entriesByKind[kind],query=$('#db-search').val(),type=$('#type-filter').val();
  const filtered=findRecords(entries,kind,query,type);
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,pages);
  $('#database-empty').prop('hidden',entries.length!==0);$('#result-count').text(`${filtered.length.toLocaleString()} ${kind} found${filtered.length?` · showing ${(page-1)*pageSize+1}–${Math.min(page*pageSize,filtered.length)}`:''}`);
  const results=$('#db-results').empty();for(const record of filtered.slice((page-1)*pageSize,page*pageSize))results.append(kind==='items'?itemCard(record):monsterCard(record));
  if(entries.length && !filtered.length)$('<div>').addClass('empty-state').append($('<h2>').text('No matching records'),$('<p>').text('Try a different name, ID, or filter.')).appendTo(results);
  const pagination=$('#pagination').empty();if(pages>1){$('<button>').addClass('button').text('← Previous').prop('disabled',page===1).on('click',()=>{page--;render();window.scrollTo(0,0);}).appendTo(pagination);$('<span>').text(`Page ${page} of ${pages}`).appendTo(pagination);$('<button>').addClass('button').text('Next →').prop('disabled',page===pages).on('click',()=>{page++;render();window.scrollTo(0,0);}).appendTo(pagination);}
  history.replaceState(null,'',location.pathname+searchQuery({kind,query,filter:type,page,preview}));
}
$('#tab-items').on('click',()=>setKind('items'));$('#tab-monsters').on('click',()=>setKind('monsters'));
let debounce;$('#db-search').on('input',()=>{clearTimeout(debounce);debounce=setTimeout(()=>{page=1;render();},150);});$('#type-filter').on('change',()=>{page=1;render();});
$('#database-search-form').on('submit',e=>{e.preventDefault();clearTimeout(debounce);page=1;render();});
$('#reset-preview').on('click',async()=>{try{await databaseStore('delete');location.reload();}catch(e){$('#data-origin').text(e.message);}});
$('#data-origin').text(config.sourceLabel);
if(config.useBrowserPreview)try{const preview=await databaseStore('get');if(preview?.itemDATA && preview?.monsterDATA){tables=preview;$('#data-origin').text('Local browser preview · Renewal');$('#reset-preview').prop('hidden',false);}}catch{$('#data-origin').text(config.sourceLabel+' · browser storage unavailable');}
if(config.manifestUrl)try{const response=await fetch(config.manifestUrl);if(response.ok){const manifest=await response.json();if(Array.isArray(manifest))sprites=manifest.sort((a,b)=>a.action-b.action);}}catch{/* Artwork is optional. */}
try{
  for(const [key,value] of Object.entries(tables))if(!value || typeof value!=='object')throw new Error(`${key} must be an object keyed by ID.`);
  entriesByKind={items:Object.values(tables.itemDATA).sort((a,b)=>a.id-b.id),monsters:Object.values(tables.monsterDATA).sort((a,b)=>a.id-b.id)};
  dropLookup=dropIndex(tables.itemDATA,tables.monsterDATA);$('#items-total').text(entriesByKind.items.length.toLocaleString());$('#monsters-total').text(entriesByKind.monsters.length.toLocaleString());
  if(config.missingFiles?.length)$('#data-load-report').prop('hidden',false).text('Not found: '+config.missingFiles.join('; ')+'. Add the exported files to lib/ and refresh.');
  ready=true;const state=searchState(location.search);kind=state.kind;page=state.page;$('#db-search').val(state.query);updateFilters();$('#type-filter').val(state.filter);if($('#type-filter').val()===null)$('#type-filter').val('');
  $('#tab-items').toggleClass('active',kind==='items').attr('aria-pressed',kind==='items');$('#tab-monsters').toggleClass('active',kind==='monsters').attr('aria-pressed',kind==='monsters');render();
}catch(e){$('#result-count').text('Unable to read database.');$('#data-load-report').prop('hidden',false).text(e.message+' Use files exported by Data Builder.');}

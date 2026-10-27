import { pairFiles,parseSpr,parseAct } from './formats.js';
import { Renderer,measure } from './renderer.js';
import { download } from './shared.js';
const $=window.jQuery;
let pairs=[], current=null, renderer=null, act=null, spr=null, bounds=null, frame=0, timer=null, playing=true, generation=0, exportWorker=null, cancelReject=null, cancelled=false, exporting=false;
const canvas=document.getElementById('sprite-canvas');
function report(message) { const el=$('#sprite-report'); if(el.text()==='No issues reported.') el.empty(); el.append(document.createTextNode(message+'\n')); }
function listPairs() {
  const list=$('#sprite-list').empty(), query=$('#sprite-filter').val().toLowerCase();
  for(const pair of pairs.filter(p=>p.path.toLowerCase().includes(query))) $('<button>').text(pair.name).append($('<small>').text(pair.path)).toggleClass('active',current?.key===pair.key).prop('disabled',exporting).on('click',()=>selectPair(pair)).appendTo(list);
}
$('#sprite-filter').on('input',listPairs);
$('#sprite-folder,#sprite-files').on('change',function(){
  generation++; clearTimeout(timer); current=null;act=null;spr=null;renderer=null;
  const result=pairFiles(this.files); pairs=result.pairs;$('#pair-count').text(`${pairs.length} pairs`);$('#sprite-report').text(result.problems.join('\n') || 'No issues reported.');
  if(result.ignored) report(`${result.ignored} unrelated files ignored.`);
  $('#export-batch').prop('disabled',!pairs.length);$('#export-gif,#play-toggle,#action-select').prop('disabled',true);
  $('#preview-placeholder').show().text('Select a sprite to preview.');canvas.width=1;canvas.height=1;listPairs();
  if(pairs.length) selectPair(pairs[0]); else $('#sprite-status').text('No matching ACT + SPR pairs found.'); this.value='';
});
async function selectPair(pair) {
  const token=++generation;clearTimeout(timer);current=pair;act=null;listPairs();$('#sprite-title').text(pair.name);$('#sprite-status').text('Reading sprite…');$('#export-gif,#play-toggle,#action-select').prop('disabled',true);
  try {
    if(pair.spr.size>64*1024*1024 || pair.act.size>64*1024*1024) throw new Error('Asset exceeds the 64 MB limit.');
    const buffers=await Promise.all([pair.spr.arrayBuffer(),pair.act.arrayBuffer()]);if(token!==generation)return;
    spr=parseSpr(buffers[0]);act=parseAct(buffers[1]);renderer=new Renderer(spr);
    const select=$('#action-select').empty();
    act.actions.forEach((a,i)=>$('<option>').val(i).text(`Action ${i} · ${a.frames.length} frames`).prop('disabled',!a.frames.length).appendTo(select));
    const first=act.actions.findIndex(a=>a.frames.length);if(first<0)throw new Error('ACT contains no animation frames.');select.val(first);
    $('#sprite-version').text(`SPR ${spr.version} / ACT ${act.version}`);$('#play-toggle,#action-select').prop('disabled',false);$('#preview-placeholder').hide();$('#sprite-status').text('Ready to export.');restart();
  } catch(e) {if(token!==generation)return;act=null;$('#sprite-status').text(e.message);$('#preview-placeholder').show().text('Unable to preview this sprite.');report(`${pair.path}: ${e.message}`);}
}
function options(){return{scale:Number($('#scale').val()),speed:Number($('#speed').val()),background:$('#background').val() || null};}
function draw() {
  if(!act || !bounds)return;
  const action=act.actions[Number($('#action-select').val())];
  renderer.draw(canvas,action.frames[frame],bounds,options().background);
  $('#frame-info').text(`${frame+1} / ${action.frames.length} frames · ${bounds.width} × ${bounds.height}`);
  if(playing)timer=setTimeout(()=>{frame=(frame+1)%action.frames.length;draw();},Math.max(20,action.delay/options().speed));
}
function restart(){clearTimeout(timer);frame=0;if(!act)return;try{bounds=measure(spr,act.actions[Number($('#action-select').val())],options().scale);draw();$('#export-gif').prop('disabled',false);$('#sprite-status').text('Ready to export.');}catch(e){bounds=null;$('#export-gif').prop('disabled',true);$('#sprite-status').text(e.message);}}
$('#action-select,#scale,#speed,#background').on('change',restart);
$('#play-toggle').on('click',()=>{playing=!playing;$('#play-toggle').text(playing?'Pause':'Play');clearTimeout(timer);draw();});
function setExporting(value){exporting=value;$('#sprite-files,#sprite-folder,#action-select,#scale,#speed,#background,#batch-mode,#export-gif,#export-batch').prop('disabled',value);$('#cancel-export').prop('hidden',!value);if(!value){$('#export-gif').prop('disabled',!act || !bounds);$('#export-batch').prop('disabled',!pairs.length);$('#action-select').prop('disabled',!act);}listPairs();}
function renderPair(pair,mode,action,opts,onGif,onProgress){return new Promise((resolve,reject)=>{
  if(pair.spr.size>64*1024*1024 || pair.act.size>64*1024*1024){reject(new Error('Asset exceeds the 64 MB limit.'));return;}
  cancelReject=reject;exportWorker=new Worker('assets/sprite-worker.js',{type:'module'});
  const finish=(error)=>{exportWorker?.terminate();exportWorker=null;cancelReject=null;error?reject(error):resolve();};
  exportWorker.onmessage=({data})=>{if(data.type==='gif'){try{onGif(data);}catch(e){finish(e);}}else if(data.type==='progress')onProgress(data);else if(data.type==='done')finish();else if(data.type==='error')finish(new Error(data.message));};
  exportWorker.onerror=(e)=>finish(new Error(e.message || 'Export worker failed.'));
  exportWorker.postMessage({pair,mode,action,options:opts});
});}
$('#cancel-export').on('click',()=>{cancelled=true;exportWorker?.terminate();exportWorker=null;cancelReject?.(new Error('Export cancelled.'));cancelReject=null;});
$('#export-gif').on('click',async()=>{
  if(!current || !act)return;setExporting(true);cancelled=false;
  try{await renderPair(current,'selected',Number($('#action-select').val()),options(),result=>download(result.bytes,`${current.name}.gif`,'image/gif'),p=>{$('#export-progress').val(p.done/p.total*100);$('#sprite-status').text(`Encoding frame ${p.done}/${p.total}…`);});$('#sprite-status').text('GIF downloaded.');}catch(e){$('#sprite-status').text(e.message);}finally{setExporting(false);}
});
$('#export-batch').on('click',async()=>{
  setExporting(true);cancelled=false;const archive=Object.create(null),manifest=[],errors=[],exportedNames=new Map(),opts=options(),mode=$('#batch-mode').val(),action=Number($('#action-select').val() || 0);let bytes=0;
  try{
    for(let i=0;i<pairs.length;i++){
      if(cancelled)throw new Error('Export cancelled.');const pair=pairs[i];
      try{
        const filename=`monster/${pair.name}.gif`,nameKey=filename.normalize('NFC').toLowerCase();
        if(exportedNames.has(nameKey))throw new Error(`Duplicate output name ${filename}; already exported from ${exportedNames.get(nameKey)}. Rename one source pair to include both.`);
        await renderPair(pair,mode,action,opts,result=>{
        bytes+=result.bytes.byteLength;if(bytes>200*1024*1024)throw new Error('ZIP memory limit reached (200 MB). Export a smaller folder.');
        exportedNames.set(nameKey,pair.path);
        archive[filename]=result.bytes;manifest.push({name:pair.name,source:pair.path,action:result.action,file:filename,width:result.width,height:result.height,frames:result.frames,delay:result.delay});
      },p=>{$('#sprite-status').text(`${i+1}/${pairs.length}: ${pair.name} · action ${p.action}, frame ${p.done}/${p.total}`);});}catch(e){if(cancelled || bytes>200*1024*1024)throw e;errors.push(`${pair.path}: ${e.message}`);}
      $('#export-progress').val((i+1)/pairs.length*100);
    }
    if(!manifest.length)throw new Error('No GIFs were generated. See the export report.');
    archive['sprite-manifest.json']=new TextEncoder().encode(JSON.stringify(manifest,null,2));archive['export-report.txt']=new TextEncoder().encode(errors.join('\n') || 'All selected animations exported successfully.');
    const zip=await new Promise((resolve,reject)=>fflate.zip(archive,{level:0},(e,data)=>e?reject(e):resolve(data)));
    if(cancelled)throw new Error('Export cancelled.');download(zip,'monster-sprites.zip','application/zip');$('#sprite-status').text(`${manifest.length} GIFs exported${errors.length?` · ${errors.length} files had errors`:''}.`);
  }catch(e){$('#sprite-status').text(e.message);}finally{errors.forEach(report);setExporting(false);}
});

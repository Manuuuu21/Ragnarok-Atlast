import { parseSpr, parseAct } from './formats.js';
import { encodeGif } from './renderer.js';
self.onmessage = async ({data})=>{
  try {
    const spr=parseSpr(await data.pair.spr.arrayBuffer()), act=parseAct(await data.pair.act.arrayBuffer());
    if (!['first','selected'].includes(data.mode)) throw new Error('Choose one animation per sprite: selected action or first nonempty action.');
    const indices = data.mode === 'first' ? [act.actions.findIndex(a=>a.frames.length)] : [data.action];
    if (!indices.length || indices[0] < 0) throw new Error('No nonempty actions.');
    for (const index of indices) {
      const result = await encodeGif(spr,act.actions[index],data.options,(done,total)=>self.postMessage({type:'progress',action:index,done,total}));
      self.postMessage({type:'gif',action:index,...result},[result.bytes.buffer]);
    }
    self.postMessage({type:'done'});
  } catch (e) { self.postMessage({type:'error',message:e.message}); }
};

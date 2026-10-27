export function download(data,name,type='application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data],{type})), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export function databaseStore(mode,value) {
  return new Promise((resolve,reject)=>{
    const request = indexedDB.open('ragnarok-atlas',1);
    request.onupgradeneeded = ()=>request.result.createObjectStore('tables');
    request.onerror = ()=>reject(request.error);
    request.onsuccess = ()=>{
      const db = request.result, tx = db.transaction('tables',mode === 'get' ? 'readonly':'readwrite'), store = tx.objectStore('tables');
      const operation = mode === 'get' ? store.get('current') : mode === 'delete' ? store.delete('current') : store.put(value,'current');
      tx.oncomplete = ()=>{resolve(operation.result);db.close();};
      tx.onerror = ()=>{reject(tx.error);db.close();};
      tx.onabort = ()=>{reject(tx.error || new Error('Browser storage transaction aborted.'));db.close();};
    };
  });
}
export const tick = ()=>new Promise(resolve=>setTimeout(resolve,0));

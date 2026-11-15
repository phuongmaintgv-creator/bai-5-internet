const CACHE_NAME='bai5-pwa-v1';
const CORE_PATHS=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
const VIDEO_PATH='./BAI_5_INTERNET.mp4';
const scopeUrl=self.registration.scope;
const CORE_URLS=CORE_PATHS.map(function(p){return new URL(p,scopeUrl).href;});
const VIDEO_URL=new URL(VIDEO_PATH,scopeUrl).href;

self.addEventListener('install',function(event){
  event.waitUntil(caches.open(CACHE_NAME).then(function(cache){
    return cache.addAll(CORE_URLS);
  }).then(function(){return self.skipWaiting();}));
});

self.addEventListener('activate',function(event){
  event.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k.indexOf('bai5-')===0&&k!==CACHE_NAME;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();}));
});

function tellClients(status){
  self.clients.matchAll({includeUncontrolled:true,type:'window'}).then(function(list){
    list.forEach(function(client){client.postMessage({type:'VIDEO_CACHE_STATUS',status:status});});
  });
}

function cacheVideo(){
  return caches.open(CACHE_NAME).then(function(cache){
    return cache.match(VIDEO_URL).then(function(hit){
      if(hit){tellClients('ready');return true;}
      tellClients('caching');
      return fetch(VIDEO_URL,{cache:'reload'}).then(function(response){
        if(!response.ok||response.status!==200)throw new Error('video fetch failed');
        return cache.put(VIDEO_URL,response.clone()).then(function(){tellClients('ready');return true;});
      });
    });
  }).catch(function(){tellClients('error');return false;});
}

self.addEventListener('message',function(event){
  if(event.data&&event.data.type==='CACHE_VIDEO'){
    event.waitUntil(cacheVideo());
  }
});

function parseRange(rangeHeader,size){
  const m=/bytes=(\d*)-(\d*)/.exec(rangeHeader||'');
  if(!m)return null;
  let start=m[1]?parseInt(m[1],10):null;
  let end=m[2]?parseInt(m[2],10):null;
  if(start===null&&end===null)return null;
  if(start===null){
    const suffix=end;
    if(!suffix||suffix<=0)return null;
    start=Math.max(size-suffix,0);
    end=size-1;
  }else{
    if(end===null||end>=size)end=size-1;
  }
  if(start<0||start>=size||end<start)return {invalid:true};
  return {start:start,end:end};
}

function responseFromCachedVideo(request,cached){
  const range=request.headers.get('range');
  if(!range)return cached;
  return cached.arrayBuffer().then(function(buffer){
    const size=buffer.byteLength;
    const r=parseRange(range,size);
    if(!r||r.invalid){
      return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size,'Accept-Ranges':'bytes'}});
    }
    const chunk=buffer.slice(r.start,r.end+1);
    return new Response(chunk,{status:206,statusText:'Partial Content',headers:{
      'Content-Type':'video/mp4',
      'Content-Length':String(chunk.byteLength),
      'Content-Range':'bytes '+r.start+'-'+r.end+'/'+size,
      'Accept-Ranges':'bytes',
      'Cache-Control':'no-cache'
    }});
  });
}

function handleVideo(request){
  return caches.open(CACHE_NAME).then(function(cache){
    return cache.match(VIDEO_URL).then(function(cached){
      if(cached)return responseFromCachedVideo(request,cached);
      return fetch(request).then(function(response){
        if(!request.headers.get('range')&&response.ok&&response.status===200){
          cache.put(VIDEO_URL,response.clone());
        }
        return response;
      });
    });
  });
}

function cacheFirst(request){
  return caches.match(request).then(function(cached){
    if(cached)return cached;
    return fetch(request).then(function(response){
      if(response&&response.ok&&request.method==='GET'){
        const copy=response.clone();
        caches.open(CACHE_NAME).then(function(cache){cache.put(request,copy);});
      }
      return response;
    });
  });
}

self.addEventListener('fetch',function(event){
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.href===VIDEO_URL){
    event.respondWith(handleVideo(request));
    return;
  }
  if(url.origin===location.origin){
    event.respondWith(cacheFirst(request));
  }
});

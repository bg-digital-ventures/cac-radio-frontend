export const API_BASE=localStorage.getItem("cac_api_base")||"http://localhost:8000";
async function req(path,options={}){
 const r=await fetch(API_BASE+path,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});
 if(!r.ok) throw new Error(await r.text());
 return r.json();
}
export const liveApi={
 start:data=>req("/api/live/start",{method:"POST",body:JSON.stringify(data)}),
 stop:data=>req("/api/live/stop",{method:"POST",body:JSON.stringify(data)}),
 connectHQ:data=>req("/api/live/connect-hq",{method:"POST",body:JSON.stringify(data)}),
 disconnectHQ:()=>req("/api/live/disconnect-hq",{method:"POST",body:"{}"})
};

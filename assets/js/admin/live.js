import { bootAdmin } from "../components/admin-layout.js";
import { COLLECTIONS } from "../config/collections.js";
import { add, update, getAll } from "../services/firestore.js";
import { liveApi, API_BASE } from "../services/api.js";
import { toast } from "../components/toast.js";

const profile=await bootAdmin(); if(!profile) throw new Error("Not authenticated");
const isHQ=profile.role==="hq_admin";
const branchId=isHQ?"hq":(profile.branchId||profile.id);
const branchName=isHQ?"Headquarters":(profile.branchName||"Branch");
document.getElementById("broadcastIdentity").textContent=`Broadcasting as ${branchName}`;
document.getElementById("hqControls").hidden=!isHQ;

let stream=null, recorder=null, socket=null, broadcastId=null;

let programmes=await getAll(COLLECTIONS.PROGRAMMES);
if(!isHQ)programmes=programmes.filter(x=>!x.branchId||x.branchId===profile.branchId);
document.getElementById("programmeSelect").innerHTML='<option value="">Select programme</option>'+programmes.map(x=>`<option value="${x.id}">${x.title||"Programme"}</option>`).join("");

if(isHQ){
 const branches=(await getAll(COLLECTIONS.BRANCHES)).filter(x=>x.status==="active");
 document.getElementById("hqBranchSelect").innerHTML='<option value="">Select branch live feed</option>'+branches.map(x=>`<option value="${x.id}">${x.branchName}</option>`).join("");
}

document.getElementById("previewMic").onclick=async()=>{
 try{stream=await navigator.mediaDevices.getUserMedia({audio:true});document.getElementById("micState").textContent="Microphone ready";toast("Microphone access granted.","success");}
 catch(e){console.error(e);toast("Microphone permission denied.","error");}
};

document.getElementById("startLive").onclick=async()=>{
 try{
  if(!stream)stream=await navigator.mediaDevices.getUserMedia({audio:true});
  const title=document.getElementById("liveTitle").value.trim()||"Live Broadcast";
  const presenter=document.getElementById("presenter").value.trim();
  const programmeId=document.getElementById("programmeSelect").value;
  const result=await liveApi.start({branchId,branchName,title,presenter,programmeId});
  broadcastId=await add(COLLECTIONS.BROADCASTS,{branchId,branchName,title,presenter,programmeId,status:"live",isPublic:true,streamUrl:result.publicStreamUrl||""});
  const wsBase=API_BASE.replace(/^http/,"ws");
  socket=new WebSocket(`${wsBase}/ws/live/${encodeURIComponent(branchId)}?token=${encodeURIComponent(result.sessionToken)}`);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  const mime=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm";
  recorder=new MediaRecorder(stream,{mimeType:mime});
  recorder.ondataavailable=e=>{if(e.data.size&&socket.readyState===WebSocket.OPEN)socket.send(e.data);};
  recorder.start(1000);
  document.getElementById("liveState").textContent="LIVE";document.getElementById("liveState").classList.add("live");
  document.getElementById("startLive").disabled=true;document.getElementById("stopLive").disabled=false;
  toast("Live broadcast started.","success");
 }catch(e){console.error(e);toast("Unable to start live. Check backend, stream server and microphone.","error");}
};

document.getElementById("stopLive").onclick=async()=>{
 try{
  if(recorder&&recorder.state!=="inactive")recorder.stop();socket?.close();stream?.getTracks().forEach(t=>t.stop());
  await liveApi.stop({branchId,broadcastId});
  if(broadcastId)await update(COLLECTIONS.BROADCASTS,broadcastId,{status:"ended"});
  document.getElementById("liveState").textContent="OFFLINE";document.getElementById("liveState").classList.remove("live");
  document.getElementById("startLive").disabled=false;document.getElementById("stopLive").disabled=true;
  toast("Broadcast stopped.","success");
 }catch(e){console.error(e);toast("Unable to stop cleanly.","error");}
};

document.getElementById("connectHQ")?.addEventListener("click",async()=>{
 const target=document.getElementById("hqBranchSelect").value;if(!target){toast("Select a branch first.","error");return;}
 try{const r=await liveApi.connectHQ({branchId:target});toast("Branch connected to Headquarters output.","success");}
 catch(e){console.error(e);toast("Unable to connect branch to HQ.","error");}
});
document.getElementById("disconnectHQ")?.addEventListener("click",async()=>{
 try{await liveApi.disconnectHQ();toast("HQ relay disconnected.","success");}catch(e){console.error(e);toast("Unable to disconnect relay.","error");}
});

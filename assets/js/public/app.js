import { COLLECTIONS } from "../config/collections.js";
import { add, listen } from "../services/firestore.js";
import { getSettings } from "../services/settings.js";
import { initializeTheme } from "../components/theme.js";
import { toast } from "../components/toast.js";

initializeTheme();
document.getElementById("currentYear").textContent=new Date().getFullYear();
document.getElementById("menuToggle")?.addEventListener("click",()=>document.getElementById("mainNav")?.classList.toggle("open"));
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

const settings=await getSettings();
const audio=document.getElementById("radioAudio");
if(audio){audio.src=settings.radio?.publicStreamUrl||"";audio.volume=Number(settings.radio?.defaultVolume??.8);}
for(const [id,val] of [["contactPhone",settings.general?.contactPhone],["contactEmail",settings.general?.contactEmail],["contactAddress",settings.general?.address]]){
 const el=document.getElementById(id);if(el)el.textContent=val||"—";
}

document.getElementById("playButton")?.addEventListener("click",async()=>{
 if(!audio?.src){toast("Live stream URL is not configured yet.","error");return;}
 try{
  if(audio.paused){await audio.play();document.getElementById("playIcon").className="fa-solid fa-pause";document.getElementById("playerStatus").textContent="Playing";}
  else{audio.pause();document.getElementById("playIcon").className="fa-solid fa-play";document.getElementById("playerStatus").textContent="Paused";}
 }catch(e){console.error(e);toast("Unable to play the stream.","error");}
});
document.getElementById("volume")?.addEventListener("input",e=>audio&&(audio.volume=Number(e.target.value)));


let branches = [];
let broadcasts = [];

function renderBranches() {
  const active = branches.filter(x => !x.status || x.status === "active");

  document.getElementById("branchGrid").innerHTML = active.length
    ? active.map(x => {
        const live = broadcasts.find(
          b => b.branchId === x.id && b.status === "live" && b.isPublic !== false
        );

        return `<article class="card branch-card">
          <div class="branch-card-top">
            <span class="tag">${x.type === "headquarters" ? "Headquarters" : "Branch"}</span>
            ${live ? '<span class="branch-live-badge">LIVE</span>' : '<span class="branch-offline-badge">OFFLINE</span>'}
          </div>

          <h3>${esc(x.branchName)}</h3>
          <p>${esc(x.address || "")}</p>
          <small>${esc(x.state || "")} ${esc(x.country || "")}</small>

          ${
            live
              ? `<div class="branch-live-summary">
                   <strong>${esc(live.title || "Live Broadcast")}</strong>
                   <span>${esc(live.presenter || "")}</span>
                 </div>
                 <a class="btn primary branch-join-btn" href="branch.html?id=${encodeURIComponent(x.id)}">
                   <i class="fa-solid fa-headphones"></i> Join Live
                 </a>`
              : `<a class="btn ghost branch-join-btn" href="branch.html?id=${encodeURIComponent(x.id)}">View Branch</a>`
          }
        </article>`;
      }).join("")
    : `<div class="empty">No branches added yet.</div>`;

  document.getElementById("prayerBranch").innerHTML =
    `<option value="">Select branch</option>` +
    active.map(x => `<option value="${esc(x.id)}">${esc(x.branchName)}</option>`).join("");
}

listen(COLLECTIONS.BRANCHES, items => {
  branches = items;
  renderBranches();
}, "branchName", "asc");

listen(COLLECTIONS.BROADCASTS, items => {
  broadcasts = items;
  renderBranches();

  const live = items.find(
    x =>
      x.status === "live" &&
      x.isPublic !== false &&
      (x.isMain === true || x.branchId === "hq")
  );

  const badge = document.getElementById("liveBadge");

  if (live) {
    badge.textContent = `LIVE • ${live.branchName || "Headquarters"}`;
    badge.classList.add("on");
    document.getElementById("nowPlaying").textContent = live.title || "Live Broadcast";
    document.getElementById("liveBranch").textContent = live.branchName || "Headquarters";
  } else {
    badge.textContent = "OFFLINE";
    badge.classList.remove("on");
    document.getElementById("nowPlaying").textContent = "CAC Agbara Aanu Sioni Radio";
    document.getElementById("liveBranch").textContent = "Choose a live branch below or wait for the main broadcast";
  }
});

listen(COLLECTIONS.PROGRAMMES,items=>{
 const active=items.filter(x=>!x.status||x.status==="active").slice(0,6);
 document.getElementById("programmeGrid").innerHTML=active.length?active.map(x=>`<article class="card"><span class="tag">${esc(x.day||"Programme")}</span><h3>${esc(x.title)}</h3><p>${esc(x.description||"")}</p><strong>${esc(x.startTime||"")}${x.endTime?" – "+esc(x.endTime):""}</strong></article>`).join(""):`<div class="empty">No programmes yet.</div>`;
});

listen(COLLECTIONS.ANNOUNCEMENTS,items=>{
 const data=items.filter(x=>x.status==="published"||!x.status).slice(0,6);
 document.getElementById("announcementGrid").innerHTML=data.length?data.map(x=>`<article class="card"><span class="tag">${esc(x.category||"Announcement")}</span><h3>${esc(x.title)}</h3><p>${esc(x.message||"")}</p></article>`).join(""):`<div class="empty">No announcements yet.</div>`;
});

listen(COLLECTIONS.BROADCASTS,items=>{
 const live=items.find(x=>x.status==="live"&&x.isPublic!==false);
 const badge=document.getElementById("liveBadge");
 if(live){badge.textContent=`LIVE • ${live.branchName||"Headquarters"}`;badge.classList.add("on");document.getElementById("nowPlaying").textContent=live.title||"Live Broadcast";document.getElementById("liveBranch").textContent=live.branchName||"Headquarters";}
 else{badge.textContent="OFFLINE";badge.classList.remove("on");document.getElementById("nowPlaying").textContent="CAC Agbara Aanu Sioni Radio";document.getElementById("liveBranch").textContent="Waiting for live broadcast";}
});

const forms=[
 ["prayerForm",COLLECTIONS.PRAYER_REQUESTS,f=>({fullName:f.fullName.value.trim(),phone:f.phone.value.trim(),email:f.email.value.trim(),branchId:f.branchId.value,branchName:f.branchId.selectedOptions[0]?.textContent||"",prayerRequest:f.prayerRequest.value.trim(),isAnonymous:f.isAnonymous.checked,isPrivate:f.isPrivate.checked,status:"pending"}),"Prayer request submitted."],
 ["commentForm",COLLECTIONS.COMMENTS,f=>({fullName:f.fullName.value.trim(),email:f.email.value.trim(),message:f.message.value.trim(),status:"pending"}),"Comment submitted for approval."],
 ["contactForm",COLLECTIONS.MESSAGES,f=>({fullName:f.fullName.value.trim(),email:f.email.value.trim(),phone:f.phone.value.trim(),subject:f.subject.value.trim(),message:f.message.value.trim(),status:"unread"}),"Message sent successfully."],
 ["subscribeForm",COLLECTIONS.SUBSCRIBERS,f=>({email:f.email.value.trim(),status:"active",source:"website"}),"Subscription successful."]
];
for(const [id,c,make,msg] of forms){
 document.getElementById(id)?.addEventListener("submit",async e=>{e.preventDefault();try{await add(c,make(e.currentTarget));e.currentTarget.reset();toast(msg,"success");}catch(err){console.error(err);toast("Unable to submit. Please try again.","error");}});
}

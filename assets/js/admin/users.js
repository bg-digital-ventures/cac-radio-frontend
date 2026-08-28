import { bootAdmin } from "../components/admin-layout.js";
import { COLLECTIONS } from "../config/collections.js";
import { add, update, remove, listen } from "../services/firestore.js";
import { toast } from "../components/toast.js";

const profile=await bootAdmin(); if(!profile) throw new Error("Not authenticated");
const COLLECTION=COLLECTIONS.USERS;
const config={"search": ["fullName", "email", "role", "status"], "columns": ["fullName", "email", "role", "status", "branchId"], "branchScoped": false};
let items=[],editing=null;
const body=document.getElementById("dataBody"),form=document.getElementById("itemForm"),modal=document.getElementById("itemModal");

const canSee=x=>profile.role==="hq_admin"||!config.branchScoped||!x.branchId||x.branchId===profile.branchId;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

function render(){
 const term=(document.getElementById("search")?.value||"").toLowerCase();
 const filtered=items.filter(canSee).filter(x=>config.search.some(k=>String(x[k]||"").toLowerCase().includes(term)));
 body.innerHTML=filtered.length?filtered.map(x=>`<tr>${config.columns.map(k=>`<td>${esc(x[k]??"—")}</td>`).join("")}<td><button data-edit="${x.id}">Edit</button> <button data-delete="${x.id}">Delete</button></td></tr>`).join(""):`<tr><td colspan="${config.columns.length+1}">No records found.</td></tr>`;
}
listen(COLLECTION,data=>{items=data;render();},config.order||"createdAt",config.direction||"desc");
document.getElementById("search")?.addEventListener("input",render);
document.getElementById("addButton")?.addEventListener("click",()=>{editing=null;form.reset();modal.classList.add("show");});
document.querySelectorAll("[data-close-modal]").forEach(b=>b.addEventListener("click",()=>modal.classList.remove("show")));
body?.addEventListener("click",async e=>{
 const eb=e.target.closest("[data-edit]"),db=e.target.closest("[data-delete]");
 if(eb){editing=items.find(x=>x.id===eb.dataset.edit);for(const [k,v]of Object.entries(editing||{})){const el=form.elements[k];if(el)el.value=v??"";}modal.classList.add("show");}
 if(db&&confirm("Delete this record?")){try{await remove(COLLECTION,db.dataset.delete);toast("Deleted.","success");}catch(err){console.error(err);toast("Delete failed.","error");}}
});
form?.addEventListener("submit",async e=>{
 e.preventDefault();const data=Object.fromEntries(new FormData(form).entries());
 if(config.branchScoped&&profile.role==="branch_admin"){data.branchId=profile.branchId;data.branchName=profile.branchName||"";}
 try{editing?await update(COLLECTION,editing.id,data):await add(COLLECTION,data);modal.classList.remove("show");form.reset();toast("Saved successfully.","success");}
 catch(err){console.error(err);toast("Unable to save.","error");}
});

import { bootAdmin } from "../components/admin-layout.js";
import { COLLECTIONS } from "../config/collections.js";
import { getAll } from "../services/firestore.js";
const profile=await bootAdmin(); if(!profile) throw new Error("Not authenticated");
const sets=[["branches",COLLECTIONS.BRANCHES],["programmes",COLLECTIONS.PROGRAMMES],["broadcasts",COLLECTIONS.BROADCASTS],["prayers",COLLECTIONS.PRAYER_REQUESTS],["comments",COLLECTIONS.COMMENTS],["messages",COLLECTIONS.MESSAGES],["subscribers",COLLECTIONS.SUBSCRIBERS],["users",COLLECTIONS.USERS]];
for(const [id,c] of sets){
 let data=await getAll(c);
 if(profile.role==="branch_admin"&&!["branches","users"].includes(id))data=data.filter(x=>!x.branchId||x.branchId===profile.branchId);
 const el=document.getElementById("stat-"+id);if(el)el.textContent=data.length;
}

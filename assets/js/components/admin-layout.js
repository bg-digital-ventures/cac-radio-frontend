import { currentProfile, logout } from "../services/auth.js";
import { initializeTheme } from "./theme.js";
export async function bootAdmin(){
 const p=await currentProfile();
 if(!p||p.status==="suspended"){location.replace(location.pathname.includes("/pages/")?"../login.html":"login.html");return null;}
 initializeTheme();
 document.getElementById("adminName")&&(document.getElementById("adminName").textContent=p.fullName||"Administrator");
 document.getElementById("adminRole")&&(document.getElementById("adminRole").textContent=(p.role||"").replaceAll("_"," "));
 document.getElementById("logoutButton")?.addEventListener("click",async()=>{await logout();location.replace(location.pathname.includes("/pages/")?"../login.html":"login.html");});
 document.getElementById("sidebarToggle")?.addEventListener("click",()=>document.getElementById("adminSidebar")?.classList.toggle("open"));
 if(p.role==="branch_admin") document.querySelectorAll("[data-hq-only]").forEach(x=>x.remove());
 return p;
}

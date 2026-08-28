import { bootAdmin } from "../components/admin-layout.js";
import { getSettings, saveSettings } from "../services/settings.js";
import { toast } from "../components/toast.js";
const p=await bootAdmin(); if(!p) throw new Error("Not authenticated");
if(p.role!=="hq_admin") location.replace("../dashboard.html");
const form=document.getElementById("settingsForm"),s=await getSettings();
for(const [g,obj] of Object.entries(s)){for(const [k,v] of Object.entries(obj||{})){const el=form.elements[`${g}.${k}`];if(el)el.value=v??"";}}
form.addEventListener("submit",async e=>{
 e.preventDefault();const data={general:{},radio:{},social:{},appearance:{}};
 for(const el of form.elements){if(!el.name?.includes("."))continue;const[g,k]=el.name.split(".");data[g]??={};data[g][k]=el.type==="number"?Number(el.value):el.value;}
 try{await saveSettings(data);toast("Settings saved.","success");}catch(err){console.error(err);toast("Save failed.","error");}
});

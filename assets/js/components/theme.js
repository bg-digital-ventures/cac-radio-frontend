const KEY="cac_theme";
function apply(theme){
 document.documentElement.dataset.theme=theme; localStorage.setItem(KEY,theme);
 document.querySelectorAll("[data-theme-icon]").forEach(i=>i.className=theme==="dark"?"fa-solid fa-sun":"fa-solid fa-moon");
}
export function initializeTheme(){
 const saved=localStorage.getItem(KEY), sys=matchMedia("(prefers-color-scheme:dark)").matches;
 apply(saved||(sys?"dark":"light"));
 document.querySelectorAll("[data-theme-toggle]").forEach(b=>b.addEventListener("click",()=>apply(document.documentElement.dataset.theme==="dark"?"light":"dark")));
}

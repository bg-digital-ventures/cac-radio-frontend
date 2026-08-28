export function toast(message,type="info"){
 let c=document.getElementById("toastContainer");
 if(!c){c=document.createElement("div");c.id="toastContainer";c.className="toast-container";document.body.appendChild(c);}
 const t=document.createElement("div");t.className=`toast ${type}`;t.textContent=message;c.appendChild(t);
 requestAnimationFrame(()=>t.classList.add("show"));
 setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.remove(),200)},3500);
}

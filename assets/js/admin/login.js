import { login, waitForUser } from "../services/auth.js";
import { initializeTheme } from "../components/theme.js";
import { toast } from "../components/toast.js";
initializeTheme();
if(await waitForUser()) location.replace("dashboard.html");
document.getElementById("loginForm")?.addEventListener("submit",async e=>{
 e.preventDefault();const b=e.currentTarget.querySelector("button[type=submit]");
 try{b.disabled=true;b.textContent="Signing in...";await login(e.currentTarget.email.value,e.currentTarget.password.value);location.replace("dashboard.html");}
 catch(err){console.error(err);toast("Login failed. Check your email and password.","error");}
 finally{b.disabled=false;b.textContent="Sign In";}
});

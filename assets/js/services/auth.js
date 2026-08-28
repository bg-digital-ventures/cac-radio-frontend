import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth } from "../config/firebase-config.js";
import { getOne } from "./firestore.js";
import { COLLECTIONS } from "../config/collections.js";

export async function login(email,password){ return (await signInWithEmailAndPassword(auth,email.trim(),password)).user; }
export async function logout(){ await signOut(auth); }
export function waitForUser(){ return new Promise(resolve=>{const u=onAuthStateChanged(auth,user=>{u();resolve(user);});}); }
export async function currentProfile(){
  const user=auth.currentUser||await waitForUser();
  return user?await getOne(COLLECTIONS.USERS,user.uid):null;
}

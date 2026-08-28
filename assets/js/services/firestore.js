import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "../config/firebase-config.js";

export async function add(c,data){
  const r=await addDoc(collection(db,c),{...data,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  return r.id;
}
export async function set(c,id,data,merge=true){
  await setDoc(doc(db,c,id),{...data,updatedAt:serverTimestamp()},{merge}); return id;
}
export async function update(c,id,data){ await updateDoc(doc(db,c,id),{...data,updatedAt:serverTimestamp()}); }
export async function remove(c,id){ await deleteDoc(doc(db,c,id)); }
export async function getOne(c,id){ const s=await getDoc(doc(db,c,id)); return s.exists()?{id:s.id,...s.data()}:null; }
export async function getAll(c){ const s=await getDocs(collection(db,c)); return s.docs.map(d=>({id:d.id,...d.data()})); }
export function listen(c,cb,field="createdAt",direction="desc"){
  let source;
  try{source=query(collection(db,c),orderBy(field,direction));}catch{source=collection(db,c);}
  return onSnapshot(source,s=>cb(s.docs.map(d=>({id:d.id,...d.data()}))));
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6g6R506tBDX7viwDL-cwl3t5fTr8uHwg",
  
  
  authDomain: "cac-agbara-aanu-sioni-radio.firebaseapp.com",
  
  
  projectId: "cac-agbara-aanu-sioni-radio",
  
  
  storageBucket: "cac-agbara-aanu-sioni-radio.firebasestorage.app",
  
  
  messagingSenderId: "1050460596595",
  
  
  appId: "1:1050460596595:web:ebe3b21d93d885a56f3d06",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
export { app, auth, db };

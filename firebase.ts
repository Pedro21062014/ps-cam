import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAaJPo4L5Xq29HO6jgX3psqxbWNZrpKriU",
  authDomain: "ps-cam.firebaseapp.com",
  projectId: "ps-cam",
  databaseURL: "https://ps-cam-default-rtdb.firebaseio.com",
  storageBucket: "ps-cam.firebasestorage.app",
  messagingSenderId: "190762565052",
  appId: "1:190762565052:web:83d54e500b3d29dc03ffb9",
  measurementId: "G-8F9K38F3T3"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();

// Add scope for Drive if user wants to save timeline later
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

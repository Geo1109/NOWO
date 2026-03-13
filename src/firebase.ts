import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA1jYd3llJx2KeR5OvU1REH3ze9LussRWg",
  authDomain: "nowo-debfb.firebaseapp.com",
  databaseURL: "https://nowo-debfb-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "nowo-debfb",
  storageBucket: "nowo-debfb.firebasestorage.app",
  messagingSenderId: "369091761430",
  appId: "1:369091761430:web:35ef9f63b4d21c754cac37",
  measurementId: "G-SWQETPVMRM"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

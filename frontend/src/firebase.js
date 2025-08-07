// frontend/src/firebase.js
import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"

const firebaseConfig = {
  apiKey: "",
  authDomain: "releasepeace-d4abd.firebaseapp.com",
  projectId: "releasepeace-d4abd",
  storageBucket: "releasepeace-d4abd.firebasestorage.app",
  messagingSenderId: "757442368870",
  appId: "1:757442368870:web:542492f533966a5640e4a7",
  measurementId: "G-VMHSFY9Q8E"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

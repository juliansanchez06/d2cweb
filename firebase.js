import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

// MISMO proyecto que la plataforma de gestión: comparten el stock en vivo
const firebaseConfig = {
  apiKey: "AIzaSyChzGFeNj350hf0zP6_g1BdqlwHo0i1uRM",
  authDomain: "modelod2d.firebaseapp.com",
  projectId: "modelod2d",
  storageBucket: "modelod2d.firebasestorage.app",
  messagingSenderId: "80737345531",
  appId: "1:80737345531:web:185d1f7df87c53dd5d755e"
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

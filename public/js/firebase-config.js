import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAtpp18r9WTbKsOUz2su6BB3pY-4ZQS-ss",
    authDomain: "the-dukanza.firebaseapp.com",
    projectId: "the-dukanza",
    storageBucket: "the-dukanza.firebasestorage.app",
    messagingSenderId: "567422688243",
    appId: "1:567422688243:web:47dc6a4e67311c02f2d086",
    measurementId: "G-SLXV0G6QX8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
const auth = getAuth(app);
const db = getFirestore(app);

// Export
export { auth, db };
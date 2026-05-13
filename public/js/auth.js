import { auth, db } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- DOM ELEMENTS ---
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const profileBox = document.getElementById('profileBox');
const googleBtn = document.getElementById('googleBtn');

const googleProvider = new GoogleAuthProvider();

let isRegistering = false;

// --- UI VALIDATION HELPERS ---
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showError(input, message) {
    if (!input) return;
    const parent = input.parentElement;
    let error = parent.querySelector(".form-error");
    if (!error) {
        error = document.createElement("div");
        error.className = "form-error";
        error.style.color = "#ff5a36";
        error.style.fontSize = "12px";
        error.style.marginTop = "5px";
        parent.appendChild(error);
    }
    error.innerText = message;
    error.style.display = "block";
    input.style.borderColor = "#ff5a36";
}

function clearError(input) {
    if (!input) return;
    const parent = input.parentElement;
    let error = parent.querySelector(".form-error");
    if (error) error.style.display = "none";
    input.style.borderColor = "";
}

function hideForms() {
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'none';
    if (googleBtn) googleBtn.style.display = 'none';

    const loadingScreen = document.getElementById('authLoading');
    if (loadingScreen) loadingScreen.style.display = 'block';
}

function showNotification(msg, type = "success") {
    // Calling the global notification system you built for The Dukanza
    if (window.showNotification) {
        window.showNotification(msg, type);
    } else {
        console.log(`${type.toUpperCase()}: ${msg}`);
    }
}

// --- AUTH WATCHER ---
onAuthStateChanged(auth, async (user) => {
    // Only trigger the auto-redirect if we AREN'T currently registering a new account
    if (user && !isRegistering) {
        if (!window.location.pathname.includes("profile.html")) {
            window.location.replace("profile.html");
        } else {
            const userSnap = await getDoc(doc(db, "users", user.uid));
            if (userSnap.exists()) {
                showProfile(userSnap.data());
                renderCartPreview(userSnap.data().cart || []);
            }
        }
    } else {
        if (profileBox) profileBox.style.display = 'none';
        if (loginForm) loginForm.style.display = 'block';
    }
});

// --- GOOGLE SIGN IN LOGIC ---
window.signInWithGoogle = async () => {
    try {
        // 1. SET THE FLAG to stop the observer from redirecting early
        isRegistering = true;

        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        hideForms();

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            // Auto-create profile for first-time Google users
            await setDoc(userRef, {
                uid: user.uid,
                name: user.displayName,
                email: user.email,
                role: "customer",
                cart: [],
                wishlist: [],
                recentlyViewed: [],
                addresses: [],
                orderIds: [], // Matches image_1dbd9c.png
                createdAt: new Date().toISOString()
            });
            showNotification(`Welcome to The Dukanza, ${user.displayName}!`);
        } else {
            showNotification(`Welcome back, ${user.displayName}!`);
        }

        // 2. ONLY redirect after the document check/creation is complete
        setTimeout(() => {
            window.location.href = "profile.html";
        }, 1000);

    } catch (err) {
        // RESET the flag if the popup is closed or fails
        isRegistering = false;
        console.error("Google Auth Error:", err);
        showNotification("Google Auth Failed", "error");
    }
};

// --- REGISTER LOGIC ---
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nameInput = document.getElementById('regName');
        const emailInput = document.getElementById('regEmail');
        const passInput = document.getElementById('regPass');
        const confirmInput = document.getElementById('regConfirmPass');
        const termsInput = registerForm.querySelector("input[type='checkbox']");

        let valid = true;
        [nameInput, emailInput, passInput, confirmInput].forEach(clearError);

        if (nameInput.value.trim().length < 3) { showError(nameInput, "Name too short"); valid = false; }
        if (!validateEmail(emailInput.value.trim())) { showError(emailInput, "Invalid email"); valid = false; }
        if (passInput.value.length < 6) { showError(passInput, "Password must be 6+ characters"); valid = false; }
        if (passInput.value !== confirmInput.value) { showError(confirmInput, "Passwords do not match"); valid = false; }
        if (termsInput && !termsInput.checked) { showNotification("Please accept the Terms", "error"); valid = false; }

        if (!valid) return;

        try {
            isRegistering = true; // BLOCK the observer redirect

            hideForms();

            const cred = await createUserWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value);

            const newUserProfile = {
                uid: cred.user.uid,
                name: nameInput.value.trim(),
                email: emailInput.value.trim(),
                role: "customer",
                cart: [],
                wishlist: [],
                recentlyViewed: [],
                addresses: [],
                orderIds: [],
                createdAt: new Date().toISOString()
            };

            const userDocRef = doc(db, "users", cred.user.uid);

            // Critical: Wait for the save to finish
            await setDoc(userDocRef, newUserProfile);

            showNotification("Account and Profile created successfully!");

            // Now that data is saved, we can safely move
            setTimeout(() => {
                window.location.href = "profile.html";
            }, 1000);

        } catch (err) {
            isRegistering = false; // Unblock so login works if registration failed
            console.error("The Dukanza Registration Error:", err);
            showNotification(err.message, "error");

        }
    });
}

// --- LOGIN LOGIC ---
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const emailInput = document.getElementById('loginEmail');
        const passInput = document.getElementById('loginPass');

        if (!emailInput.value || !passInput.value) {
            showNotification("Please fill in all fields", "error");
            return;
        }

        try {
            hideForms(); // Move this BEFORE the await
            await signInWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value);
            window.location.href = "profile.html";
        } catch (err) {
            // If it fails, show the forms again so user can retry
            if (loginForm) loginForm.style.display = 'block';
            console.error("Login Error:", err.code, err.message);
            showNotification("Login Error: " + err.message, "error");
        }
    });
}

// --- ACTION FUNCTIONS ---
window.forgotPassword = async () => {
    const email = document.getElementById('loginEmail').value.trim();
    if (!email) {
        showNotification("Enter your email first", "warning");
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        showNotification("Reset link sent to your inbox!");
    } catch (err) {
        showNotification(err.message, "error");
    }
};

window.logout = () => {
    customConfirm("Log Out?", "Are you sure you want to log out?");
    signOut(auth).then(() => location.reload());
};

// --- UI RENDER HELPERS ---
function showProfile(userData) {
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'none';
    if (profileBox) {
        profileBox.style.display = 'block';
        const welcome = document.getElementById('welcomeUser');
        const emailDisplay = document.getElementById('userEmailDisplay');
        if (welcome) welcome.innerText = `Welcome, ${userData.name}!`;
        if (emailDisplay) emailDisplay.innerText = userData.email;
        if (userData.role === 'admin') renderAdminUI();
    }
}

function renderAdminUI() {
    if (!profileBox || document.getElementById('admin-panel')) return;
    const adminDiv = document.createElement('div');
    adminDiv.id = 'admin-panel';
    adminDiv.className = 'admin-badge';
    adminDiv.innerHTML = `<h3>Admin Mode</h3><p>Inventory Access Granted</p>`;
    profileBox.appendChild(adminDiv);
}

async function renderCartPreview(cartArray) {
    const container = document.getElementById('cartPreviewGrid');
    if (!container) return;

    const firstThree = cartArray.slice(0, 3);
    container.innerHTML = firstThree.length === 0 ? '<p>Your cart is empty.</p>' : '';

    for (const item of firstThree) {
        const pDoc = await getDoc(doc(db, "products", String(item.id)));
        if (pDoc.exists()) {
            const p = pDoc.data();
            const imgUrl = p.images && p.images.length > 0 ? p.images[0] : 'assets/images/placeholder.png';

            container.innerHTML += `
                <div class="cart-preview-item">
                    <img src="${imgUrl}" alt="${p.name}" style="width:50px; border-radius:5px;">
                    <div>
                        <h4>${p.name}</h4>
                        <p>Qty: ${item.qty} | Rs. ${p.price}</p>
                    </div>
                </div>`;
        }
    }
}

// --- TOGGLE LOGIC ---
const toReg = document.getElementById('toRegister');
const toLog = document.getElementById('toLogin');

if (toReg) toReg.onclick = (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
};

if (toLog) toLog.onclick = (e) => {
    e.preventDefault();
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
};
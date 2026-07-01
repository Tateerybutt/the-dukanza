/* =========================
    SMART NAVIGATION LOGIC
========================= */
import { auth, db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, getDocs, query, limit, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;

// Listen for Auth changes
onAuthStateChanged(auth, async (user) => {

    currentUser = user;

    if (!user) return;

    try {

        const snap = await getDoc(doc(database, "users", user.uid));

        if (!snap.exists()) return;

        const data = snap.data();

        const avatar =
            data.avatar ||
            "assets/images/avatars/1.png";

        updateNavbarAvatar(avatar);

    } catch (err) {
        console.error(err);
    }

});

function updateNavbarAvatar(src) {

    const desktop = document.getElementById("navbarUserBtn");
    const mobile = document.getElementById("mobileUserBtn");

    if (desktop) {
        desktop.innerHTML = `
            <img src="${src}" class="nav-avatar" alt="Profile">
        `;
    }

    if (mobile) {
        mobile.innerHTML = `
            <img src="${src}" class="mobile-avatar">
            <span>Profile</span>
        `;
    }

}

// Attach directly to window so HTML can find it immediately
window.handleUserIconClick = function () {
    if (currentUser) {
        window.location.href = 'profile.html';
    } else {
        window.location.href = 'auth.html';
    }
};

/* =========================
   SIDEBAR TOGGLE
========================= */

const sidebar = document.querySelector(".sidebar");
const overlay = document.querySelector(".overlay");

// Attach to window so HTML onclick can see them
window.openSidebar = function () {
    if (sidebar && overlay) {
        sidebar.classList.add("active");
        overlay.classList.add("active");
    }
}

window.closeSidebar = function () {
    if (sidebar && overlay) {
        sidebar.classList.remove("active");
        overlay.classList.remove("active");
        sidebar.style.transform = "";
    }
}

/* =========================
   TOUCH GESTURE (RIGHT SIDEBAR)
========================= */
let startX = 0;
let currentX = 0;
let dragging = false;

sidebar.addEventListener("touchstart", e => {
    dragging = true;
    startX = e.touches[0].clientX;
    sidebar.style.transition = "none";
});

sidebar.addEventListener("touchmove", e => {
    if (!dragging) return;

    currentX = e.touches[0].clientX;
    let diff = currentX - startX;

    // Only allow dragging left
    if (diff < 0) {
        sidebar.style.transform = `translateX(${diff}px)`;
    }
});

sidebar.addEventListener("touchend", () => {

    dragging = false;

    sidebar.style.transition = "transform .35s cubic-bezier(.4,0,.2,1)";

    const diff = currentX - startX;

    if (diff < -120) {

        sidebar.style.transform = "";
        closeSidebar();

    } else {

        sidebar.style.transform = "translateX(0)";

    }

});

/* =========================
   GLOBAL FORM VALIDATION
========================= */

window.validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

window.showError = (input, message) => {
    const parent = input.parentElement;
    let error = parent.querySelector(".form-error");
    if (!error) {
        error = document.createElement("div");
        error.className = "form-error";
        parent.appendChild(error);
    }
    error.innerText = message;
    error.style.display = "block";
    input.classList.add("error");
}

window.clearError = (input) => {
    const parent = input.parentElement;
    let error = parent.querySelector(".form-error");
    if (error) error.style.display = "none";
    input.classList.remove("error");
}

/* =========================
   CONTACT FORM VALIDATION
========================= */

const contactForm = document.querySelector("#contactForm");
if (contactForm) {
    contactForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const name = contactForm.querySelector("input[name='name']");
        const email = contactForm.querySelector("input[type='email']");
        const message = contactForm.querySelector("textarea");

        let valid = true;
        window.clearError(name);
        window.clearError(email);
        window.clearError(message);

        if (name.value.trim().length < 3) {
            window.showError(name, "Name too short");
            valid = false;
        }
        if (!window.validateEmail(email.value)) {
            window.showError(email, "Invalid email");
            valid = false;
        }
        if (message.value.trim().length < 10) {
            window.showError(message, "Message too short");
            valid = false;
        }

        if (valid) {
            window.showNotification("Message sent!", "success");
            contactForm.reset();
        }
    });
}

/* =========================
   TOAST NOTIFICATION
========================= */

window.showNotification = function (message, type = "success", duration = 3000) {
    let container = document.querySelector(".notification-container");
    if (!container) {
        container = document.createElement("div");
        container.className = "notification-container";
        document.body.appendChild(container);
    }

    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.innerHTML = message;
    container.appendChild(notification);

    setTimeout(() => notification.classList.add("show"), 10);
    setTimeout(() => {
        notification.classList.remove("show");
        setTimeout(() => notification.remove(), 300);
    }, duration);
}

/* =========================
   PRODUCT PAGE LOGIC
========================= */

// Global function to handle product clicks
window.openProduct = (productId) => {
    if (!productId) return;
    window.location.href = `product.html?id=${productId}`;
};

/* =========================
    CONFIRMATION DIALOG
========================= */

window.customConfirm = (title, message) => {
    return new Promise((resolve) => {
        // Create modal elements
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay confirm-overlay";

        overlay.innerHTML = `
            <div class="modal-content confirm-box">
                <div class="modal-header">
                    <h3>${title}</h3>
                </div>
                <p class="confirm-message">${message}</p>
                <div class="modal-actions">
                    <button class="btn-outline" id="confirmCancel">Cancel</button>
                    <button class="btn-confirm-action" id="confirmYes">Proceed</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        overlay.style.display = "flex";

        // Handle buttons
        const handleAction = (value) => {
            overlay.classList.add("fade-out");
            setTimeout(() => {
                overlay.remove();
                resolve(value);
            }, 300);
        };

        document.getElementById("confirmYes").onclick = () => handleAction(true);
        document.getElementById("confirmCancel").onclick = () => handleAction(false);

        // Close on clicking outside
        overlay.onclick = (e) => {
            if (e.target === overlay) handleAction(false);
        };
    });
};

/* =========================
    Featured Products Carousel Logic
========================= */

const database = getFirestore();

async function fetchFeaturedProducts() {
    const grid = document.getElementById('featured-product-grid');

    try {
        // 1. Reference your 'products' collection
        // We order by ID and limit to 4 to get your featured items
        const q = query(collection(database, "products"), orderBy("id"), limit(4));
        const querySnapshot = await getDocs(q);

        grid.innerHTML = ''; // Clear loading state

        querySnapshot.forEach((doc) => {
            const product = doc.data();
            
            // 2. Generate the HTML for each product
            const productHTML = `
            <div class="product-card" onclick="openProduct('${product.id}')">
                <div class="product-image">
                    <img class="img-default" src="${product.images[0]}" alt="${product.name}">
                    <img class="img-hover" src="${product.images[1]}" alt="${product.name}">
                </div>
                <h3>${product.name}</h3>
                <p style="font-size: 0.8rem; color: #666; margin-bottom: 5px;">${product.subtitle || ''}</p>
                <div class="price-box">
                    ${product.oldPrice ? `<span class="old-price">Rs. ${product.oldPrice}</span>` : ''}
                    <span class="new-price">Rs. ${product.price}</span>
                </div>
                <button class="add-btn" id="btn-${product.id}">
                    Add to Cart
                </button> 
                </div>
            `;
            grid.innerHTML += productHTML;
        });

    } catch (error) {
        console.error("Error fetching products: ", error);
        grid.innerHTML = "<p>Failed to load products. Please refresh.</p>";
    }
}

// Initialize on page load
// Replace your current DOMContentLoaded listener with this:
document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('featured-product-grid');

    // Only fetch products if the grid exists (i.e., we are on index.html)
    if (grid) {
        fetchFeaturedProducts();
    }
});

/* =========================
    LOGO CLICK NAVIGATION
========================= */
/*
document.getElementById("logo").addEventListener("click", () => {
    window.location.href = "index.html";
});*/
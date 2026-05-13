/* =========================
    SMART NAVIGATION LOGIC
========================= */
import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let currentUser = null;

// Listen for Auth changes
onAuthStateChanged(auth, (user) => {
    currentUser = user;
});

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
    }
}

/* =========================
   TOUCH GESTURE (RIGHT SIDEBAR)
========================= */

let startX = 0;
let endX = 0;

document.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
});

document.addEventListener("touchend", (e) => {
    endX = e.changedTouches[0].clientX;
    handleSwipe();
});

function handleSwipe() {
    const diff = endX - startX;
    const screenWidth = window.innerWidth;

    if (diff < -80 && startX > screenWidth - 60) {
        window.openSidebar();
    }
    if (diff > 80) {
        window.closeSidebar();
    }
}

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
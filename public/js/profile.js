import { auth, db } from './firebase-config.js';
import {
    onAuthStateChanged, signOut, deleteUser, updatePassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    doc, getDoc, getDocs, updateDoc, deleteDoc,
    arrayUnion, arrayRemove, collection, query, where, limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- AUTH LISTENER ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        injectInitialSkeletons();
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            const data = userDoc.data();
            renderProfileHero(data);
            loadAvatarGrid(data.avatar || 1);
            document.getElementById("editName").value = data.name || "";
            document.getElementById("editEmail").value = data.email || "";
            Promise.all([
                renderCartPreview(data.cart || []),
                renderAddresses(data.addresses || []),
                renderWishlist(data.wishlist || []),
                renderRecentlyViewed(data.recentlyViewed || []),
                loadUserOrders(user.uid)
            ]);
        }
    } else {
        // Only redirect if we are SURE there is no user and we aren't already at auth.html
        if (!window.location.pathname.includes("auth.html")) {
            window.location.replace("auth.html");
        }
    }
});

// --- SKELETON INJECTION ---
function injectInitialSkeletons() {
    const sections = {
        'cartPreviewGrid': 3,
        'addressList': 2,
        'orderList': 3,
        'wishlistGrid': 4,
        'recentViewed': 4
    };

    for (const [id, count] of Object.entries(sections)) {
        const el = document.getElementById(id);
        if (el) {
            let skeletonHtml = '';
            for (let i = 0; i < count; i++) {
                if (id === 'cartPreviewGrid') {
                    skeletonHtml += `
                            <div class="skeleton-cart-preview" style="display: flex; gap: 15px; align-items: center; padding: 12px; background: #fff; border-radius: 12px; border: 1px solid #f0f0f0; margin-bottom:10px;">
                                <div class="skeleton" style="width: 60px; height: 60px; border-radius: 8px;"></div>
                                <div style="flex: 1;">
                                    <div class="skeleton" style="width: 60%; height: 15px; margin-bottom: 8px;"></div>
                                    <div class="skeleton" style="width: 30%; height: 12px;"></div>
                                </div>
                            </div>`;
                }
                else if (id === 'orderList') skeletonHtml += `<div class="skeleton" style="height:80px; margin-bottom:10px; border-radius:12px;"></div>`;
                else if (id === 'addressList') skeletonHtml += `<div class="skeleton" style="height:120px; margin-bottom:10px; border-radius:12px;"></div>`;
                else skeletonHtml += `<div class="skeleton" style="height:200px; border-radius:12px;"></div>`;
            }
            el.innerHTML = skeletonHtml;
        }
    }
}

// --- CORE FETCH FIX ---
async function fetchProductHtml(id, type = 'standard', extra = null) {
    try {
        const idNum = parseInt(id);
        const q = query(collection(db, "products"), where("id", "==", idNum), limit(1));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) return '';

        const p = querySnapshot.docs[0].data();
        const img1 = (p.images && p.images.length > 0) ? p.images[0] : 'assets/images/placeholder.png';
        const img2 = (p.images && p.images.length > 1) ? p.images[1] : img1;

        // --- CART PREVIEW DESIGN ---
        if (type === 'cart') {
            return `
                    <div class="cart-item">
                        <div class="cart-item-info-group">
                            <img src="${img1}" alt="${p.name}" style="width: 60px; border-radius: 8px;">
                            <div class="cart-item-details">
                                <h4>${p.name}</h4>
                                <p class="variant-tag">${extra?.variant || 'Standard'}</p>
                                <span>Rs. ${p.price}</span>
                            </div>
                        </div>
                        <a href="cart.html" class="edit-cart">Edit Cart <i class="fas fa-external-link-alt"></i></a>
                    </div>`;
        }

        // --- STANDARD CARD DESIGN (Wishlist and Recently Viewed) ---
        // Added onclick for redirection and stopPropagation on buttons to prevent double-firing
        return `
                <div class="product-card" onclick="window.location.href='product.html?id=${idNum}'" style="cursor: pointer;">
                    <div class="product-image">
                        <img class="img-default" src="${img1}" alt="${p.name}">
                        <img class="img-hover" src="${img2}" alt="${p.name}">
                        
                        ${type === 'wishlist' ? `
                            <button class="wishlist-remove-icon" onclick="event.stopPropagation(); removeFromWishlist(${idNum})">
                                <i class="fas fa-heart-broken"></i>
                            </button>
                        ` : ''}
                    </div>

                    <h3>${p.name}</h3>

                    <div class="price-box">
                        ${p.oldPrice ? `<span class="old-price">Rs. ${p.oldPrice}</span>` : ''}
                        <span class="new-price">Rs. ${p.price}</span>
                    </div>

                    
                        <button onclick="event.stopPropagation(); addToCart(${p.id}, 1);">
                            Add to Cart
                        </button>
                    
                </div>`;

    } catch (e) {
        console.error("Fetch error for product card:", e);
        return '';
    }
}

// --- RENDERERS ---
function renderProfileHero(data) {
    const nameEl = document.getElementById("userNameHeader");
    const avatarEl = document.getElementById("profileAvatar");
    const memberSinceEl = document.getElementById("memberSince");
    const dashboardBtn = document.getElementById("dashboardBtn");

    if (nameEl) {
        nameEl.textContent = data.name || "User";
    }

    if (avatarEl) {
        avatarEl.src = `assets/images/avatars/${data.avatar || 1}.png`;
    }

    if (memberSinceEl && data.createdAt) {
        const date = new Date(data.createdAt);

        memberSinceEl.innerHTML =
            `<i class="fas fa-calendar-check"></i> Member since ${date.toLocaleString('en-US', {
                month: 'long',
                year: 'numeric'
            })}`;
    }

    if (dashboardBtn) {
        dashboardBtn.style.display =
            data.role === "admin" ? "inline-flex" : "none";
    }
}

window.renderCartPreview = async (cartItems) => {
    const container = document.getElementById('cartPreviewGrid');
    if (!container) return;

    if (cartItems.length === 0) {
        container.innerHTML = `<p class="empty-msg">Your bag is empty. <a href="products.html">Continue Shopping</a></p>`;
        return;
    }

    const firstThree = cartItems.slice(0, 3);
    const htmlPromises = firstThree.map(item => fetchProductHtml(item.id, 'cart', item));
    const results = await Promise.all(htmlPromises);
    container.innerHTML = results.join('') || `<p class="empty-msg">Items not found.</p>`;
}

async function renderWishlist(productIds) {
    const container = document.getElementById('wishlistGrid');
    if (!container) return;

    if (productIds.length === 0) {
        container.innerHTML = `<p class="empty-msg">Your wishlist is empty.</p>`;
        return;
    }

    const htmlPromises = productIds.map(id => fetchProductHtml(id, 'wishlist'));
    const results = await Promise.all(htmlPromises);
    container.innerHTML = results.join('');
}

async function renderRecentlyViewed(productIds) {
    const container = document.getElementById('recentViewed');
    if (!container) return;

    if (productIds.length === 0) {
        container.innerHTML = `<p class="empty-msg">No recently viewed items.</p>`;
        return;
    }

    // Reverse to show newest first, limit to 4
    const lastFour = [...productIds].reverse().slice(0, 4);
    const htmlPromises = lastFour.map(id => fetchProductHtml(id));
    const results = await Promise.all(htmlPromises);
    container.innerHTML = results.join('');
}

function renderAddresses(addresses) {
    const container = document.getElementById('addressList');
    if (!container) return;
    if (addresses.length === 0) {
        container.innerHTML = `<p class="empty-msg">No addresses saved yet.</p>`;
        return;
    }
    container.innerHTML = addresses.map((addr, index) => `
            <div class="address-card">
                <div class="card-top">
                    <span class="address-label">${addr.label}</span>
                    <span class="province-tag">${addr.province || 'Punjab'}</span>
                </div>
                <p class="addr-detail"><strong>Address:</strong> ${addr.street}</p>
                <p class="addr-detail"><strong>City:</strong> ${addr.city}</p>
                <p class="addr-detail"><strong>Phone:</strong> ${addr.phone || 'N/A'}</p>
                <div class="card-actions">
                    <button class="delete-link" onclick="deleteAddress(${index})"><i class="fas fa-trash"></i> Delete</button>
                </div>
            </div>
        `).join('');
}


window.removeFromWishlist = async (productId) => {
    const userRef = doc(db, "users", auth.currentUser.uid);
    await updateDoc(userRef, {
        wishlist: arrayRemove(parseInt(productId))
    });
    location.reload();
};

window.deleteAddress = async (index) => {
    const confirmed = await customConfirm("Remove Address?", "Are you sure you want to remove this address?");
    if (!confirmed) return;
    const userRef = doc(db, "users", auth.currentUser.uid);
    const userDoc = await getDoc(userRef);
    const addresses = userDoc.data().addresses;
    addresses.splice(index, 1);
    await updateDoc(userRef, { addresses });
    location.reload();
};
/* =========================
   ORDER LOADING LOGIC (FIRESTORE)
========================= */

/* =========================
   UPDATED ORDER LOADING
========================= */

async function loadUserOrders() {
    const container = document.getElementById('orderList');
    if (!container) return;

    // We use the email of the currently logged-in user
    const userEmail = auth.currentUser?.email;

    if (!userEmail) {
        console.error("No user email found for order lookup.");
        return;
    }

    try {
        const ordersRef = collection(db, "orders");

        // 🔥 FIX: Querying by 'customer.email' to match your data and rules
        const q = query(ordersRef, where("customer.email", "==", userEmail));

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = `<p class="empty-msg">No orders placed yet.</p>`;
            return;
        }

        const orders = [];
        querySnapshot.forEach((doc) => {
            orders.push({ id: doc.id, ...doc.data() });
        });

        // Keep your manual sorting to avoid needing to create a Firestore Index
        orders.sort((a, b) => (b.orderDate?.seconds || 0) - (a.orderDate?.seconds || 0));

        container.innerHTML = orders.map(order => {
            const date = order.orderDate?.toDate().toLocaleDateString('en-PK', {
                day: 'numeric', month: 'short', year: 'numeric'
            }) || "Recently";

            return `
                <div class="order-item" onclick="viewOrderDetails('${order.id}')">
                    <div class="order-header">
                        <span class="order-id">#${order.id}</span>
                        <span class="order-date">${date}</span>
                    </div>
                    <div class="order-summary-row">
                        <div class="order-status-badge ${order.status.toLowerCase()}">${order.status}</div>
                        <div class="order-total">Rs. ${order.financials.total.toLocaleString()}</div>
                    </div>
                    <button class="auth-btn">View Details <i class="fas fa-chevron-right"></i></button>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Error loading orders:", error);
        if (error.code === 'permission-denied') {
            container.innerHTML = `<p class="empty-msg">Permission Denied. Please ensure your Security Rules are updated.</p>`;
        }
    }
}

/* =========================
   ORDER DETAILS (SNAPSHOT FROM FIRESTORE)
========================= */

window.viewOrderDetails = async (orderId) => {
    try {
        // Fetch the specific order document
        const orderRef = doc(db, "orders", orderId);
        const orderSnap = await getDoc(orderRef);

        if (!orderSnap.exists()) {
            alert("Order details not found in the database.");
            return;
        }

        const order = orderSnap.data();
        document.getElementById('modalOrderId').innerText = `Order ${orderId}`;

        const modalBody = document.getElementById('orderModalBody');
        modalBody.innerHTML = `
            <div class="detail-section">
                <h4><i class="fas fa-truck"></i> Shipping Details</h4>
                <p>${order.customer.name}<br>
                ${order.shipping.street}<br>
                ${order.shipping.city}, ${order.shipping.province}<br>
                Phone: ${order.customer.phone}</p>
            </div>

            <div class="detail-section">
                <h4><i class="fas fa-box"></i> Items</h4>
                <table class="order-table">
                    ${order.items.map(item => `
                        <tr>
                            <td>
                                <strong>${item.name}</strong><br>
                                <small>Variant: ${item.variant}</small>
                            </td>
                            <td>x${item.qty}</td>
                            <td>Rs. ${item.snapshotPrice.toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </table>
            </div>

            <div class="detail-section financials">
                <div class="flex-row"><span>Subtotal:</span> <span>Rs. ${order.financials.subtotal.toLocaleString()}</span></div>
                <div class="flex-row"><span>Shipping:</span> <span>Rs. ${order.financials.shipping.toLocaleString()}</span></div>
                <div class="flex-row total"><span>Total:</span> <span>Rs. ${order.financials.total.toLocaleString()}</span></div>
                <p class="payment-tag">${order.paymentStatus}</p>
            </div>
        `;

        document.getElementById('orderModal').style.display = 'flex';
    } catch (error) {
        console.error("Error fetching order details:", error);
        alert("Could not load order details.");
    }
};
function closeModal() {
    document.getElementById('orderModal').style.display = 'none';
}

let selectedAvatar = 1;

function loadAvatarGrid(currentAvatar = 1) {

    selectedAvatar = currentAvatar;

    const grid = document.getElementById("avatarGrid");

    if (!grid) return;

    grid.innerHTML = "";

    for (let i = 1; i <= 25; i++) {

        grid.innerHTML += `
            <img
                src="assets/images/avatars/${i}.png"
                class="avatar-option ${i === currentAvatar ? "selected" : ""}"
                data-avatar="${i}">
        `;
    }

    grid.querySelectorAll(".avatar-option").forEach(img => {

        img.onclick = () => {

            grid.querySelectorAll(".avatar-option")
                .forEach(i => i.classList.remove("selected"));

            img.classList.add("selected");

            selectedAvatar = Number(img.dataset.avatar);
        };

    });

}

// Simple Modal Toggles
window.closeOrderModal = () => document.getElementById('orderModal').style.display = 'none';
window.openAddressModal = () => document.getElementById('addressModal').style.display = 'flex';
window.closeAddressModal = () => document.getElementById('addressModal').style.display = 'none';
window.openPasswordModal = () => document.getElementById('passwordModal').style.display = 'flex';
window.closePasswordModal = () => document.getElementById('passwordModal').style.display = 'none';
window.openDeleteModal = () => document.getElementById('deleteModal').style.display = 'flex';
window.closeDeleteModal = () => document.getElementById('deleteModal').style.display = 'none';
window.openEditModal = () => document.getElementById('editProfileModal').style.display = 'flex';
window.closeEditModal = () => document.getElementById('editProfileModal').style.display = 'none';

// --- ADDRESS FORM ---
document.getElementById('addressForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.innerText = "Saving...";

    const newAddress = {
        label: document.getElementById('addrLabel').value,
        phone: document.getElementById('addrPhone').value,
        street: document.getElementById('addrStreet').value,
        city: document.getElementById('addrCity').value,
        province: document.getElementById('addrProvince').value,
        postalCode: document.getElementById('addrPostal').value
    };

    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, {
            addresses: arrayUnion(newAddress)
        });
        showNotification("Address added successfully!", "success");
        closeAddressModal();
        location.reload(); // Refresh to show the new address card
    } catch (err) {
        showNotification("Failed to save address", "error");
    } finally {
        btn.disabled = false;
        btn.innerText = "Save";
    }
});

// --- EDIT PROFILE FORM ---
document.getElementById('editProfileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = document.getElementById('editName').value;

    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, {
            name: newName,
            avatar: selectedAvatar
        });
        showNotification("Profile updated!", "success");
        closeEditModal();
        document.getElementById('userNameHeader').innerText = newName;
        document.getElementById("profileAvatar").src =
            `assets/images/avatars/${selectedAvatar}.png`;
    } catch (err) {
        showNotification("Update failed", "error");
    }
});

// --- PASSWORD CHANGE FORM ---
document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPass = document.getElementById('newPass').value;
    const confirmPass = document.getElementById('confirmNewPass').value;

    if (newPass !== confirmPass) {
        showNotification("Passwords do not match!", "error");
        return;
    }

    if (newPass.length < 6) {
        showNotification("Password must be 6+ characters", "error");
        return;
    }

    try {
        await updatePassword(auth.currentUser, newPass);
        showNotification("Password updated!", "success");
        closePasswordModal();
        e.target.reset();
    } catch (err) {
        if (err.code === 'auth/requires-recent-login') {
            showNotification("Please re-login to change password", "error");
        } else {
            showNotification("Password update failed", "error");
        }
    }
});

// --- ACCOUNT DELETION ---
window.deleteAccount = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const confirmed = await customConfirm(
        "Delete Account?",
        "This action is permanent and your Tijva profile data will be wiped."
    );

    if (confirmed) {
        try {
            const uid = user.uid;
            const userRef = doc(db, "users", uid);

            // 1. Delete user document from Firestore
            await deleteDoc(userRef);

            // 2. Delete the user from Firebase Auth
            await deleteUser(user);

            showNotification("Account deleted successfully.", "success");

            // Redirect to home or signup page
            window.location.href = "index.html";
        } catch (error) {
            console.error("Error deleting account:", error);

            if (error.code === 'auth/requires-recent-login') {
                showNotification("For security, please log out and log back in before deleting your account.", "error");
            } else {
                showNotification("Failed to delete account. Please try again.", "error");
            }
        }
    }
};
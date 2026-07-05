import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    collection, query, orderBy, onSnapshot, doc, getDoc,
    setDoc, updateDoc, deleteDoc, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Cache for orders and users (module-scoped, not window globals)
const orderCache = new Map();
const userCache = new Map();

// DOM elements
const ordersBody = document.getElementById('ordersBody');
const totalCount = document.getElementById('totalOrderCount');
const overlay = document.getElementById('adminGuardOverlay');

// Flags to ensure listeners are attached only once
let orderListenerActive = false;
let productListenerActive = false;
let customerListenerActive = false;
let adminListenerActive = false;

/** 1. SECURITY GUARD **/
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // Not logged in, redirect to login
        window.location.href = "auth.html";
        return;
    }
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === 'admin') {
            // Authorized admin user
            if (overlay) overlay.style.display = 'none';
            startOrderListener();
        } else {
            // Not an admin, redirect to shop
            window.location.href = "products.html";
        }
    } catch (err) {
        console.error("Auth guard error:", err);
        window.location.href = "products.html";
    }
});

/** 2. ORDER LISTENER **/
function startOrderListener() {
    if (orderListenerActive) return;
    orderListenerActive = true;
    const q = query(collection(db, "orders"), orderBy("orderDate", "desc"));
    onSnapshot(q, (snapshot) => {
        ordersBody.innerHTML = '';
        totalCount.innerText = snapshot.size;
        snapshot.forEach((docSnap) => {
            const orderData = docSnap.data();
            const orderId = docSnap.id;
            orderCache.set(orderId, orderData);
            renderOrderRow(orderId, orderData);
        });
    });
}

function renderOrderRow(orderId, order) {
    // Safely handle missing items or status
    const items = Array.isArray(order.items) ? order.items : [];
    const itemsSummary = items.map(item => `${item.qty}x ${item.name}`).join(', ');
    const status = order.status || 'Pending';
    const statusClass = `badge-${status.toLowerCase()}`;

    const row = document.createElement('tr');
    row.innerHTML = `
        <td style="font-family: monospace; font-weight:bold;">${orderId}</td>
        <td><strong>${order.customer.name}</strong><br><small>${order.customer.phone}</small></td>
        <td><small>${itemsSummary}</small></td>
        <td>Rs. ${order.financials.total}</td>
        <td>
            <select class="status-select ${statusClass}"
                    onchange="updateStatus('${orderId}', this.value)">
                <option value="Pending"   ${status === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Confirmed" ${status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
                <option value="Shipped"   ${status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                <option value="Delivered" ${status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                <option value="Cancelled" ${status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
        </td>
        <td>
            <button class="wa-btn" onclick="sendWhatsApp('${orderId}')">
                <i class="fab fa-whatsapp"></i> Message
            </button>
        </td>
    `;
    ordersBody.appendChild(row);
}

/** 3. PRODUCT LISTENER **/
function startProductListener() {
    if (productListenerActive) return;
    productListenerActive = true;
    const q = query(collection(db, "products"), orderBy("id", "asc"));
    onSnapshot(q, (snapshot) => {
        const productsBody = document.getElementById('productsBody');
        productsBody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const id = docSnap.id;
            const data = docSnap.data();
            renderProductRow(id, data);
        });
    });
}

function renderProductRow(docId, p) {
    const displayImg = (Array.isArray(p.images) && p.images.length > 0)
        ? p.images[0]
        : 'assets/images/placeholder.png';
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><img src="${displayImg}" width="50" height="50"
                 style="border-radius:5px; object-fit:cover;"></td>
        <td><strong>${p.name}</strong><br><small>${docId}</small></td>
        <td>Rs. ${p.price}</td>
        <td>${p.stock}</td>
        <td>
            <button class="edit-btn"   onclick="editProduct('${docId}')"><i class="fas fa-edit"></i></button>
            <button class="delete-btn" onclick="deleteProduct('${docId}')"><i class="fas fa-trash"></i></button>
        </td>
    `;
    document.getElementById('productsBody').appendChild(row);
}

/** 4. PRODUCT FORM HANDLING **/
const productForm = document.getElementById('productForm');
const imageContainer = document.getElementById('imageInputContainer');

// Helper to add image URL input
window.addImageInput = (value = "") => {
    const div = document.createElement('div');
    div.className = 'image-input-row';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginBottom = '8px';

    div.innerHTML = `
        <input type="text" class="prod-img-url" value="${value}"
               placeholder="assets/images/products/..." style="flex:1;">
        <button type="button" onclick="this.parentElement.remove()"
                style="background:none; border:none; color:var(--danger); cursor:pointer;">
            <i class="fas fa-times"></i>
        </button>
    `;
    imageContainer.appendChild(div);
};

// Save (Add/Edit) Product
productForm.onsubmit = async (e) => {
    e.preventDefault();
    const slug = document.getElementById('prodSlug').value;
    const docId = document.getElementById('prodDocId').value || slug;

    const imageInputs = document.querySelectorAll('.prod-img-url');
    const imagesArray = Array.from(imageInputs)
        .map(input => input.value.trim())
        .filter(val => val !== "");
    if (imagesArray.length === 0) {
        showNotification("Please add at least one image path.", "warning");
        return;
    }

    const productData = {
        name: document.getElementById('prodName').value,
        price: Number(document.getElementById('prodPrice').value),
        oldPrice: Number(document.getElementById('prodOldPrice').value) || null,
        category: document.getElementById('prodCategory').value,
        stock: Number(document.getElementById('prodStock').value),
        images: imagesArray,
        subtitle: document.getElementById('prodSubtitle').value,
        description: document.getElementById('prodDesc').value,
        fullDescription: document.getElementById('prodFullDesc').value,
        // Maintain existing ID for edit, or use timestamp for new
        id: document.getElementById('prodDocId').value
            ? Number(document.getElementById('prodId').value)
            : Date.now()
    };

    try {
        await setDoc(doc(db, "products", docId), productData, { merge: true });
        closeModal('productModal');
        showNotification("Product Saved!", "success");
    } catch (err) {
        console.error("Save product failed:", err);
        showNotification("Error saving product.", "error");
    }
};

// Edit existing product: populate form and open modal
window.editProduct = async (docId) => {
    const docSnap = await getDoc(doc(db, "products", docId));
    if (!docSnap.exists()) return;
    const p = docSnap.data();

    // Reset and fill form fields
    productForm.reset();
    imageContainer.innerHTML = '';
    document.getElementById('prodDocId').value = docId;
    document.getElementById('prodSlug').value = docId;
    document.getElementById('prodName').value = p.name;
    document.getElementById('prodPrice').value = p.price;
    document.getElementById('prodOldPrice').value = p.oldPrice || '';
    document.getElementById('prodCategory').value = p.category;
    document.getElementById('prodStock').value = p.stock;
    document.getElementById('prodSubtitle').value = p.subtitle || '';
    document.getElementById('prodDesc').value = p.description || '';
    document.getElementById('prodFullDesc').value = p.fullDescription || '';

    // Add existing images into inputs
    if (Array.isArray(p.images) && p.images.length > 0) {
        p.images.forEach(img => window.addImageInput(img));
    } else {
        window.addImageInput();
    }

    // Ensure hidden ID field exists
    let idField = document.getElementById('prodId');
    if (!idField) {
        idField = document.createElement('input');
        idField.type = 'hidden';
        idField.id = 'prodId';
        productForm.appendChild(idField);
    }
    idField.value = p.id;

    document.getElementById('modalTitle').innerText = 'Edit Product';
    document.getElementById('productModal').style.display = 'flex';
};

// Add New Product: open empty form
window.openProductModal = () => {
    productForm.reset();
    imageContainer.innerHTML = '';
    window.addImageInput(); // one empty input
    document.getElementById('prodDocId').value = '';
    document.getElementById('modalTitle').innerText = 'Add New Product';
    document.getElementById('productModal').style.display = 'flex';
};

// Delete a product document
window.deleteProduct = async (docId) => {
    if (customConfirm(`Delete ${docId}? This cannot be undone.`)) {
        try {
            await deleteDoc(doc(db, "products", docId));
            showNotification("Product deleted.", "info");
        } catch (err) {
            console.error("Delete product failed:", err);
        }
    }
};

// Update order status in Firestore
window.updateStatus = async (orderId, newStatus) => {
    try {
        await updateDoc(doc(db, "orders", orderId), { status: newStatus });
    } catch (error) {
        console.error("Status update failed:", error);
    }
};

/** 5. CUSTOMER LISTENER **/
function startCustomerListener() {
    if (customerListenerActive) return;
    customerListenerActive = true;
    const q = query(collection(db, "users"), orderBy("name", "asc"));
    onSnapshot(q, (snapshot) => {
        const customersBody = document.getElementById('customersBody');
        document.getElementById('totalUserCount').innerText = snapshot.size;
        customersBody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const uid = docSnap.id;
            const userData = docSnap.data();
            if (userData.role !== 'admin') {
                userCache.set(uid, userData);
                renderCustomerRow(uid, userData);
            }
        });
    });
}

function renderCustomerRow(uid, u) {
    const isBlocked = u.isBlocked === true;
    // Display primary address or fallback text
    let displayAddress = "No address set";
    if (Array.isArray(u.addresses) && u.addresses.length > 0) {
        const addr = u.addresses[0];
        displayAddress = `${addr.city}, ${addr.province}`;
    } else if (typeof u.addresses === 'string') {
        displayAddress = u.addresses;
    }
    // Calculate order count safely
    const orderCount = Array.isArray(u.orderIds) ? u.orderIds.length : (u.orderIds ? 1 : 0);

    const joinedDate = u.createdAt
        ? new Date(u.createdAt).toLocaleDateString()
        : 'N/A';

    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="customer-info">
            <strong>${u.name || 'Anonymous'}</strong><br>
            <small>Joined: ${joinedDate}</small>
        </td>
        <td><small>${u.email}</small></td>
        <td><small title="${u.addresses && u.addresses[0]?.street || ''}">
            ${displayAddress}</small></td>
        <td><span class="badge-orders">${orderCount} Orders</span></td>
        <td>
            <span class="${isBlocked ? 'badge-blocked' : 'badge-active'}">
                ${isBlocked ? 'Blocked' : 'Active'}
            </span>
        </td>
        <td>
            <button class="edit-btn" onclick="viewUserDetails('${uid}')" title="View Details">
                <i class="fas fa-eye"></i>
            </button>
            <button class="edit-btn" onclick="promptChangeName('${uid}', '${u.name}')" title="Change Name">
                <i class="fas fa-user-edit"></i>
            </button>
            <button class="${isBlocked ? 'unblock-btn' : 'block-btn'}"
                    onclick="toggleBlockUser('${uid}', ${isBlocked})"
                    title="${isBlocked ? 'Unblock' : 'Block'}">
                <i class="fas ${isBlocked ? 'fa-unlock' : 'fa-ban'}"></i>
            </button>
            <button class="delete-btn" onclick="deleteUserAccount('${uid}')" title="Delete Account">
                <i class="fas fa-trash-alt"></i>
            </button>
        </td>
    `;
    document.getElementById('customersBody').appendChild(row);
}

// Prompt to change customer name
window.promptChangeName = async (uid, currentName) => {
    const newName = prompt("Enter new name:", currentName);
    if (newName && newName !== currentName) {
        try {
            await updateDoc(doc(db, "users", uid), { name: newName });
            showNotification("Name updated!");
        } catch (err) {
            console.error(err);
            showNotification("Failed to update name.", "error");
        }
    }
};

// Block or unblock a user
window.toggleBlockUser = async (uid, currentStatus) => {
    const action = currentStatus ? "Unblock" : "Block";
    if (customConfirm(`Are you sure you want to ${action} this user?`)) {
        try {
            await updateDoc(doc(db, "users", uid), { isBlocked: !currentStatus });
        } catch (err) {
            console.error(err);
        }
    }
};

// Delete user profile from Firestore (Auth deletion done separately)
window.deleteUserAccount = async (uid) => {
    if (customConfirm("CRITICAL: Delete this user profile from database?")) {
        try {
            await deleteDoc(doc(db, "users", uid));
            showNotification("User profile removed.");
        } catch (err) {
            console.error(err);
        }
    }
};

// Switch between admin tabs
window.switchTab = (tab) => {
    // Hide all sections, deactivate all tabs
    ['orders', 'products', 'customers', 'admins'].forEach(t => {
        const sect = document.getElementById(`${t}-section`);
        const bt = document.getElementById(`tab-${t}`);
        if (sect) sect.style.display = 'none';
        if (bt) bt.classList.remove('active');
    });
    // Show selected section, activate tab
    const activeSection = document.getElementById(`${tab}-section`);
    const activeTab = document.getElementById(`tab-${tab}`);
    if (activeSection) activeSection.style.display = 'block';
    if (activeTab) activeTab.classList.add('active');
    // Start relevant listener
    if (tab === 'orders') startOrderListener();
    if (tab === 'products') startProductListener();
    if (tab === 'customers') startCustomerListener();
    if (tab === 'admins') startAdminListener();
};

// Close any open modal by ID
window.closeModal = (id) => {
    document.getElementById(id).style.display = 'none';
};

/** 6. VIEW USER DETAILS **/
window.viewUserDetails = (uid) => {
    const u = userCache.get(uid);
    if (!u) return;
    const content = document.getElementById('userDetailContent');

    // Format addresses
    const addressHtml = (Array.isArray(u.addresses) && u.addresses.length > 0)
        ? u.addresses.map(a => `
            <div style="background:#f9fafb; padding:12px; border-radius:8px; margin-top:8px; border-left: 4px solid var(--primary-color);">
                <strong>${a.label}:</strong> ${a.street}, ${a.city}<br>
                <small>Province: ${a.province} | Postal: ${a.postalCode || 'N/A'}</small><br>
                <small>Contact: ${a.phone}</small>
            </div>`).join('')
        : '<p>No addresses saved.</p>';

    const cartCount = Array.isArray(u.cart) ? u.cart.length : 0;
    const orderCount = Array.isArray(u.orderIds) ? u.orderIds.length : 0;

    content.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
                <p><small>UID:</small><br><strong>${u.uid}</strong></p>
                <p><small>Email:</small><br><strong>${u.email}</strong></p>
                <p><small>Joined:</small><br>
                   <strong>${new Date(u.createdAt).toLocaleString()}</strong></p>
            </div>
            <div style="background: var(--primary-light); padding: 15px; border-radius: 12px;">
                <h4 style="color: var(--primary-color); margin-bottom: 10px;">Activity Overview</h4>
                <ul style="list-style: none; font-size: 0.9rem; padding-left:0;">
                    <li>🛒 Items in Cart: <strong>${cartCount}</strong></li>
                    <li>📦 Total Orders: <strong>${orderCount}</strong></li>
                    <li>⭐ Wishlist: <strong>${Array.isArray(u.wishlist) ? u.wishlist.length : 0}</strong></li>
                    <li>👀 Recently Viewed: <strong>${Array.isArray(u.recentlyViewed) ? u.recentlyViewed.length : 0}</strong></li>
                </ul>
            </div>
        </div>
        <div style="margin-top: 20px;">
            <h4>Shipping Addresses</h4>
            ${addressHtml}
        </div>
    `;
    document.getElementById('customerDetailModal').style.display = 'flex';
};

/** 7. CHANGE NAME MODAL **/
window.promptChangeName = (uid, currentName) => {
    document.getElementById('editNameUid').value = uid;
    document.getElementById('newNameInput').value = currentName || '';
    document.getElementById('changeNameModal').style.display = 'flex';
};

window.saveNewName = async () => {
    const uid = document.getElementById('editNameUid').value;
    const newName = document.getElementById('newNameInput').value.trim();
    if (!newName) {
        showNotification("Name cannot be empty.", "warning");
        return;
    }
    try {
        await updateDoc(doc(db, "users", uid), { name: newName });
        closeModal('changeNameModal');
    } catch (err) {
        console.error("Update name failed:", err);
        showNotification("Failed to update name.", "error");
    }
};

/** 8. ADMIN LISTENER **/
function startAdminListener() {
    if (adminListenerActive) return;
    adminListenerActive = true;
    const q = query(collection(db, "users"), where("role", "==", "admin"));
    onSnapshot(q, (snapshot) => {
        const adminsBody = document.getElementById('adminsBody');
        adminsBody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const admin = docSnap.data();
            const isSuperAdmin = admin.email === 'abdullahscientist.no2@gmail.com';
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${admin.name}</strong></td>
                <td>${admin.email}</td>
                <td>
                    <span class="badge-active" 
                          style="background:#eef2ff; color:#4f46e5;">
                          Administrator
                    </span>
                </td>
                <td>
                    ${!isSuperAdmin
                    ? `<button class="delete-btn" onclick="demoteAdmin('${docSnap.id}')"
                                    title="Remove Admin Access">
                                <i class="fas fa-user-minus"></i> Remove
                           </button>`
                    : '<small>Super Admin</small>'}
                </td>
            `;
            adminsBody.appendChild(row);
        });
    });
}

// Open promote modal
window.openPromoteModal = () => {
    document.getElementById('promoteEmail').value = '';
    document.getElementById('promoteModal').style.display = 'flex';
};

// Handle promotion to admin
window.handlePromotion = async () => {
    const email = document.getElementById('promoteEmail').value.trim();
    if (!email) return;
    try {
        const q = query(collection(db, "users"), where("email", "==", email));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            showNotification("User not found. They must register first.", "warning");
            return;
        }
        const userDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, "users", userDoc.id), { role: 'admin' });
        showNotification(`${email} is now an Admin!`, "success");
        closeModal('promoteModal');
    } catch (err) {
        console.error("Promotion failed:", err);
        showNotification("Error promoting user.", "error");
    }
};

// Demote admin to customer
window.demoteAdmin = async (uid) => {
    if (confirm("Remove admin privileges?")) {
        try {
            await updateDoc(doc(db, "users", uid), { role: 'customer' });
        } catch (err) {
            console.error("Demote admin failed:", err);
        }
    }
};


// Send WhatsApp message to customer
window.sendWhatsApp = (orderId) => {
    const order = orderCache.get(orderId);

    if (!order) {
        showNotification("Order not found.", "error");
        return;
    }

    let statusMessage = "";

    switch (order.status) {
        case "Confirmed":
            statusMessage = "✅ Your order has been confirmed and is being prepared.";
            break;

        case "Shipped":
            statusMessage = "🚚 Great news! Your order has been shipped.";
            break;

        case "Delivered":
            statusMessage = "🎉 Your order has been delivered. Thank you for shopping with Tijva!";
            break;

        case "Cancelled":
            statusMessage = "❌ Unfortunately, your order has been cancelled.";
            break;

        default:
            statusMessage = "⏳ Your order is currently pending.";
    }

    // Remove spaces, dashes, etc.
    let phone = (order.customer.phone || "").replace(/\D/g, "");

    if (!phone) {
        showNotification("Customer phone number is missing.", "warning");
        return;
    }

    // Automatically convert Pakistani local number to international format
    if (phone.startsWith("03")) {
        phone = "92" + phone.substring(1);
    } else if (phone.startsWith("3")) {
        phone = "92" + phone;
    }

    const items = (order.items || [])
        .map(item => `• ${item.qty} × ${item.name}`)
        .join("\n");

    const message = `Assalam-o-Alaikum ${order.customer.name},

Thank you for shopping with Tijva!

📦 Order ID: ${orderId}

${statusMessage}

Items:
${items}

💰 Total: Rs. ${order.financials.total}

Thank you for choosing Tijva ❤️`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    window.open(url, "_blank");
};
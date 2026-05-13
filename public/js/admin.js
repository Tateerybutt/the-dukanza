import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    collection, query, orderBy, onSnapshot, doc, getDoc,
    setDoc, updateDoc, deleteDoc, where, getDocs, addDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const ordersBody = document.getElementById('ordersBody');
const totalCount = document.getElementById('totalOrderCount');
const overlay = document.getElementById('adminGuardOverlay');

// --- 1. THE SECURITY GUARD ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDocRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userDocRef);

            if (userSnap.exists() && userSnap.data().role === 'admin') {
                if (overlay) overlay.style.display = 'none';
                startOrderListener();
            } else {
                window.location.href = "products.html";
            }
        } catch (error) {
            window.location.href = "products.html";
        }
    } else {
        window.location.href = "auth.html";
    }
});

// --- 2. ORDER LOGIC ---
function startOrderListener() {
    const q = query(collection(db, "orders"), orderBy("orderDate", "desc"));
    onSnapshot(q, (snapshot) => {
        ordersBody.innerHTML = '';
        totalCount.innerText = snapshot.size;
        snapshot.forEach((doc) => renderOrderRow(doc.data()));
    });
}

function renderOrderRow(order) {
    const row = document.createElement('tr');
    const itemsSummary = order.items.map(item => `${item.qty}x ${item.name}`).join(', ');
    const statusClass = `badge-${order.status.toLowerCase()}`;

    row.innerHTML = `
        <td style="font-weight:bold; font-family:monospace;">${order.orderId}</td>
        <td><strong>${order.customer.name}</strong><br><small>${order.customer.phone}</small></td>
        <td><small>${itemsSummary}</small></td>
        <td>Rs. ${order.financials.total}</td>
        <td>
            <select class="status-select ${statusClass}" onchange="updateStatus('${order.orderId}', this.value)">
                <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Confirmed" ${order.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
                <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
        </td>
        <td>
            <button class="wa-btn" onclick="sendWhatsApp('${order.orderId}')">
                <i class="fab fa-whatsapp"></i> Message
            </button>
        </td>
    `;
    ordersBody.appendChild(row);
    window[`order_${order.orderId}`] = order;
}

// --- 3. PRODUCT LOGIC (Modified for Image Array) ---
let productListenerActive = false;
function startProductListener() {
    if (productListenerActive) return;
    const q = query(collection(db, "products"), orderBy("id", "asc"));
    onSnapshot(q, (snapshot) => {
        const productsBody = document.getElementById('productsBody');
        productsBody.innerHTML = '';
        snapshot.forEach((doc) => renderProductRow(doc.id, doc.data()));
        productListenerActive = true;
    });
}

function renderProductRow(docId, p) {
    const row = document.createElement('tr');
    // FIX: Check if images is an array and has at least one item
    const displayImg = (Array.isArray(p.images) && p.images.length > 0) ? p.images[0] : 'assets/images/placeholder.png';

    row.innerHTML = `
        <td><img src="${displayImg}" width="50" height="50" style="border-radius:5px; object-fit:cover;"></td>
        <td><strong>${p.name}</strong><br><small>${docId}</small></td>
        <td>Rs. ${p.price}</td>
        <td>${p.stock}</td>
        <td>
            <button class="edit-btn" onclick="editProduct('${docId}')"><i class="fas fa-edit"></i></button>
            <button class="delete-btn" onclick="deleteProduct('${docId}')"><i class="fas fa-trash"></i></button>
        </td>
    `;
    document.getElementById('productsBody').appendChild(row);
}

// --- 4. ADD / EDIT PRODUCT (Modified for Image Array) ---
const productForm = document.getElementById('productForm');
const imageContainer = document.getElementById('imageInputContainer');

// --- DYNAMIC IMAGE INPUT HELPERS ---
window.addImageInput = (value = "") => {
    const div = document.createElement('div');
    div.className = 'image-input-row';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginBottom = '8px';

    div.innerHTML = `
        <input type="text" class="prod-img-url" value="${value}" placeholder="assets/images/products/..." style="flex: 1;">
        <button type="button" onclick="this.parentElement.remove()" style="background:none; border:none; color:var(--danger); cursor:pointer;">
            <i class="fas fa-times"></i>
        </button>
    `;
    imageContainer.appendChild(div);
};

// --- MODIFIED SAVE LOGIC ---
productForm.onsubmit = async (e) => {
    e.preventDefault();
    const slug = document.getElementById('prodSlug').value;
    const docId = document.getElementById('prodDocId').value || slug;

    // Collect all values from the dynamic inputs
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
        images: imagesArray, // Array of strings
        subtitle: document.getElementById('prodSubtitle').value,
        description: document.getElementById('prodDesc').value,
        fullDescription: document.getElementById('prodFullDesc').value,
        id: document.getElementById('prodDocId').value ? Number(document.getElementById('prodId').value) : Date.now()
    };

    try {
        await setDoc(doc(db, "products", docId), productData, { merge: true });
        closeModal('productModal');
        showNotification("Product Saved!", "success");
    } catch (err) {
        console.error(err);
        showNotification("Error saving product.", "error");
    }
};

// --- MODIFIED EDIT LOGIC ---
window.editProduct = async (docId) => {
    const docSnap = await getDoc(doc(db, "products", docId));
    if (docSnap.exists()) {
        const p = docSnap.data();

        // Clear previous inputs
        imageContainer.innerHTML = '';

        // Standard fields
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

        // Add inputs for each image in the array
        if (Array.isArray(p.images) && p.images.length > 0) {
            p.images.forEach(img => addImageInput(img));
        } else {
            addImageInput(); // Add one blank if empty
        }

        // Handle the ID for sorting
        if (!document.getElementById('prodId')) {
            const hiddenId = document.createElement('input');
            hiddenId.type = 'hidden';
            hiddenId.id = 'prodId';
            productForm.appendChild(hiddenId);
        }
        document.getElementById('prodId').value = p.id;

        document.getElementById('modalTitle').innerText = 'Edit Product';
        document.getElementById('productModal').style.display = 'flex';
    }
};

// --- RESET MODAL LOGIC ---
window.openProductModal = () => {
    productForm.reset();
    imageContainer.innerHTML = '';
    addImageInput(); // Start with one empty input
    document.getElementById('prodDocId').value = '';
    document.getElementById('modalTitle').innerText = 'Add New Product';
    document.getElementById('productModal').style.display = 'flex';
};

// --- GLOBAL HELPERS ---
window.switchTab = (tab) => {
    document.getElementById('orders-section').style.display = tab === 'orders' ? 'block' : 'none';
    document.getElementById('products-section').style.display = tab === 'products' ? 'block' : 'none';
    document.getElementById('tab-orders').classList.toggle('active', tab === 'orders');
    document.getElementById('tab-products').classList.toggle('active', tab === 'products');
    if (tab === 'products') startProductListener();
};

window.openProductModal = () => {
    productForm.reset();
    imageContainer.innerHTML = '';
    addImageInput(); // Start with one empty input
    document.getElementById('prodDocId').value = '';
    document.getElementById('modalTitle').innerText = 'Add New Product';
    document.getElementById('productModal').style.display = 'flex';
};

window.deleteProduct = async (docId) => {
    if (customConfirm(`Delete ${docId}? This cannot be undone.`)) {
        await deleteDoc(doc(db, "products", docId));
    }
};

window.updateStatus = async (orderId, newStatus) => {
    try {
        await updateDoc(doc(db, "orders", orderId), { status: newStatus });
    } catch (error) {
        console.error("Status update failed:", error);
    }
};

// --- CUSTOMER LISTENER ---
let customerListenerActive = false;
function startCustomerListener() {
    if (customerListenerActive) return;
    const q = query(collection(db, "users"), orderBy("name", "asc"));

    onSnapshot(q, (snapshot) => {
        const customersBody = document.getElementById('customersBody');
        document.getElementById('totalUserCount').innerText = snapshot.size;
        customersBody.innerHTML = '';

        snapshot.forEach((doc) => {
            const user = doc.data();
            // Skip showing admins in the customer list if you want
            if (user.role !== 'admin') {
                renderCustomerRow(doc.id, user);
            }
        });
        customerListenerActive = true;
    });
}

// --- UPDATED CUSTOMER RENDERER ---
function renderCustomerRow(uid, u) {
    const row = document.createElement('tr');
    const isBlocked = u.isBlocked === true;

    // Handle the addresses array from your image
    let displayAddress = "No address set";
    if (u.addresses && Array.isArray(u.addresses) && u.addresses.length > 0) {
        const addr = u.addresses[0];
        displayAddress = `${addr.city}, ${addr.province}`; // e.g., Gujrat, Punjab
    } else if (typeof u.addresses === 'string') {
        displayAddress = u.addresses;
    }

    // Handle Order Count
    const orderCount = Array.isArray(u.orderIds) ? u.orderIds.length : (u.orderIds ? 1 : 0);

    row.innerHTML = `
        <td class="customer-info">
            <strong>${u.name || 'Anonymous'}</strong>
            <small>Joined: ${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}</small>
        </td>
        <td><small>${u.email}</small></td>
        <td><span title="${u.addresses && u.addresses[0] ? u.addresses[0].street : ''}">${displayAddress}</span></td>
        <td><span class="badge-orders">${orderCount} Orders</span></td>
        <td>
            <span class="${isBlocked ? 'badge-blocked' : 'badge-active'}">
                ${isBlocked ? 'Blocked' : 'Active'}
            </span>
        </td>
        <td>
            <button class="edit-btn" onclick="viewUserDetails('${uid}')" title="View Full Details">
                <i class="fas fa-eye"></i>
            </button>
            <button class="edit-btn" onclick="editCustomerName('${uid}', '${u.name}')" title="Change Name">
                <i class="fas fa-user-edit"></i>
            </button>
            <button class="${isBlocked ? 'unblock-btn' : 'block-btn'}" onclick="toggleBlockUser('${uid}', ${isBlocked})" title="${isBlocked ? 'Unblock' : 'Block'}">
                <i class="fas ${isBlocked ? 'fa-unlock' : 'fa-ban'}"></i>
            </button>
            <button class="delete-btn" onclick="deleteUserAccount('${uid}')" title="Delete Account">
                <i class="fas fa-trash-alt"></i>
            </button>
        </td>
    `;
    document.getElementById('customersBody').appendChild(row);
    // Store user data globally for the "View Detail" modal
    window[`user_${uid}`] = u;
}

// --- CUSTOMER ACTIONS ---

window.editCustomerName = async (uid, currentName) => {
    const newName = prompt("Enter new name for this customer:", currentName);
    if (newName && newName !== currentName) {
        try {
            await updateDoc(doc(db, "users", uid), { name: newName });
            showNotification("Name updated!");
        } catch (err) {
            console.error(err);
        }
    }
};

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

window.deleteUserAccount = async (uid) => {
    if (customConfirm("CRITICAL: Delete this user account? This removes their profile from Firestore. (Note: Auth account must be deleted via Firebase Console or Admin SDK).")) {
        try {
            await deleteDoc(doc(db, "users", uid));
            showNotification("User profile removed from database.");
        } catch (err) {
            console.error(err);
        }
    }
};

// --- UPDATE TAB SWITCHER ---
const originalSwitchTab = window.switchTab;
window.switchTab = (tab) => {
    // 1. List of all possible section IDs
    const sections = ['orders-section', 'products-section', 'customers-section', 'admins-section'];

    // 2. List of all possible tab button IDs
    const tabs = ['tab-orders', 'tab-products', 'tab-customers', 'tab-admins'];

    // 3. Hide all sections and remove 'active' class from all tabs
    sections.forEach(s => {
        const el = document.getElementById(s);
        if (el) el.style.display = 'none';
    });

    tabs.forEach(t => {
        const el = document.getElementById(t);
        if (el) el.classList.remove('active');
    });

    // 4. Show the selected section
    const targetSection = document.getElementById(`${tab}-section`);
    if (targetSection) {
        targetSection.style.display = 'block';
    } else {
        console.error(`Section ${tab}-section not found!`);
    }

    // 5. Highlight the selected tab
    const targetTab = document.getElementById(`tab-${tab}`);
    if (targetTab) {
        targetTab.classList.add('active');
    }

    // 6. Trigger data listeners for the specific tab
    if (tab === 'orders') startOrderListener();
    if (tab === 'products') startProductListener();
    if (tab === 'customers') startCustomerListener();
    if (tab === 'admins') startAdminListener();
};

// --- MODAL HELPERS ---
window.closeModal = (id) => {
    document.getElementById(id).style.display = 'none';
};

// --- VIEW DETAILS LOGIC ---
window.viewUserDetails = (uid) => {
    const u = window[`user_${uid}`];
    if (!u) return;

    const content = document.getElementById('userDetailContent');

    // Formatting the Address
    const addressHtml = (u.addresses && u.addresses.length > 0)
        ? u.addresses.map(a => `
          <div style="background:#f9fafb; padding:12px; border-radius:8px; margin-top:8px; border-left: 4px solid var(--primary-color);">
            <strong>${a.label}:</strong> ${a.street}, ${a.city} 
            <br><small>Province: ${a.province} | <b>Postal: ${a.postalCode || 'N/A'}</b></small>
            <br><small>Contact: ${a.phone}</small>
          </div>`).join('')
        : '<p>No addresses saved.</p>';

    // Summary calculations
    const cartCount = Array.isArray(u.cart) ? u.cart.length : 0;
    const orderCount = Array.isArray(u.orderIds) ? u.orderIds.length : 0;

    content.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
                <p><small>UID:</small><br><strong>${u.uid}</strong></p>
                <p><small>Email:</small><br><strong>${u.email}</strong></p>
                <p><small>Account Created:</small><br><strong>${new Date(u.createdAt).toLocaleString()}</strong></p>
            </div>
            <div style="background: var(--primary-light); padding: 15px; border-radius: 12px;">
                <h4 style="color: var(--primary-color); margin-bottom: 10px;">Activity Overview</h4>
                <ul style="list-style: none; font-size: 0.9rem;">
                    <li>🛒 Items in Cart: <strong>${cartCount}</strong></li>
                    <li>📦 Total Orders: <strong>${orderCount}</strong></li>
                    <li>⭐ Wishlist: <strong>${Array.isArray(u.wishlist) ? u.wishlist.length : 0}</strong></li>
                    <li>👀 Recently Viewed: <strong>${Array.isArray(u.recentlyViewed) ? u.recentlyViewed.length : 0}</strong></li>
                </ul>
            </div>
        </div>
        <div style="margin-top: 20px;">
            <h4 style="margin-bottom: 10px;">Shipping Addresses</h4>
            ${addressHtml}
        </div>
    `;

    document.getElementById('customerDetailModal').style.display = 'flex';
};

// --- CHANGE NAME LOGIC ---
window.editCustomerName = (uid, currentName) => {
    document.getElementById('editNameUid').value = uid;
    document.getElementById('newNameInput').value = currentName;
    document.getElementById('changeNameModal').style.display = 'flex';
};

window.saveNewName = async () => {
    const uid = document.getElementById('editNameUid').value;
    const newName = document.getElementById('newNameInput').value;

    if (!newName.trim()) return showNotification("Name cannot be empty");

    try {
        await updateDoc(doc(db, "users", uid), { name: newName });
        closeModal('changeNameModal');
        // The onSnapshot listener will automatically update the table UI
    } catch (err) {
        console.error(err);
        showNotification("Failed to update name.");
    }
};

// --- ADMIN LISTENER ---
function startAdminListener() {
    // Only get users where role is 'admin'
    const q = query(collection(db, "users"), where("role", "==", "admin"));

    onSnapshot(q, (snapshot) => {
        const adminsBody = document.getElementById('adminsBody');
        adminsBody.innerHTML = '';

        snapshot.forEach((doc) => {
            const admin = doc.data();
            const isSuperAdmin = admin.email === 'abdullahscientist.no2@gmail.com'; // Your main email

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${admin.name}</strong></td>
                <td>${admin.email}</td>
                <td><span class="badge-active" style="background:#eef2ff; color:#4f46e5;">Administrator</span></td>
                <td>
                    ${!isSuperAdmin ? `
                        <button class="delete-btn" onclick="demoteAdmin('${doc.id}')" title="Remove Admin Access">
                            <i class="fas fa-user-minus"></i> Remove
                        </button>
                    ` : '<small>Super Admin</small>'}
                </td>
            `;
            adminsBody.appendChild(row);
        });
    });
}

// --- PROMOTION LOGIC ---
window.openPromoteModal = () => {
    document.getElementById('promoteEmail').value = '';
    document.getElementById('promoteModal').style.display = 'flex';
};

window.handlePromotion = async () => {
    const email = document.getElementById('promoteEmail').value.trim();
    if (!email) return;

    try {
        // Find user with this email
        const q = query(collection(db, "users"), where("email", "==", email));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            showNotification("No user found with that email. They must register an account first.");
            return;
        }

        const userDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, "users", userDoc.id), {
            role: 'admin'
        });

        showNotification(`${email} is now an Admin!`);
        closeModal('promoteModal');
    } catch (err) {
        console.error(err);
        showNotification("Error promoting user.");
    }
};

window.demoteAdmin = async (uid) => {
    if (confirm("Remove admin privileges for this user? they will become a regular customer.")) {
        try {
            await updateDoc(doc(db, "users", uid), {
                role: 'customer'
            });
        } catch (err) {
            console.error(err);
        }
    }
};
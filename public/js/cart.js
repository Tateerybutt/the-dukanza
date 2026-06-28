import { auth, db } from './firebase-config.js';
import {
    doc,
    getDoc,
    updateDoc,
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let cart = [];

async function getProductByNumericId(numericId) {
    try {
        const productsRef = collection(db, "products");
        const q = query(productsRef, where("id", "==", parseInt(numericId)));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            return querySnapshot.docs[0].data();
        }
        return null;
    } catch (error) {
        console.error("❌ Error querying product:", error);
        return null;
    }
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userRef);
            if (userDoc.exists()) {
                cart = userDoc.data().cart || [];
                renderCart();
            } else {
                loadLocalCart();
            }
        } catch (error) {
            loadLocalCart();
        }
    } else {
        loadLocalCart();
    }
});

function loadLocalCart() {
    cart = JSON.parse(localStorage.getItem("Tijva_temp_cart")) || [];
    renderCart();
}

async function syncCart() {
    const user = auth.currentUser;
    if (user) {
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, { cart: cart });
    } else {
        localStorage.setItem("Tijva_temp_cart", JSON.stringify(cart));
    }
}

window.addToCart = async (productData, qty = 1, variant) => {
    const idNum = typeof productData === 'object' ? parseInt(productData.id) : parseInt(productData);

    // FIX 1: Ensure 'cart' exists. If not defined globally, pull from localStorage.
    if (typeof cart === 'undefined') {
        window.cart = JSON.parse(localStorage.getItem('cart')) || [];
    }

    // FIX 2: Ensure variant is at least an empty string to prevent Firestore 'undefined' errors.
    const finalVariant = (variant !== undefined && variant !== null) ? variant : "";

    // Find if item already exists in the cart
    const existingItem = cart.find(item =>
        item.id === idNum && item.variant === finalVariant
    );

    if (existingItem) {
        existingItem.qty += qty;
    } else {
        cart.push({
            id: idNum,
            qty: qty,
            variant: finalVariant
        });
    }

    // Save back to localStorage so other pages stay in sync
    localStorage.setItem('cart', JSON.stringify(cart));

    try {
        // Only call these if they are defined in your helper scripts
        if (typeof syncCart === "function") await syncCart();
        if (typeof renderCart === "function") renderCart();

        showNotification("Added to cart!", "success");
    } catch (error) {
        console.error("Cart sync failed:", error);
    }
};

window.renderCart = async () => {
    const container = document.getElementById("cartItems");
    const emptyMsg = document.getElementById("emptyCart");
    const cartSummary = document.getElementById("cartSummary"); // Ensure this ID exists in your HTML

    if (!container) return;

    if (cart.length === 0) {
        container.innerHTML = "";
        if (emptyMsg) {
            // Update the empty message with a Clear CTA
            emptyMsg.innerHTML = `
                <div style="text-align:center; padding: 40px 20px;">
                    <i class="fas fa-shopping-basket" style="font-size: 3rem; color: #ccc; margin-bottom: 15px;"></i>
                    <h3>Your cart is empty</h3>
                    <p style="color: #666; margin-bottom: 20px;">Add some items to get started!</p>
                    <a href="products.html" class="shop-now-btn" style="
                        background: #ff5a36; 
                        color: white; 
                        padding: 10px 25px; 
                        border-radius: 25px; 
                        text-decoration: none;
                        display: inline-block;
                        font-weight: bold;">
                        Start Shopping
                    </a>
                </div>
            `;
            emptyMsg.style.display = "block";
        }

        // HIDE the summary sidebar/section if cart is empty
        if (cartSummary) cartSummary.style.display = "none";

        updateSummary(0);
        return;
    }

    // SHOW the summary if cart has items
    if (emptyMsg) emptyMsg.style.display = "none";
    if (cartSummary) cartSummary.style.display = "block";

    // SHOW SKELETONS WHILE LOADING PRODUCT DETAILS
    container.innerHTML = cart.map(() => `
        <div class="cart-item-skeleton" style="display:flex; gap:15px; margin-bottom:15px; align-items:center;">
            <div class="skeleton" style="width:60px; height:60px; border-radius:8px;"></div>
            <div style="flex:1;">
                <div class="skeleton" style="width:60%; height:15px; margin-bottom:8px;"></div>
                <div class="skeleton" style="width:30%; height:12px;"></div>
            </div>
        </div>
    `).join('');

    let grandTotal = 0;
    let finalHTML = "";

    for (const item of cart) {
        const p = await getProductByNumericId(item.id);
        if (p) {
            const itemTotal = p.price * item.qty;
            grandTotal += itemTotal;
            const mainImg = p.images?.[0] || 'assets/images/placeholder.png';

            finalHTML += `
                <div class="cart-item">
                    <div class="cart-item-info-group">
                        <img src="${mainImg}" alt="${p.name}" style="width: 60px; border-radius: 8px;">
                        <div class="cart-item-details">
                            <h4>${p.name}</h4>
                            <p class="variant-tag">${item.variant}</p>
                            <span>Rs. ${p.price}</span>
                        </div>
                    </div>
                    <div class="cart-qty">
                        <button onclick="changeQty(${item.id}, -1, '${item.variant}')"><i class="fas fa-minus"></i></button>
                        <span>${item.qty}</span>
                        <button onclick="changeQty(${item.id}, 1, '${item.variant}')"><i class="fas fa-plus"></i></button>
                    </div>
                    <button class="remove-btn" onclick="removeFromCart(${item.id}, '${item.variant}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }
    }

    container.innerHTML = finalHTML;
    updateSummary(grandTotal);
}

// --- HELPER: REFRESH UI BASED ON PAGE ---
const refreshCartUI = (updatedCart) => {
    const isProfile = window.location.pathname.includes('profile.html');

    if (isProfile) {
        if (typeof renderCartPreview === 'function') renderCartPreview(updatedCart);
    } else {
        if (typeof renderCart === 'function') renderCart();
    }
};

// --- CHANGE QUANTITY ---
window.changeQty = async (id, delta, variant) => {
    try {
        const user = auth.currentUser;
        if (!user) return;

        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            let cart = userDoc.data().cart || [];
            const idNum = parseInt(id);

            // Find the item index
            const itemIndex = cart.findIndex(i => i.id === idNum && i.variant === variant);

            if (itemIndex !== -1) {
                cart[itemIndex].qty += delta;

                // Remove item if quantity drops to 0 or less
                if (cart[itemIndex].qty <= 0) {
                    cart.splice(itemIndex, 1);
                }

                // Update Firestore
                await updateDoc(userRef, { cart: cart });

                // Update UI without reloading
                renderCart();
            }
        }
    } catch (error) {
        console.error("Error changing quantity:", error);
    }
};

// --- REMOVE FROM CART ---
window.removeFromCart = async (id, variant) => {
    try {
        const user = auth.currentUser;
        if (!user) return;

        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            const currentCart = userDoc.data().cart || [];
            const idNum = parseInt(id);

            // Filter out the item
            const updatedCart = currentCart.filter(item =>
                !(item.id === idNum && item.variant === variant)
            );

            // Update Firestore
            await updateDoc(userRef, { cart: updatedCart });

            // Update UI without reloading
            renderCart();
        }
    } catch (error) {
        console.error("Error removing item:", error);
    }
};

function updateSummary(total) {
    const subtotalEl = document.getElementById("subtotal");
    const totalEl = document.getElementById("total");
    if (subtotalEl) subtotalEl.innerText = `Rs. ${total}`;
    if (totalEl) totalEl.innerText = `Rs. ${total}`;
}

window.sendWhatsAppOrder = async () => {
    if (cart.length === 0) return;
    let message = "🛒 *New Order from Tijva*:%0A%0A";
    let runningTotal = 0;

    for (const item of cart) {
        const p = await getProductByNumericId(item.id);
        if (p) {
            const total = p.price * item.qty;
            runningTotal += total;
            message += `* ${p.name} (${item.variant})%0A   Qty: ${item.qty} x Rs. ${p.price}%0A   Sub: Rs. ${total}%0A%0A`;
        }
    }

    message += `💰 *Total: Rs. ${runningTotal}*`;
    const phone = "923006210027";
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
};
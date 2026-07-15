import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    arrayUnion,
    serverTimestamp,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- DOM ELEMENTS ---
const checkoutForm = document.getElementById('checkoutForm');
const addressSelect = document.getElementById('checkoutAddressSelect');
const summaryItemsContainer = document.getElementById('checkoutSummaryItems');
const summaryTotalDisplay = document.getElementById('summaryTotal');

// Inline Address Toggle Elements
const toggleNewAddressBtn = document.getElementById('toggleNewAddressBtn');
const inlineAddressForm = document.getElementById('inlineAddressForm');
const saveInlineAddressBtn = document.getElementById('saveInlineAddressBtn');
const cancelInlineAddressBtn = document.getElementById('cancelInlineAddressBtn');
const inlineCity = document.getElementById('inlineCity');
const inlineFullAddress = document.getElementById('inlineFullAddress');

let currentUserData = null;
let currentCartItems = [];
let orderTotal = 0;

// --- GLOBAL NOTIFICATION HELPER ---
function notify(msg, type = "success") {
    if (window.showNotification) {
        window.showNotification(msg, type);
    } else {
        alert(`${type.toUpperCase()}: ${msg}`);
    }
}

// --- AUTH PROTECTOR & INITIALIZER ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        notify("Please log in to proceed to checkout", "warning");
        window.location.replace("auth.html");
        return;
    }

    try {
        // Fetch fresh user data from Firestore
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) {
            currentUserData = userSnap.data();
            const buyNow = sessionStorage.getItem("buyNowItem");
            const isBuyNow =
                sessionStorage.getItem("buyNowItem") !== null;
            if (buyNow) {

                currentCartItems = [
                    JSON.parse(buyNow)
                ];

            } else {

                currentCartItems = currentUserData.cart || [];

            }

            // Pre-fill fundamental contact details if available
            document.getElementById('checkoutName').value = currentUserData.name || '';
            document.getElementById('checkoutEmail').value = currentUserData.email || '';

            // Guard against checking out an empty cart
            if (currentCartItems.length === 0) {
                notify("Your cart is empty! Redirecting to products...", "warning");
                window.location.href = "products.html";
                return;
            }

            // Populate components
            renderAddresses(currentUserData.addresses || []);
            await renderOrderSummary(currentCartItems);

            if (typeof gtag === "function") {
                gtag("event", "begin_checkout", {
                    currency: "PKR",
                    value: orderTotal
                });
            }
        }
    } catch (err) {
        console.error("Error loading checkout data:", err);
        notify("Failed to load checkout settings", "error");
    }
});

// --- ADDRESS MANIPULATION RENDERERS ---
function renderAddresses(addressesArray) {
    if (addressesArray.length === 0) {
        addressSelect.innerHTML = `<option value="" disabled selected>No saved addresses found. Please add one.</option>`;
        addressSelect.required = true;
        return;
    }

    addressSelect.innerHTML = `<option value="" disabled selected>-- Select a Shipping Profile --</option>`;

    addressesArray.forEach((addr) => {
        const option = document.createElement('option');
        // Serialize the full object so the submission payload catches everything
        option.value = JSON.stringify(addr);

        // Beautifully display the details to the customer
        option.innerText = `[${addr.label.toUpperCase()}] ${addr.street}, ${addr.city}, ${addr.province} (${addr.phone})`;
        addressSelect.appendChild(option);
    });
}

// --- TOGGLE HANDLERS FOR INLINE FORM ---
toggleNewAddressBtn.onclick = () => {
    inlineAddressForm.style.display = 'block';
};

cancelInlineAddressBtn.onclick = () => {
    clearInlineInputs();
};

// Save Inline New Address directly to Firestore Profile
saveInlineAddressBtn.onclick = async () => {
    const label = document.getElementById('inlineLabel').value.trim();
    const phone = document.getElementById('inlinePhone').value.trim();
    const street = document.getElementById('inlineStreet').value.trim();
    const city = document.getElementById('inlineCity').value.trim();
    const province = document.getElementById('inlineProvince').value.trim();
    const postalCode = document.getElementById('addrPostal').value.trim();

    // Validation
    if (!label || !phone || !street || !city || !province) {
        notify("Please fill out all fields before saving", "error");
        return;
    }

    // Match your precise structural layout 1:1
    const newAddressObj = {
        label: label,
        phone: phone,
        street: street,
        city: city,
        province: province,
        postalCode: postalCode
    };

    try {
        const userDocRef = doc(db, "users", auth.currentUser.uid);

        // Instantly write to array field
        await updateDoc(userDocRef, {
            addresses: arrayUnion(newAddressObj)
        });

        notify("Address saved to profile successfully!");

        // Update local memory and re-render dropdown options
        if (!currentUserData.addresses) currentUserData.addresses = [];
        currentUserData.addresses.push(newAddressObj);
        renderAddresses(currentUserData.addresses);

        // Auto-select it
        addressSelect.value = JSON.stringify(newAddressObj);

        // Clean out inputs
        clearInlineInputs();
    } catch (err) {
        console.error("Error updating address profile:", err);
        notify("Could not save address to database", "error");
    }
};

function clearInlineInputs() {
    document.getElementById('inlineLabel').value = '';
    document.getElementById('inlinePhone').value = '';
    document.getElementById('inlineStreet').value = '';
    document.getElementById('inlineCity').value = '';
    document.getElementById('inlineProvince').value = '';
    inlineAddressForm.style.display = 'none';
}

// Helper to generate a custom Alphanumeric Order ID
function generateOrderID(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'DKZ';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// --- UPDATED ORDER SUBMISSION ---
checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user || !currentCartItems.length) return;

    if (!addressSelect.value) {
        notify("Please select a shipping address profile", "error");
        return;
    }

    const submitBtn = checkoutForm.querySelector('.place-order-btn');
    submitBtn.disabled = true;
    submitBtn.innerText = "Processing...";

    // 1. Generate Alphanumeric ID for the Document Name
    const orderId = generateOrderID();
    const selectedAddress = JSON.parse(addressSelect.value);
    const selectedPayment = document.getElementById('checkoutPayment').value;

    try {

        let initialPaymentStatus = "Pending";
        if (selectedPayment === "cod") {
            initialPaymentStatus = "Cash on Delivery";
        } else {
            initialPaymentStatus = "Awaiting Verification"; // For Bank/EasyPaisa
        }

        // 2. Build the Order Items Snapshot
        const orderItems = [];
        for (const item of currentCartItems) {
            const q = query(collection(db, "products"), where("id", "==", Number(item.id)));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const pData = querySnapshot.docs[0].data();
                orderItems.push({
                    name: pData.name,
                    variant: item.variant || "Standard",
                    qty: Number(item.qty),
                    snapshotPrice: Number(pData.price),
                    sku: `DKZ-${pData.id}-${(item.variant || 'std').toUpperCase()}`,
                    image: pData.images ? pData.images[0] : ''
                });
            }
        }

        const subtotal = orderItems.reduce((acc, curr) => acc + (curr.snapshotPrice * curr.qty), 0);
        const shippingFee = 250;

        // 3. Construct the Order Document
        const finalOrderData = {
            orderId: orderId, // The alphanumeric ID
            userId: user.uid,
            orderDate: serverTimestamp(),
            status: "Processing",
            paymentStatus: "Pending",
            paymentMethod: selectedPayment,
            customer: {
                name: document.getElementById('checkoutName').value.trim() || user.displayName,
                email: user.email,
                // Automatically use the phone from the chosen address profile
                phone: selectedAddress.phone
            },
            shipping: {
                label: selectedAddress.label,
                street: selectedAddress.street,
                city: selectedAddress.city,
                province: selectedAddress.province
            },
            items: orderItems,
            financials: {
                subtotal: subtotal,
                shipping: shippingFee,
                total: subtotal + shippingFee
            }
        };

        // 4. Save to Firestore using orderId as the Document Name
        // This makes the URL/Reference clean: orders/DKZ82A91B
        await setDoc(doc(db, "orders", orderId), finalOrderData);

        if (typeof gtag === "function") {
            gtag("event", "purchase", {
                transaction_id: orderId,
                value: subtotal + shippingFee,
                currency: "PKR",
                shipping: shippingFee,
                items: orderItems.map(item => ({
                    item_id: item.sku,
                    item_name: item.name,
                    item_variant: item.variant,
                    price: item.snapshotPrice,
                    quantity: item.qty
                }))
            });
        }

        // 5. Update User: Clear Cart and Save Order Reference
        const userRef = doc(db, "users", user.uid);
        const isBuyNow =
            sessionStorage.getItem("buyNowItem") !== null;
        if (isBuyNow) {

            sessionStorage.removeItem("buyNowItem");

            await updateDoc(userRef, {
                orderIds: arrayUnion(orderId)
            });

        } else {

            await updateDoc(userRef, {
                cart: [],
                orderIds: arrayUnion(orderId)
            });

        }

        notify(`Success! Order ${orderId} placed.`, "success");

        setTimeout(() => {
            window.location.href = `thankyou.html?orderId=${orderId}`;
        }, 2000);

    } catch (error) {
        console.error("Order process failure:", error);
        notify("Checkout failed. Please try again.", "error");
        submitBtn.disabled = false;
        submitBtn.innerText = "Place Order";
    }
});

const paymentSelect = document.getElementById('checkoutPayment');
const instructionsDiv = document.getElementById('paymentInstructions');
const instructionText = document.getElementById('instructionText');

paymentSelect.onchange = () => {
    if (typeof gtag === "function") {
        gtag("event", "add_payment_info", {
            payment_type: paymentSelect.value
        });
    }

    const method = paymentSelect.value;
    instructionsDiv.style.display = 'block';

    // Base message for manual payments
    const screenshotMsg = `<p style="color: #ff5a36; font-weight: bold; margin-top: 10px;">
        <i class="fas fa-exclamation-triangle" style="font-size: 30px; margin-right: 5px;"></i> IMPORTANT: Please send a screenshot of your payment receipt to our <a href="https://wa.me/03006210027" target="_blank" style="color: #075E54; text-decoration: none;"><i class="fab fa-whatsapp" style="font-weight: bold;"></i> WhatsApp (0300-XXXXXXX)</a> for verification.
    </p>`;

    if (method === 'bank_transfer') {
        instructionText.innerHTML = `
            <strong>Bank:</strong> HBL <br>
            <strong>Acc Name:</strong> Tijva <br>
            <strong>IBAN:</strong> PK00 HABA 0000 1234 5678 90 
            ${screenshotMsg}`;
    } else if (method === 'easypaisa') {
        instructionText.innerHTML = `
            <strong>Easypaisa:</strong> 0300-XXXXXXX <br>
            <strong>Name:</strong> Abdullah Imran
            ${screenshotMsg}`;
    } else if (method === 'jazzcash') {
        instructionText.innerHTML = `
            <strong>JazzCash:</strong> 0300-XXXXXXX <br>
            <strong>Name:</strong> Abdullah Imran
            ${screenshotMsg}`;
    } else {
        instructionsDiv.style.display = 'none'; // Hide for COD
    }
};

// --- DYNAMIC ORDER SUMMARY LOADER (QUERY BASED) ---
async function renderOrderSummary(cart) {
    console.log("🛒 Starting Query for Cart Items:", cart);

    const summaryItemsContainer = document.getElementById('checkoutSummaryItems');
    const summaryTotalDisplay = document.getElementById('summaryTotal');

    summaryItemsContainer.innerHTML = '';
    orderTotal = 0;

    for (const item of cart) {
        try {
            // Because your Firestore has Document ID "mobile-holder" but field id: 2
            // We must search for the document that has id == 2
            const productsRef = collection(db, "products");
            const q = query(productsRef, where("id", "==", Number(item.id)));

            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                // Get the first matching document (since IDs should be unique)
                const prodDoc = querySnapshot.docs[0];
                const prod = prodDoc.data();

                console.log(`✅ Found: ${prod.name} (Price: ${prod.price})`);

                const itemPrice = parseFloat(prod.price) || 0;
                const itemQty = parseInt(item.qty) || 1;
                const itemSubtotal = itemPrice * itemQty;

                orderTotal += itemSubtotal;

                const variantText = item.variant ? ` (${item.variant})` : '';

                summaryItemsContainer.innerHTML += `
                    <div class="summary-item" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span>${prod.name}${variantText} <strong style="color: #ff5a36;">× ${itemQty}</strong></span>
                        <span>Rs. ${itemSubtotal}</span>
                    </div>
                `;
            } else {
                console.warn(`⚠️ Product ID ${item.id} not found in Firestore fields.`);
                summaryItemsContainer.innerHTML += `
                    <div class="summary-item" style="color: #888;">
                        <span>Item Not Found (ID: ${item.id})</span>
                        <span>—</span>
                    </div>
                `;
            }
        } catch (err) {
            console.error(`❌ Query Error for ID [${item.id}]:`, err);
        }
    }

    summaryTotalDisplay.innerText = `Rs. ${orderTotal}`;
}
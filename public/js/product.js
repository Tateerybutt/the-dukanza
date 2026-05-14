import { db, auth } from './firebase-config.js';
import {
    collection,
    query,
    where,
    limit,
    getDocs,
    doc,
    updateDoc,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const params = new URLSearchParams(window.location.search);
const productIdRaw = params.get("id");

// ONLY redirect if we are specifically on the product page and missing an ID
if (window.location.pathname.includes("product.html")) {
    if (!productIdRaw) {
        window.location.href = 'index.html';
    }
}

const productIdNum = parseInt(productIdRaw);
// Default to an empty string to avoid 'undefined' errors in Firestore
let selectedVariant = "";

async function loadProductDetails() {
    const skeleton = document.getElementById("productSkeleton");
    const content = document.getElementById("productContent");

    try {
        if (skeleton) skeleton.style.display = "block";
        if (content) content.style.display = "none";

        const productsRef = collection(db, "products");
        const q = query(productsRef, where("id", "==", productIdNum));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            document.body.innerHTML = `<h2 style="text-align:center;margin-top:50px;">Product not found</h2>`;
            return;
        }

        const product = querySnapshot.docs[0].data();

        // FIX: Ensure selectedVariant is set to the DB property or an empty string, NEVER undefined
        selectedVariant = product.defaultVariant || "";

        document.title = `${product.name} | The Dukanza`;

        document.getElementById("productName").innerText = product.name;
        document.getElementById("productTitle").innerText = product.name;

        const subEl = document.getElementById("productSubtitle");
        if (subEl) subEl.innerText = product.subtitle || "";

        document.getElementById("productDescription").innerText = product.description || "";

        const fullDesc = document.getElementById("fullDescription");
        if (fullDesc) fullDesc.innerText = product.fullDescription || product.description;

        document.getElementById("newPrice").innerText = "Rs. " + product.price;
        const oldPriceEl = document.getElementById("oldPrice");
        if (oldPriceEl && product.oldPrice) {
            oldPriceEl.innerText = "Rs. " + product.oldPrice;
        }

        const mainImg = document.getElementById("mainProductImage");
        if (mainImg && product.images?.length > 0) {
            mainImg.src = product.images[0];

            const thumbBox = document.getElementById("thumbnailSlider");
            if (thumbBox) {
                thumbBox.innerHTML = "";
                product.images.forEach(img => {
                    const el = document.createElement("img");
                    el.src = img;
                    el.className = "thumb-img";
                    el.onclick = () => mainImg.src = img;
                    thumbBox.appendChild(el);
                });
            }
        }

        setupVariants(product.variants, selectedVariant);
        setupReviews(product.reviews);
        loadRelatedProducts(product.category, productIdNum);
        trackProductView(productIdNum);

        const addBtn = document.getElementById("addBtn");
        if (addBtn) {
            addBtn.onclick = () => {
                const qtyInput = document.getElementById("qtyInput");
                const qty = qtyInput ? Number(qtyInput.value) : 1;

                if (window.addToCart) {
                    // Passes the current selectedVariant
                    window.addToCart(productIdNum, qty, selectedVariant);
                }
            };
        }

        const wishBtn = document.getElementById("wishlistBtn");
        if (wishBtn) {
            wishBtn.onclick = () => addToWishlist(productIdNum);
        }

        if (skeleton) skeleton.style.display = "none";
        if (content) content.style.display = "block";

    } catch (error) {
        console.error("❌ Error loading product details:", error);
        if (skeleton) skeleton.style.display = "none";
    }
}

function setupVariants(variants, defaultVal) {
    const variantBox = document.getElementById("variantBox");
    if (!variantBox) return;

    if (variants && variants.length > 0) {
        variantBox.style.display = "flex";
        variantBox.innerHTML = "";
        variants.forEach((v) => {
            const btn = document.createElement("button");
            btn.className = "variant-btn" + (v === defaultVal ? " active" : "");
            btn.innerText = v;
            btn.onclick = () => {
                document.querySelectorAll(".variant-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                selectedVariant = v;
            };
            variantBox.appendChild(btn);
        });
    } else {
        variantBox.style.display = "none";
    }
}

function setupReviews(reviews) {
    const reviewBox = document.getElementById("reviewsBox");
    if (!reviewBox) return;

    const reviewList = (reviews && reviews.length > 0) ? reviews : [
        { name: "Haris J.", comment: "Best purchase this month! Quality is top-notch." },
        { name: "Zoya A.", comment: "Value for money. Delivery was surprisingly fast." }
    ];

    reviewBox.innerHTML = reviewList.map(r => `
        <div class="review-card" style="padding: 15px; border-bottom: 1px solid #eee;">
            <h4 style="margin: 0;">${r.name} <span style="color: #f1c40f;">⭐⭐⭐⭐⭐</span></h4>
            <p style="color: #666; margin-top: 5px;">${r.comment}</p>
        </div>
    `).join('');
}

async function loadRelatedProducts(category, currentId) {
    const grid = document.getElementById("relatedProductsGrid");
    if (!grid) return;

    try {
        const q = query(
            collection(db, "products"),
            where("category", "==", category),
            limit(5)
        );
        const snap = await getDocs(q);
        grid.innerHTML = "";

        snap.forEach(docSnap => {
            const product = docSnap.data();
            if (product.id !== currentId) {
                const item = document.createElement("div");
                item.className = "product-card";
                const imgDefault = (product.images && product.images[0]) ? product.images[0] : 'assets/images/placeholder.png';
                const imgHover = (product.images && product.images[1]) ? product.images[1] : imgDefault;
                item.setAttribute("onclick", `openProduct('${product.id}')`);
                item.innerHTML = `
                    <div class="product-image">
                        <img class="img-default" src="${imgDefault}" alt="${product.name}">
                        <img class="img-hover" src="${imgHover}" alt="${product.name}">
                    </div>
                    <h3>${product.name}</h3>
                    <p style="font-size: 0.8rem; color: #666; margin-bottom: 5px;">${product.subtitle || ''}</p>
                    <div class="price-box">
                        ${product.oldPrice ? `<span class="old-price">Rs. ${product.oldPrice}</span>` : ''}
                        <span class="new-price">Rs. ${product.price}</span>
                    </div>
                `;
                const cardBtn = document.createElement("button");
                cardBtn.className = "add-btn";
                cardBtn.innerText = "Add to Cart";
                cardBtn.onclick = () => window.addToCart(product.id, 1, product.defaultVariant || "");
                item.appendChild(cardBtn);
                grid.appendChild(item);
            }
        });
    } catch (e) { console.warn("Related products failed", e); }
}

async function trackProductView(id) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userRef = doc(db, "users", user.uid);
                await updateDoc(userRef, { recentlyViewed: arrayUnion(id) });
            } catch (e) { console.warn("Track view error", e); }
        }
    });
}

async function addToWishlist(id) {
    const user = auth.currentUser;

    if (!user) {
        if (typeof showNotification === "function") {
            showNotification("Please login to save favorites", "warning");
        } else {
            alert("Please login to use wishlist");
        }
        return;
    }

    try {
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
            wishlist: arrayUnion(id)
        });

        if (typeof showNotification === "function") {
            showNotification("Added to Wishlist!", "success");
        } else {
            alert("Added to Wishlist!");
        }
    } catch (err) {
        console.error("Wishlist error:", err);
        if (typeof showNotification === "function") {
            showNotification("Could not add to wishlist", "error");
        }
    }
}

if(window.location.pathname.includes("product.html")) {
    loadProductDetails();
}
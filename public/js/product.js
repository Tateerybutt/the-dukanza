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
let currentImageIndex = 0;
let currentImages = [];
let touchStartX = 0;
let touchEndX = 0;

// ONLY redirect if we are specifically on the product page and missing an ID
if (window.location.pathname === "/product" || window.location.pathname === "/product.html") {
    if (!productIdRaw) {
        window.location.href = 'index.html';
    }
}

const productIdNum = Number(productIdRaw);

if (!Number.isFinite(productIdNum)) {
    window.location.href = "index.html";
}
// Default to an empty string to avoid 'undefined' errors in Firestore
let selectedVariant = "";

function nextImage() {
    currentImageIndex = (currentImageIndex + 1) % currentImages.length;
    changeImage(currentImageIndex);


}

function prevImage() {

    currentImageIndex =
        (currentImageIndex - 1 + currentImages.length) % currentImages.length;

    changeImage(currentImageIndex);



}

async function loadProductDetails() {
    console.log("loadProductDetails() started");
    const skeleton = document.getElementById("productSkeleton");
    const content = document.getElementById("productContent");

    try {
        if (skeleton) skeleton.style.display = "block";
        if (content) content.style.display = "none";

        const productsRef = collection(db, "products");
        const q = query(productsRef, where("id", "==", productIdNum));
        const querySnapshot = await getDocs(q);
        console.log("Querying Firestore...");
        console.log("Firestore returned", querySnapshot.size);

        if (querySnapshot.empty) {
            document.body.innerHTML = `<h2 style="text-align:center;margin-top:50px;">Product not found</h2>`;
            return;
        }

        const product = querySnapshot.docs[0].data();
        if (product.imageFolder && product.imageCount) {

            currentImages = Array.from(
                { length: product.imageCount },
                (_, i) =>
                    `assets/images/products/${product.imageFolder}/${i + 1}.webp`
            );

        } else {

            // fallback for old products
            currentImages = product.images || [];

        }

        currentImageIndex = 0;

        preloadImages(currentImages);

        const counter = document.getElementById("galleryCounter");

        if (counter) {

            counter.style.display = currentImages.length > 1 ? "block" : "none";

        }

        const stockLabel = document.getElementById("stockStatus");

        if (stockLabel) {

            const stock = Number(product.stock || 0);

            if (stock > 0) {

                stockLabel.innerHTML = "<i class='fas fa-check-circle'></i> In Stock";
                stockLabel.className = "in-stock";

            } else {

                stockLabel.innerHTML = "<i class='fas fa-times-circle'></i> Out of Stock";
                stockLabel.className = "out-of-stock";

                document.getElementById("addBtn").disabled = true;
                document.getElementById("buyNowBtn").disabled = true;
                document.getElementById("qtyInput").disabled = true;

            }

        }

        // FIX: Ensure selectedVariant is set to the DB property or an empty string, NEVER undefined
        selectedVariant = product.defaultVariant || "";

        document.title = `${product.name} | Tijva`;

        document.getElementById("productName").innerText = product.name;
        document.getElementById("productTitle").innerText = product.name;

        const subEl = document.getElementById("productSubtitle");
        if (subEl) subEl.innerText = product.subtitle || "";

        document.getElementById("productDescription").innerText = product.description || "";

        const fullDesc = document.getElementById("fullDescription");
        if (fullDesc) fullDesc.innerHTML = product.fullDescription || product.description;

        document.getElementById("newPrice").innerText = "Rs. " + product.price;
        const oldPriceEl = document.getElementById("oldPrice");
        if (oldPriceEl && product.oldPrice) {
            oldPriceEl.innerText = "Rs. " + product.oldPrice;
        }

        const mainImg = document.getElementById("mainProductImage");
        if (mainImg && currentImages.length > 0) {
            changeImage(0);

            const thumbBox = document.getElementById("thumbnailSlider");

            if (thumbBox) {

                thumbBox.innerHTML = "";

                const hasMultiple = currentImages.length > 1;

                document.getElementById("prevImage").style.display =
                    hasMultiple ? "flex" : "none";

                document.getElementById("nextImage").style.display =
                    hasMultiple ? "flex" : "none";

                currentImages.forEach((img, index) => {

                    const thumb = document.createElement("img");

                    thumb.src = img;
                    thumb.className = "thumb-img";

                    if (index === 0)
                        thumb.classList.add("active");

                    thumb.onclick = () => changeImage(index);

                    thumbBox.appendChild(thumb);

                });
            }
        }

        setupVariants(product.variants, selectedVariant);
        setupReviews(product.reviews);
        loadRelatedProducts(product.category, productIdNum);
        trackProductView(productIdNum);

        gtag('event', 'view_item', {
            currency: 'PKR',
            value: product.price,
            items: [{
                item_id: String(product.id),
                item_name: product.name,
                item_category: product.category
            }]
        });

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

        const buyNowBtn = document.getElementById("buyNowBtn");

        if (buyNowBtn) {
            buyNowBtn.onclick = () => {

                const qty = Number(document.getElementById("qtyInput").value);

                const buyNowItem = {
                    id: productIdNum,
                    qty: qty,
                    variant: selectedVariant
                };

                sessionStorage.setItem(
                    "buyNowItem",
                    JSON.stringify(buyNowItem)
                );

                gtag('event', 'begin_checkout', {
                    currency: 'PKR',
                    value: product.price * qty,
                    items: [{
                        item_id: String(product.id),
                        item_name: product.name,
                        quantity: qty
                    }]
                });

                window.location.href = "checkout.html";
            };
        }

        // WhatsApp Button
        const whatsappBtn = document.getElementById("whatsappBtn");

        if (whatsappBtn) {

            const phone = "923006210027"; // Your WhatsApp number

            const message = `Assalam-o-Alaikum!

I'm interested in this product.

📦 Product: ${product.name}
🆔 Product ID: ${product.id}
🎨 Variant: ${selectedVariant || "Default"}
💰 Price: Rs. ${product.price}
🔗 ${window.location.href}`;

            whatsappBtn.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

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

const gallery = document.querySelector(".main-image-wrapper");

if (gallery) {

    gallery.addEventListener("touchstart", e => {

        if (e.target.closest(".thumbnail-slider")) return;

        touchStartX = e.changedTouches[0].clientX;

    });

    gallery.addEventListener("touchend", e => {

        if (e.target.closest(".thumbnail-slider")) return;

        touchEndX = e.changedTouches[0].clientX;

        const diff = touchStartX - touchEndX;

        if (Math.abs(diff) < 50) return;

        if (diff > 0) {
            nextImage();
        } else {
            prevImage();
        }

    });

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

                document.querySelectorAll(".variant-btn").forEach(b =>
                    b.classList.remove("active")
                );

                btn.classList.add("active");
                selectedVariant = v;

                // Update WhatsApp message
                const whatsappBtn = document.getElementById("whatsappBtn");

                if (whatsappBtn) {

                    const phone = "923006210027";

                    const message = `Assalam-o-Alaikum!

I'm interested in this product.

📦 Product: ${document.getElementById("productName").innerText}
🆔 Product ID: ${productIdNum}
🎨 Variant: ${selectedVariant}
💰 Price: ${document.getElementById("newPrice").innerText}
🔗 ${window.location.href}`;

                    whatsappBtn.href =
                        `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

                }

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
            <h4 style="margin: 0;">${r.name} <span style="color: var(--primary-color);"><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i></span></h4>
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
                const imgDefault =
                    product.imageFolder && product.imageCount > 1
                        ? `assets/images/products/${product.imageFolder}/1.webp`
                        : 'assets/images/placeholder.png';
                const imgHover =
                    product.imageFolder && product.imageCount > 1
                        ? `assets/images/products/${product.imageFolder}/2.webp`
                        : imgDefault;
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
            showNotification("Please login to use Wishlist", "warning");
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

        gtag('event', 'add_to_wishlist', {
            items: [{
                item_id: String(id)
            }]
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

if (window.location.pathname.includes("product")) {
    loadProductDetails();
}


function changeImage(index) {

    if (index < 0 || index >= currentImages.length) return;

    currentImageIndex = index;

    const img = document.getElementById("mainProductImage");
    const container = img.parentElement;

    container.classList.add("changing");

    setTimeout(() => {
        img.src = currentImages[index];
        container.classList.remove("changing");
    }, 180);

    document.querySelectorAll(".thumb-img").forEach((thumb, i) => {

        thumb.classList.toggle("active", i === index);

    });
    updateCounter();
}

document.addEventListener("keydown", e => {

    if (e.key === "ArrowRight") nextImage();

    if (e.key === "ArrowLeft") prevImage();

});

function updateCounter() {

    const counter = document.getElementById("galleryCounter");

    if (!counter) return;

    counter.textContent = `${currentImageIndex + 1} / ${currentImages.length}`;

}

function preloadImages(images) {

    images.forEach(src => {
        const img = new Image();
        img.src = src;
    });

}

document.getElementById("prevImage")?.addEventListener("click", prevImage);
document.getElementById("nextImage")?.addEventListener("click", nextImage);
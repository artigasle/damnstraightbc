/* ==========================================================================
   Storefront logic
   ========================================================================== */

let ITEMS = {};       // itemId -> item data, kept in sync live from Firestore
let ADMIN_EMAIL = ''; // pulled from config/settings
let sortMode = 'name-asc';

const grid = document.getElementById('grid');
const cartOverlay = document.getElementById('cartOverlay');
const cartDrawer = document.getElementById('cartDrawer');
const manifestBody = document.getElementById('manifestBody');
const manifestFoot = document.getElementById('manifestFoot');
const cartCountEl = document.getElementById('cartCount');

/* ---------- Live inventory ---------- */
db.collection('items').orderBy('name').onSnapshot(snap => {
  ITEMS = {};
  snap.forEach(doc => ITEMS[doc.id] = { id: doc.id, ...doc.data() });
  renderGrid();
  renderCart(); // stock labels / clamping may need a refresh
}, err => {
  console.error(err);
  grid.innerHTML = `<div class="empty-state">Couldn't load inventory. Check the Firebase config in js/firebase-config.js.</div>`;
});

db.collection('config').doc('settings').onSnapshot(doc => {
  ADMIN_EMAIL = (doc.exists && doc.data().adminEmail) || '';
});

function renderGrid() {
  const items = sortItems(Object.values(ITEMS));
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state">No merchandise posted yet. Check back soon.</div>`;
    return;
  }
  grid.innerHTML = items.map(item => {
    const stock = Number(item.stock) || 0;
    const outOfStock = stock <= 0;
    return `
    <div class="card" data-id="${item.id}">
      <div class="card-photo">
        ${item.sku ? `<span class="sku-tag">${escapeHtml(item.sku)}</span>` : ''}
        <span class="stock-tag ${stock <= 3 && !outOfStock ? 'low' : ''}" style="${outOfStock ? 'background:rgba(176,65,62,0.92)' : ''}">
          ${outOfStock ? 'Out of stock' : stock + ' in stock'}
        </span>
        ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${escapeHtml(item.name)}">` : `<span class="no-photo">No photo yet</span>`}
      </div>
      <div class="card-body">
        <h3>${escapeHtml(item.name)}</h3>
        <p class="card-desc">${escapeHtml(item.description || '')}</p>
        <div class="card-foot">
          <span class="price">${money(item.price)}</span>
          ${outOfStock
            ? `<button class="btn btn-ghost btn-sm" disabled>Sold out</button>`
            : `
            <div class="qty-stepper">
              <button type="button" data-step="-1">–</button>
              <input type="number" min="1" max="${stock}" value="1" class="qty-input">
              <button type="button" data-step="1">+</button>
            </div>`
          }
        </div>
        ${outOfStock ? '' : `<button class="btn btn-amber btn-sm add-btn">Add to manifest</button>`}
      </div>
    </div>`;
  }).join('');
}

function sortItems(items) {
  const sorted = [...items];
  switch (sortMode) {
    case 'name-desc':
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'price-asc':
      sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
      break;
    case 'price-desc':
      sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
      break;
    default: // name-asc
      sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted;
}

document.getElementById('sortSelect').addEventListener('change', (e) => {
  sortMode = e.target.value;
  renderGrid();
});
    });

grid.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const id = card.dataset.id;
  const item = ITEMS[id];

  if (e.target.matches('[data-step]')) {
    const input = card.querySelector('.qty-input');
    const step = Number(e.target.dataset.step);
    const max = Number(item.stock) || 1;
    let val = Math.min(max, Math.max(1, (Number(input.value) || 1) + step));
    input.value = val;
  }

  if (e.target.matches('.add-btn')) {
    const qty = Number(card.querySelector('.qty-input').value) || 1;
    addToCart(item, qty);
    renderCart();
    openCart();
    showToast(`Added ${qty} x ${item.name} to your manifest`);
  }
});

/* ---------- Cart drawer ---------- */
function openCart() {
  cartOverlay.classList.add('open');
  cartDrawer.classList.add('open');
}
function closeCart() {
  cartOverlay.classList.remove('open');
  cartDrawer.classList.remove('open');
}
document.getElementById('openCartBtn').addEventListener('click', openCart);
document.getElementById('closeCartBtn').addEventListener('click', closeCart);
cartOverlay.addEventListener('click', closeCart);

function renderCart() {
  const cart = getCart();
  cartCountEl.textContent = cartItemCount(cart);

  if (!cart.length) {
    manifestBody.innerHTML = `<div class="empty-cart">Your manifest is empty.<br>Add some gear to get started.</div>`;
    manifestFoot.innerHTML = '';
    return;
  }

  manifestBody.innerHTML = cart.map(line => `
    <div class="cart-line" data-id="${line.itemId}">
      ${line.imageUrl ? `<img src="${line.imageUrl}" alt="">` : `<div style="width:52px;height:52px;background:var(--paper-2);border-radius:2px;flex-shrink:0;"></div>`}
      <div class="cart-line-info">
        <h4>${escapeHtml(line.name)}</h4>
        <div class="line-meta">
          <span>${money(line.price)}</span>
          <span>×</span>
          <input type="number" min="1" class="line-qty mono" value="${line.qty}" style="width:44px;padding:2px 4px;border:1px solid var(--line);border-radius:2px;">
          <span>= ${money(line.price * line.qty)}</span>
        </div>
        <button class="cart-line-remove">Remove</button>
      </div>
    </div>
  `).join('');

  manifestFoot.innerHTML = `
    <div class="manifest-total"><span>Total</span><span class="amt">${money(cartTotal(cart))}</span></div>
    <button class="btn btn-amber" id="checkoutBtn" style="width:100%;justify-content:center;">Submit order</button>
  `;
  document.getElementById('checkoutBtn').addEventListener('click', openCheckout);
}

manifestBody.addEventListener('click', (e) => {
  if (e.target.matches('.cart-line-remove')) {
    const id = e.target.closest('.cart-line').dataset.id;
    removeFromCart(id);
    renderCart();
  }
});
manifestBody.addEventListener('change', (e) => {
  if (e.target.matches('.line-qty')) {
    const id = e.target.closest('.cart-line').dataset.id;
    updateCartQty(id, Number(e.target.value) || 1);
    renderCart();
  }
});

/* ---------- Checkout modal ---------- */
const checkoutOverlay = document.getElementById('checkoutOverlay');

function openCheckout() {
  const cart = getCart();
  if (!cart.length) return;
  document.getElementById('checkoutSummary').innerHTML = cart
    .map(l => `<div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:12.5px;padding:4px 0;">
      <span>${l.qty} × ${escapeHtml(l.name)}</span><span>${money(l.qty * l.price)}</span>
    </div>`).join('') +
    `<div style="display:flex;justify-content:space-between;font-family:var(--display);text-transform:uppercase;font-size:13px;margin-top:8px;padding-top:8px;border-top:1px solid var(--line);">
      <span>Total</span><span class="mono" style="font-weight:700;">${money(cartTotal(cart))}</span>
    </div>`;
  checkoutOverlay.classList.add('open');
}
function closeCheckout() { checkoutOverlay.classList.remove('open'); }
document.getElementById('closeCheckoutBtn').addEventListener('click', closeCheckout);
document.getElementById('cancelCheckoutBtn').addEventListener('click', closeCheckout);

document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cart = getCart();
  if (!cart.length) return;

  const submitBtn = document.getElementById('placeOrderBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  const customerName = document.getElementById('custName').value.trim();
  const customerEmail = document.getElementById('custEmail').value.trim();
  const customerNote = document.getElementById('custNote').value.trim();

  try {
    const orderRef = db.collection('orders').doc();

    // Transaction: verify + decrement stock, then create the order,
    // so two people can't both buy the last item.
    await db.runTransaction(async (tx) => {
      const itemRefs = cart.map(l => db.collection('items').doc(l.itemId));
      const itemDocs = await Promise.all(itemRefs.map(ref => tx.get(ref)));

      itemDocs.forEach((docSnap, i) => {
        const line = cart[i];
        if (!docSnap.exists) throw new Error(`${line.name} is no longer available.`);
        const stock = Number(docSnap.data().stock) || 0;
        if (stock < line.qty) throw new Error(`Only ${stock} left of ${line.name}.`);
      });

      itemDocs.forEach((docSnap, i) => {
        const line = cart[i];
        const newStock = (Number(docSnap.data().stock) || 0) - line.qty;
        tx.update(itemRefs[i], { stock: newStock });
      });

      tx.set(orderRef, {
        customerName,
        customerEmail,
        customerNote,
        items: cart.map(l => ({ itemId: l.itemId, name: l.name, price: l.price, qty: l.qty })),
        total: cartTotal(cart),
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    // Open the email to the admin with the order details.
    if (ADMIN_EMAIL) {
      const mailto = buildOrderMailto(ADMIN_EMAIL, { id: orderRef.id, customerName, customerEmail, customerNote, items: cart, total: cartTotal(cart) });
      window.location.href = mailto;
    } else {
      showToast('Order submitted — admin email isn\'t configured yet, so no email was sent.', true);
    }

    clearCart();
    renderCart();
    closeCheckout();
    closeCart();
    showConfirmation(orderRef.id);
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Could not submit order — try again.', true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Place order';
  }
});

function showConfirmation(orderId) {
  const overlay = document.getElementById('confirmOverlay');
  document.getElementById('confirmOrderId').textContent = orderId;
  overlay.classList.add('open');
}
document.getElementById('closeConfirmBtn').addEventListener('click', () => {
  document.getElementById('confirmOverlay').classList.remove('open');
});

renderCart();

/* ==========================================================================
   Shared helpers — used by both app.js (storefront) and admin.js
   ========================================================================== */

const CART_KEY = '728ams_cart_v1';

function money(n) {
  return '$' + (Number(n) || 0).toFixed(2);
}

function showToast(msg, isError) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------- Cart persistence (per-device, via localStorage) ---------- */
function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
}

function addToCart(item, qty) {
  const cart = getCart();
  const existing = cart.find(c => c.itemId === item.id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      itemId: item.id,
      name: item.name,
      price: item.price,
      imageUrl: item.imageUrl || '',
      qty: qty
    });
  }
  saveCart(cart);
  return cart;
}

function removeFromCart(itemId) {
  const cart = getCart().filter(c => c.itemId !== itemId);
  saveCart(cart);
  return cart;
}

function updateCartQty(itemId, qty) {
  const cart = getCart();
  const line = cart.find(c => c.itemId === itemId);
  if (line) line.qty = Math.max(1, qty);
  saveCart(cart);
  return cart;
}

function cartTotal(cart) {
  return cart.reduce((sum, c) => sum + c.price * c.qty, 0);
}

function cartItemCount(cart) {
  return cart.reduce((sum, c) => sum + c.qty, 0);
}

/* ---------- Image compression (client-side, so we can store images
   directly in Firestore documents without needing paid Storage) ---------- */
function compressImage(file, maxDim = 700, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- Order email (mailto) ---------- */
function buildOrderMailto(adminEmail, order) {
  const subject = `New 728 AMS Booster Club Order — ${order.customerName} (${order.id || 'pending'})`;
  const lines = [
    `New order submitted through the Damn Straight Booster Club store.`,
    ``,
    `Order ID: ${order.id || '(will be assigned)'}`,
    `Name: ${order.customerName}`,
    `Email: ${order.customerEmail}`,
    order.customerNote ? `Note: ${order.customerNote}` : null,
    ``,
    `Items:`,
    ...order.items.map(i => `  - ${i.qty} x ${i.name} @ ${money(i.price)} = ${money(i.qty * i.price)}`),
    ``,
    `Total: ${money(order.total)}`,
    ``,
    `Mark this order complete in the admin Current Orders page once it's paid and filled.`
  ].filter(Boolean);
  const body = lines.join('\n');
  return `mailto:${encodeURIComponent(adminEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

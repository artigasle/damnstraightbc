/* ==========================================================================
   Admin panel logic
   ========================================================================== */

let ITEMS = {};
let ORDERS = [];
let unsubItems = null;
let unsubOrders = null;
let pendingImageData = null; // base64 image staged in the item modal

/* ---------- Auth gate ---------- */
const gate = document.getElementById('gate');
const adminShell = document.getElementById('adminShell');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

auth.onAuthStateChanged(user => {
  if (user) {
    gate.style.display = 'none';
    adminShell.style.display = 'block';
    document.getElementById('adminEmailLabel').textContent = user.email;
    startListeners();
  } else {
    gate.style.display = 'flex';
    adminShell.style.display = 'none';
    if (unsubItems) unsubItems();
    if (unsubOrders) unsubOrders();
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.style.display = 'none';
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (err) {
    loginError.textContent = 'Sign-in failed — check the email and password.';
    loginError.style.display = 'block';
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => auth.signOut());

/* ---------- Tabs ---------- */
document.querySelectorAll('.admin-nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.panel).classList.add('active');
    if (btn.dataset.panel === 'panel-analytics') renderAnalytics();
  });
});

/* ---------- Live data ---------- */
function startListeners() {
  unsubItems = db.collection('items').orderBy('name').onSnapshot(snap => {
    ITEMS = {};
    snap.forEach(doc => ITEMS[doc.id] = { id: doc.id, ...doc.data() });
    renderInventory();
    renderAnalytics();
  });

  unsubOrders = db.collection('orders').orderBy('createdAt', 'desc').onSnapshot(snap => {
    ORDERS = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderOrders();
    renderAnalytics();
  });

  db.collection('config').doc('settings').get().then(doc => {
    if (doc.exists) document.getElementById('settingsEmail').value = doc.data().adminEmail || '';
  });
}

/* ---------- Inventory ---------- */
const invTableBody = document.querySelector('#invTable tbody');

function renderInventory() {
  const items = Object.values(ITEMS);
  if (!items.length) {
    invTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);font-family:var(--mono);">No items yet — add your first one.</td></tr>`;
    return;
  }
  invTableBody.innerHTML = items.map(item => {
    const stock = Number(item.stock) || 0;
    return `
    <tr data-id="${item.id}">
      <td>${item.imageUrl ? `<img class="thumb" src="${item.imageUrl}">` : `<div class="thumb"></div>`}</td>
      <td>${escapeHtml(item.name)}<br><span class="mono" style="font-size:11px;color:var(--ink-soft);">${escapeHtml(item.sku || '')}</span></td>
      <td class="mono">${money(item.price)}</td>
      <td class="mono">${money(item.cost)}</td>
      <td><span class="badge ${stock <= 3 ? 'badge-low' : 'badge-ok'}">${stock}</span></td>
      <td class="mono">${money((item.price - item.cost) * 1)} / unit</td>
      <td>
        <button class="btn btn-ghost btn-sm edit-item">Edit</button>
        <button class="btn btn-danger btn-sm del-item">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

invTableBody.addEventListener('click', (e) => {
  const row = e.target.closest('tr');
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.matches('.edit-item')) openItemModal(ITEMS[id]);
  if (e.target.matches('.del-item')) deleteItem(id);
});

async function deleteItem(id) {
  const item = ITEMS[id];
  if (!confirm(`Delete "${item.name}"? This can't be undone.`)) return;
  try {
    await db.collection('items').doc(id).delete();
    showToast('Item deleted');
  } catch (err) {
    showToast(err.message, true);
  }
}

/* ---------- Item modal ---------- */
const itemOverlay = document.getElementById('itemOverlay');
const itemForm = document.getElementById('itemForm');

document.getElementById('addItemBtn').addEventListener('click', () => openItemModal(null));
document.getElementById('closeItemBtn').addEventListener('click', closeItemModal);
document.getElementById('cancelItemBtn').addEventListener('click', closeItemModal);

function openItemModal(item) {
  itemForm.reset();
  pendingImageData = item ? (item.imageUrl || null) : null;
  document.getElementById('itemModalTitle').textContent = item ? 'Edit item' : 'Add item';
  document.getElementById('itemId').value = item ? item.id : '';
  document.getElementById('itemName').value = item ? item.name : '';
  document.getElementById('itemSku').value = item ? (item.sku || '') : '';
  document.getElementById('itemDesc').value = item ? (item.description || '') : '';
  document.getElementById('itemPrice').value = item ? item.price : '';
  document.getElementById('itemCost').value = item ? item.cost : '';
  document.getElementById('itemStock').value = item ? item.stock : '';
  renderImagePreview();
  itemOverlay.classList.add('open');
}
function closeItemModal() { itemOverlay.classList.remove('open'); }

function renderImagePreview() {
  const preview = document.getElementById('imgPreview');
  preview.innerHTML = pendingImageData
    ? `<img src="${pendingImageData}">`
    : `<span>No photo selected</span>`;
}

document.getElementById('itemPhoto').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    pendingImageData = await compressImage(file);
    renderImagePreview();
  } catch (err) {
    showToast('Could not process that image', true);
  }
});

itemForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('itemId').value;
  const data = {
    name: document.getElementById('itemName').value.trim(),
    sku: document.getElementById('itemSku').value.trim(),
    description: document.getElementById('itemDesc').value.trim(),
    price: Number(document.getElementById('itemPrice').value) || 0,
    cost: Number(document.getElementById('itemCost').value) || 0,
    stock: Number(document.getElementById('itemStock').value) || 0,
    imageUrl: pendingImageData || ''
  };
  const saveBtn = document.getElementById('saveItemBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  try {
    if (id) {
      await db.collection('items').doc(id).update(data);
      showToast('Item updated');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('items').add(data);
      showToast('Item added');
    }
    closeItemModal();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save item';
  }
});

/* ---------- Orders ---------- */
const ordersTableBody = document.querySelector('#ordersTable tbody');
let orderFilter = 'all';

document.querySelectorAll('.order-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.order-filter').forEach(b => b.classList.remove('btn-navy'));
    document.querySelectorAll('.order-filter').forEach(b => b.classList.add('btn-ghost'));
    btn.classList.remove('btn-ghost');
    btn.classList.add('btn-navy');
    orderFilter = btn.dataset.filter;
    renderOrders();
  });
});

function renderOrders() {
  const filtered = orderFilter === 'all' ? ORDERS : ORDERS.filter(o => o.status === orderFilter);
  if (!filtered.length) {
    ordersTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);font-family:var(--mono);">No orders here.</td></tr>`;
    return;
  }
  ordersTableBody.innerHTML = filtered.map(o => `
    <tr data-id="${o.id}">
      <td class="mono" style="font-size:11.5px;">${o.id.slice(0, 8)}</td>
      <td class="mono" style="font-size:11.5px;">${fmtDate(o.createdAt)}</td>
      <td>${escapeHtml(o.customerName)}<br><span class="mono" style="font-size:11px;color:var(--ink-soft);">${escapeHtml(o.customerEmail)}</span></td>
      <td class="mono">${(o.items || []).reduce((s, i) => s + i.qty, 0)} items</td>
      <td class="mono">${money(o.total)}</td>
      <td><span class="badge ${o.status === 'completed' ? 'badge-completed' : 'badge-pending'}">${o.status}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm view-order">View</button>
        ${o.status !== 'completed' ? `<button class="btn btn-amber btn-sm complete-order">Mark complete</button>` : ''}
      </td>
    </tr>
  `).join('');
}

ordersTableBody.addEventListener('click', async (e) => {
  const row = e.target.closest('tr');
  if (!row) return;
  const order = ORDERS.find(o => o.id === row.dataset.id);
  if (e.target.matches('.view-order')) openOrderModal(order);
  if (e.target.matches('.complete-order')) {
    try {
      await db.collection('orders').doc(order.id).update({
        status: 'completed',
        completedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showToast('Order marked complete');
    } catch (err) {
      showToast(err.message, true);
    }
  }
});

function openOrderModal(order) {
  const overlay = document.getElementById('orderOverlay');
  document.getElementById('orderModalTitle').textContent = `Order ${order.id.slice(0, 8)}`;
  document.getElementById('orderModalBody').innerHTML = `
    <div class="field"><label>Customer</label><div>${escapeHtml(order.customerName)} — ${escapeHtml(order.customerEmail)}</div></div>
    ${order.customerNote ? `<div class="field"><label>Note</label><div>${escapeHtml(order.customerNote)}</div></div>` : ''}
    <div class="field"><label>Placed</label><div class="mono">${fmtDate(order.createdAt)}</div></div>
    <div class="field"><label>Status</label><div><span class="badge ${order.status === 'completed' ? 'badge-completed' : 'badge-pending'}">${order.status}</span></div></div>
    <div class="field">
      <label>Items</label>
      ${(order.items || []).map(i => `
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px dashed var(--line);">
          <span>${i.qty} × ${escapeHtml(i.name)}</span><span class="mono">${money(i.qty * i.price)}</span>
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;font-family:var(--display);text-transform:uppercase;font-size:13px;margin-top:8px;">
        <span>Total</span><span class="mono" style="font-weight:700;">${money(order.total)}</span>
      </div>
    </div>
  `;
  overlay.classList.add('open');
}
document.getElementById('closeOrderBtn').addEventListener('click', () => {
  document.getElementById('orderOverlay').classList.remove('open');
});

/* ---------- Analytics ---------- */
let analyticsFilter = 'completed';
document.querySelectorAll('.analytics-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.analytics-filter').forEach(b => { b.classList.remove('btn-navy'); b.classList.add('btn-ghost'); });
    btn.classList.remove('btn-ghost');
    btn.classList.add('btn-navy');
    analyticsFilter = btn.dataset.filter;
    renderAnalytics();
  });
});

function renderAnalytics() {
  const panel = document.getElementById('panel-analytics');
  if (!panel.classList.contains('active')) return;

  const orders = analyticsFilter === 'all' ? ORDERS : ORDERS.filter(o => o.status === 'completed');

  let revenue = 0, cost = 0, itemsSold = 0;
  const byItem = {}; // name -> { qty, revenue, cost }

  orders.forEach(o => {
    (o.items || []).forEach(line => {
      revenue += line.qty * line.price;
      itemsSold += line.qty;
      const itemCost = ITEMS[line.itemId] ? Number(ITEMS[line.itemId].cost) || 0 : 0;
      cost += itemCost * line.qty;
      if (!byItem[line.name]) byItem[line.name] = { qty: 0, revenue: 0, cost: 0 };
      byItem[line.name].qty += line.qty;
      byItem[line.name].revenue += line.qty * line.price;
      byItem[line.name].cost += itemCost * line.qty;
    });
  });

  const profit = revenue - cost;

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><p class="label">Orders</p><p class="value">${orders.length}</p><p class="sub">${analyticsFilter === 'all' ? 'all statuses' : 'completed only'}</p></div>
    <div class="stat-card"><p class="label">Items sold</p><p class="value">${itemsSold}</p></div>
    <div class="stat-card"><p class="label">Revenue</p><p class="value">${money(revenue)}</p></div>
    <div class="stat-card"><p class="label">Cost of goods</p><p class="value">${money(cost)}</p></div>
    <div class="stat-card"><p class="label">Profit</p><p class="value">${money(profit)}</p><p class="sub">${revenue ? ((profit / revenue) * 100).toFixed(0) : 0}% margin</p></div>
  `;

  const rows = Object.entries(byItem).sort((a, b) => b[1].revenue - a[1].revenue);
  const tbody = document.querySelector('#breakdownTable tbody');
  tbody.innerHTML = rows.length ? rows.map(([name, d]) => `
    <tr>
      <td>${escapeHtml(name)}</td>
      <td>${d.qty}</td>
      <td>${money(d.revenue)}</td>
      <td>${money(d.cost)}</td>
      <td>${money(d.revenue - d.cost)}</td>
    </tr>
  `).join('') : `<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);">No sales in this range yet.</td></tr>`;
}

/* ---------- Settings ---------- */
document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('settingsEmail').value.trim();
  try {
    await db.collection('config').doc('settings').set({ adminEmail: email }, { merge: true });
    showToast('Settings saved');
  } catch (err) {
    showToast(err.message, true);
  }
});

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail, 
  updateProfile, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAHaToGc7F2vlQt6bDXRMMHjnqRf4OANfc",
  authDomain: "tlucifer-auth.firebaseapp.com",
  databaseURL: "https://tlucifer-auth-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tlucifer-auth",
  storageBucket: "tlucifer-auth.firebasestorage.app",
  messagingSenderId: "249663219994",
  appId: "1:249663219994:web:69a395dee4ad4331e864a3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Same origin: the Express server that serves this page also serves /api/*
const BACKEND_URL = "";

// State Management
let tempUserData = { mode: '', name: '', email: '', pass: '' };
let currentUser = null;
let currentSalesType = 'Income';
let currentSalesCategory = 'Rooms';

let activeSalesPeriod = 'daily';
let activeStockPeriod = 'daily';
let salesData = [];
let stockData = [];

// Helper function to safely update text content
const setElementText = (id, text) => {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
};


// ---------------------------------------------------------------------------
// Login page background (hero-car.jpg) - injected so no CSS file edit is needed
// ---------------------------------------------------------------------------
(() => {
  const style = document.createElement('style');
  style.textContent = `
    body.auth-mode {
      background-color: #000;
      background-image: linear-gradient(90deg, rgba(0,0,0,0) 55%, rgba(0,0,0,.55) 100%), url('/images/hero-car.jpg');
      background-repeat: no-repeat;
      background-position: left center;
      background-size: auto, contain;
      min-height: 100vh;
    }
    @media (max-width: 900px) {
      body.auth-mode { background-position: center 12%; background-size: auto, 100% auto; }
    }
    .bk-table { width:100%; border-collapse:collapse; }
    .bk-table th, .bk-table td { padding:10px 12px; text-align:left; border-bottom:1px solid rgba(128,128,128,.25); vertical-align:top; }
    .bk-table select { padding:4px 6px; border-radius:6px; }
    .bk-empty { padding:24px; opacity:.7; }
  `;
  document.head.appendChild(style);
})();

// ---------------------------------------------------------------------------
// Bookings panel (bookings sent from the LankaRides website)
// ---------------------------------------------------------------------------
(() => {
  const nav = document.querySelector('.sidebar-nav');
  const anchor = document.getElementById('panel-overview');
  if (!nav || !anchor) return;

  // Sidebar item: clone an existing one so it matches the current styling
  const template = nav.querySelector('.nav-item');
  if (template) {
    const item = template.cloneNode(true);
    item.classList.remove('active');
    item.setAttribute('data-panel', 'bookings');
    item.textContent = 'Bookings';
    nav.appendChild(item);
  }

  // Panel
  const panel = document.createElement('div');
  panel.id = 'panel-bookings';
  panel.className = 'panel-content hidden';
  panel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <h3 style="margin:0;">Website Bookings</h3>
      <button id="btn-refresh-bookings" type="button">Refresh</button>
    </div>
    <div style="overflow-x:auto;"><table class="bk-table">
      <thead><tr><th>ID</th><th>Customer</th><th>Trip</th><th>When</th><th>Pax</th><th>Status</th></tr></thead>
      <tbody id="bookings-table-body"></tbody>
    </table></div>
    <div id="bookings-empty" class="bk-empty hidden">No bookings yet.</div>`;
  anchor.parentElement.appendChild(panel);
})();

// Initial Calendar Values
const todayStr = new Date().toISOString().split('T')[0];
const sCal = document.getElementById('sales-calendar-filter');
const stCal = document.getElementById('stock-calendar-filter');
if (sCal) sCal.value = todayStr;
if (stCal) stCal.value = todayStr;

// Navigation Switcher
const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
const panels = document.querySelectorAll('.panel-content');
navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');

    const panelKey = item.getAttribute('data-panel');
    const panelName = item.innerText.trim();

    setElementText('page-title', panelName);
    setElementText('page-subtitle', `Manage ${panelName} operations`);

    panels.forEach(p => p.classList.add('hidden'));

    let targetPanel;
    if (panelKey === 'overview') {
      targetPanel = document.getElementById('panel-overview');
    } else if (panelKey === 'sales') {
      targetPanel = document.getElementById('panel-sales');
    } else if (panelKey === 'stock') {
      targetPanel = document.getElementById('panel-stock');
    } else if (panelKey === 'bookings') {
      targetPanel = document.getElementById('panel-bookings');
      setElementText('page-subtitle', 'Bookings received from the website');
      loadBookings();
    } else {
      setElementText('generic-title', panelName);
      targetPanel = document.getElementById('panel-generic');
    }

    if (targetPanel) {
      targetPanel.classList.remove('hidden');
      targetPanel.style.animation = 'none';
      targetPanel.offsetHeight; // Force reflow for animation restart
      targetPanel.style.animation = null;
    }
  });
});

// Theme Toggle Handler
const themeBtn = document.getElementById('theme-toggle');
themeBtn?.addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  if (currentTheme === 'light') {
    document.documentElement.removeAttribute('data-theme');
    themeBtn.innerText = '☀️';
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    themeBtn.innerText = '🌙';
  }
});

// Income / Cost Toggle
const incomeBtn = document.getElementById('tab-sales-income');
const costBtn = document.getElementById('tab-sales-cost');
incomeBtn?.addEventListener('click', () => {
  incomeBtn.classList.add('active');
  costBtn?.classList.remove('active');
  currentSalesType = 'Income';
});
costBtn?.addEventListener('click', () => {
  costBtn.classList.add('active');
  incomeBtn?.classList.remove('active');
  currentSalesType = 'Cost';
});

// Sub-Category Selection Handlers
const subTabs = document.querySelectorAll('.sub-tab');
subTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    subTabs.forEach(st => st.classList.remove('active'));
    tab.classList.add('active');
    currentSalesCategory = tab.getAttribute('data-sub') || 'Rooms';
    setElementText('sales-form-title', `Add ${currentSalesCategory} Bill`);
  });
});

// Add Sales Bill Handler
document.getElementById('btn-add-bill')?.addEventListener('click', () => {
  const codeInput = document.getElementById('bill-code');
  const nameInput = document.getElementById('bill-name');
  const priceInput = document.getElementById('bill-price');

  const code = codeInput?.value.trim() || 'AUTO-' + Math.floor(Math.random() * 1000);
  const name = nameInput?.value.trim();
  const price = priceInput?.value.trim();

  if (!name || !price) {
    alert('Please enter Name and Price.');
    return;
  }

  const newItem = {
    code,
    name,
    price: parseFloat(price),
    category: currentSalesCategory,
    type: currentSalesType,
    timestamp: new Date().toISOString()
  };

  salesData.push(newItem);

  const tbody = document.getElementById('sales-table-body');
  if (tbody) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${newItem.code}</td>
      <td>${newItem.name}</td>
      <td>${newItem.price.toFixed(2)}</td>
      <td>${newItem.category}</td>
      <td>${newItem.type}</td>
      <td><button style="color:#ef4444; background:none; border:none; cursor:pointer;" class="btn-delete-row">Delete</button></td>
    `;
    
    tr.querySelector('.btn-delete-row')?.addEventListener('click', () => {
      const idx = salesData.indexOf(newItem);
      if (idx > -1) salesData.splice(idx, 1);
      tr.remove();
      updateSalesReport();
    });

    tbody.appendChild(tr);
  }

  if (codeInput) codeInput.value = '';
  if (nameInput) nameInput.value = '';
  if (priceInput) priceInput.value = '';

  updateSalesReport();
});

// Custom Stock Modal Event Handlers
const addStockModal = document.getElementById('add-stock-modal');
const stockNameInput = document.getElementById('modal-stock-name');
const stockPriceInput = document.getElementById('modal-stock-price');

document.getElementById('btn-open-stock-modal')?.addEventListener('click', () => {
  if (stockNameInput) stockNameInput.value = '';
  if (stockPriceInput) stockPriceInput.value = '';
  addStockModal?.classList.remove('hidden');
});

document.getElementById('btn-cancel-stock-modal')?.addEventListener('click', () => {
  addStockModal?.classList.add('hidden');
});

document.getElementById('btn-save-stock-modal')?.addEventListener('click', () => {
  const name = stockNameInput?.value.trim();
  const priceStr = stockPriceInput?.value.trim();

  if (!name || !priceStr) {
    alert("Please enter both Product Name and Price.");
    return;
  }

  const newItem = {
    code: 'STK-' + Math.floor(Math.random() * 1000),
    name,
    price: parseFloat(priceStr),
    timestamp: new Date().toISOString()
  };

  stockData.push(newItem);

  const tbody = document.getElementById('stock-table-body');
  if (tbody) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${newItem.code}</td>
      <td>${newItem.name}</td>
      <td>Rs. ${newItem.price.toFixed(2)}</td>
      <td><button style="color:#ef4444; background:none; border:none; cursor:pointer;" class="btn-delete-row">Delete</button></td>
    `;

    tr.querySelector('.btn-delete-row')?.addEventListener('click', () => {
      const idx = stockData.indexOf(newItem);
      if (idx > -1) stockData.splice(idx, 1);
      tr.remove();
      updateStockReport();
    });

    tbody.appendChild(tr);
  }

  updateStockReport();
  addStockModal?.classList.add('hidden');
});

// Report Modals & Calculations
const salesReportModal = document.getElementById('sales-report-modal');
const stockReportModal = document.getElementById('stock-report-modal');
const metricDetailsModal = document.getElementById('metric-details-modal');

document.getElementById('btn-open-sales-report')?.addEventListener('click', () => {
  salesReportModal?.classList.remove('hidden');
  updateSalesReport();
});

document.getElementById('btn-close-sales-report')?.addEventListener('click', () => {
  salesReportModal?.classList.add('hidden');
});

document.getElementById('btn-open-stock-report')?.addEventListener('click', () => {
  stockReportModal?.classList.remove('hidden');
  updateStockReport();
});

document.getElementById('btn-close-stock-report')?.addEventListener('click', () => {
  stockReportModal?.classList.add('hidden');
});

document.getElementById('btn-close-metric-details')?.addEventListener('click', () => {
  metricDetailsModal?.classList.add('hidden');
});

const salesCalendarFilter = document.getElementById('sales-calendar-filter');
const stockCalendarFilter = document.getElementById('stock-calendar-filter');

salesCalendarFilter?.addEventListener('change', () => updateSalesReport());

document.querySelectorAll('.sales-report-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    document.querySelectorAll('.sales-report-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    activeSalesPeriod = e.target.getAttribute('data-period') || 'daily';
    updateSalesReport();
  });
});

stockCalendarFilter?.addEventListener('change', () => updateStockReport());

document.querySelectorAll('.stock-report-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    document.querySelectorAll('.stock-report-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    activeStockPeriod = e.target.getAttribute('data-period') || 'daily';
    updateStockReport();
  });
});

// Filter helper fixing month/year comparisons
function matchesPeriodFilter(itemDateStr, targetDateStr, period) {
  if (!itemDateStr || !targetDateStr) return true;
  const itemDate = new Date(itemDateStr);
  const targetDate = new Date(targetDateStr);

  if (period === 'daily') {
    return itemDate.toISOString().split('T')[0] === targetDateStr;
  } else if (period === 'monthly') {
    return (
      itemDate.getFullYear() === targetDate.getFullYear() &&
      itemDate.getMonth() === targetDate.getMonth()
    );
  } else if (period === 'yearly') {
    return itemDate.getFullYear() === targetDate.getFullYear();
  }
  return true;
}

function updateSalesReport() {
  const selectedDate = salesCalendarFilter?.value;
  const filteredSales = salesData.filter(item =>
    matchesPeriodFilter(item.timestamp || item.date, selectedDate, activeSalesPeriod)
  );

  let totalIncome = 0;
  let totalCost = 0;
  let roomsTotal = 0;
  let foodTotal = 0;
  let functionTotal = 0;
  let stockCostTotal = 0;

  filteredSales.forEach(item => {
    const price = parseFloat(item.price) || 0;
    if (item.type === 'Income') {
      totalIncome += price;
      if (item.category === 'Rooms') roomsTotal += price;
      if (item.category === 'Food') foodTotal += price;
      if (item.category === 'Function') functionTotal += price;
    } else if (item.type === 'Cost') {
      totalCost += price;
      if (item.category === 'Stock') stockCostTotal += price;
    }
  });

  const netProfit = totalIncome - totalCost;
  const netLoss = netProfit < 0 ? Math.abs(netProfit) : 0;

  setElementText('sr-total-revenue', `Rs. ${totalIncome.toFixed(2)}`);
  setElementText('sr-total-cost', `Rs. ${totalCost.toFixed(2)}`);
  setElementText('sr-net-profit', `Rs. ${Math.max(0, netProfit).toFixed(2)}`);
  setElementText('sr-net-loss', `Rs. ${netLoss.toFixed(2)}`);

  setElementText('sr-cat-rooms', `Rs. ${roomsTotal.toFixed(2)}`);
  setElementText('sr-cat-food', `Rs. ${foodTotal.toFixed(2)}`);
  setElementText('sr-cat-function', `Rs. ${functionTotal.toFixed(2)}`);
  setElementText('sr-cat-stock', `Rs. ${stockCostTotal.toFixed(2)}`);

  setElementText('report-total-income', `Rs. ${totalIncome.toFixed(2)}`);
  setElementText('report-total-cost', `Rs. ${totalCost.toFixed(2)}`);
  setElementText('report-net-profit', `Rs. ${Math.max(0, netProfit).toFixed(2)}`);
  setElementText('report-net-loss', `Rs. ${netLoss.toFixed(2)}`);
}

function updateStockReport() {
  const selectedDate = stockCalendarFilter?.value;
  const filteredStock = stockData.filter(item =>
    matchesPeriodFilter(item.timestamp || item.date, selectedDate, activeStockPeriod)
  );

  let totalVal = 0;
  const tbody = document.getElementById('stock-report-table-body');
  if (tbody) tbody.innerHTML = '';

  filteredStock.forEach(item => {
    const price = parseFloat(item.price) || 0;
    totalVal += price;

    if (tbody) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${item.code || '-'}</td>
        <td>${item.name || '-'}</td>
        <td>Rs. ${price.toFixed(2)}</td>
      `;
      tbody.appendChild(row);
    }
  });

  const count = filteredStock.length;
  const avgPrice = count > 0 ? totalVal / count : 0;

  setElementText('st-total-val', `Rs. ${totalVal.toFixed(2)}`);
  setElementText('st-table-total-val', `Rs. ${totalVal.toFixed(2)}`);
  setElementText('st-total-count', count.toString());
  setElementText('st-avg-price', `Rs. ${avgPrice.toFixed(2)}`);
}

// Global scope binding for inline onclick attributes
window.openMetricDetails = function(title, categoryFilter) {
  const modal = document.getElementById('metric-details-modal');
  const tbody = document.getElementById('metric-details-tbody');

  setElementText('metric-details-title', `${title} Details`);

  if (tbody) tbody.innerHTML = '';
  let sum = 0;

  const filtered = salesData.filter(item => item.category === categoryFilter);
  filtered.forEach(item => {
    const price = parseFloat(item.price) || 0;
    sum += price;

    if (tbody) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${item.code || '-'}</td>
        <td>${item.name || '-'}</td>
        <td>${item.category || '-'}</td>
        <td>${item.type || '-'}</td>
        <td>Rs. ${price.toFixed(2)}</td>
      `;
      tbody.appendChild(row);
    }
  });

  setElementText('metric-details-total', `Rs. ${sum.toFixed(2)}`);
  modal?.classList.remove('hidden');
};

// Authentication Views Navigation
const views = {
  signin: document.getElementById('signin-view'),
  signup: document.getElementById('signup-view'),
  otp: document.getElementById('otp-view'),
  forgot: document.getElementById('forgot-view'),
  dashboard: document.getElementById('dashboard-view')
};

function showView(viewName) {
  Object.keys(views).forEach(key => views[key]?.classList.add('hidden'));
  const currentView = views[viewName];
  
  if (currentView) {
    currentView.classList.remove('hidden');
    currentView.style.animation = 'none';
    currentView.offsetHeight; // Force reflow for entrance animation
    currentView.style.animation = null;
  }

  const navbar = document.getElementById('main-top-navbar');
  const authContainer = document.getElementById('auth-main-container');

  if (viewName === 'dashboard') {
    navbar?.classList.add('hidden');
    authContainer?.classList.add('hidden');
    document.body.classList.remove('auth-mode');
  } else {
    navbar?.classList.remove('hidden');
    authContainer?.classList.remove('hidden');
    document.body.classList.add('auth-mode');
  }
}

document.getElementById('btn-to-signup')?.addEventListener('click', () => showView('signup'));
document.getElementById('btn-to-signin')?.addEventListener('click', () => showView('signin'));
document.getElementById('top-nav-signup')?.addEventListener('click', () => showView('signup'));
document.getElementById('top-nav-register')?.addEventListener('click', () => showView('signup'));
document.getElementById('btn-forgot-to-signin')?.addEventListener('click', () => showView('signin'));

// Power Button safely logs out user without abrupt reloading
document.getElementById('btn-power')?.addEventListener('click', async () => {
  try {
    await signOut(auth);
    showView('signin');
  } catch (err) {
    showView('signin');
  }
});

// Sign Up Flow
document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('signup-name')?.value;
  const email = document.getElementById('signup-email')?.value;
  const pass = document.getElementById('signup-pass')?.value;

  tempUserData = { mode: 'signup', name, email, pass };

  try {
    const res = await fetch(`${BACKEND_URL}/api/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.message || 'Failed to send OTP email.');
    }

    alert(`Verification OTP sent to ${email}. Please check your inbox.`);
    showView('otp');
  } catch (err) {
    alert("Error: " + err.message);
  }
});

// Verify OTP
document.getElementById('otp-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const enteredOtp = document.getElementById('otp-input')?.value;

  try {
    const res = await fetch(`${BACKEND_URL}/api/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: tempUserData.email, otp: enteredOtp })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      if (tempUserData.mode === 'signup') {
        const userCred = await createUserWithEmailAndPassword(auth, tempUserData.email, tempUserData.pass);
        await updateProfile(userCred.user, { displayName: tempUserData.name });
        alert("Account created and verified successfully!");
      } else if (tempUserData.mode === 'forgot') {
        alert("OTP verified! Redirecting to sign in...");
        showView('signin');
      }
    } else {
      alert(data.message || "Invalid OTP code.");
    }
  } catch (err) {
    alert("Verification error: " + err.message);
  }
});

// Sign In
document.getElementById('signin-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('signin-email')?.value;
  const pass = document.getElementById('signin-pass')?.value;

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    alert("Authentication failed: " + err.message);
  }
});

// Forgot Password
document.getElementById('forgot-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('forgot-email')?.value;
  try {
    await sendPasswordResetEmail(auth, email);
    alert("Password reset email sent! Check your inbox.");
    showView('signin');
  } catch (err) {
    alert("Error sending reset email: " + err.message);
  }
});

// Logout
document.getElementById('btn-logout')?.addEventListener('click', () => {
  signOut(auth);
});


// ---------------------------------------------------------------------------
// Bookings: load + update status (staff only, verified by Firebase ID token)
// ---------------------------------------------------------------------------
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

async function loadBookings() {
  const tbody = document.getElementById('bookings-table-body');
  const empty = document.getElementById('bookings-empty');
  if (!tbody || !auth.currentUser) return;

  try {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch(`${BACKEND_URL}/api/bookings`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load bookings.');

    tbody.innerHTML = '';
    empty?.classList.toggle('hidden', data.bookings.length > 0);

    data.bookings.forEach(b => {
      const tr = document.createElement('tr');
      // All values come from a public form, so everything is escaped.
      tr.innerHTML = `
        <td>${escapeHtml(b.id)}<br><small>${escapeHtml(new Date(b.createdAt).toLocaleString())}</small></td>
        <td>${escapeHtml(b.name)}<br><small>${escapeHtml(b.email)}<br>${escapeHtml(b.phone)}<br>${escapeHtml(b.nationality)}</small></td>
        <td>${escapeHtml(b.pickup)} &rarr; ${escapeHtml(b.dropoff)}${b.requests ? `<br><small>${escapeHtml(b.requests)}</small>` : ''}</td>
        <td>${escapeHtml(b.date)} ${escapeHtml(b.time)}</td>
        <td>${escapeHtml(b.passengers)}</td>
        <td><select data-id="${escapeHtml(b.id)}">
          ${['New', 'Confirmed', 'Completed', 'Cancelled'].map(s =>
            `<option value="${s}" ${s === b.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select></td>`;
      tr.querySelector('select').addEventListener('change', async (e) => {
        try {
          const t = await auth.currentUser.getIdToken();
          const r = await fetch(`${BACKEND_URL}/api/bookings/${encodeURIComponent(b.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
            body: JSON.stringify({ status: e.target.value })
          });
          if (!r.ok) throw new Error('Update failed.');
        } catch (err) {
          alert(err.message);
          loadBookings();
        }
      });
      tbody.appendChild(tr);
    });
  } catch (err) {
    alert('Bookings error: ' + err.message);
  }
}

document.getElementById('btn-refresh-bookings')?.addEventListener('click', loadBookings);

// Firebase Auth State Observer
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    setElementText('user-display-name', user.displayName || user.email.split('@')[0]);
    showView('dashboard');
  } else {
    currentUser = null;
    showView('signin');
  }
});
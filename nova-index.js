/* ══════════════════════════════════════════════════
   NOVA FAN PORTAL  —  index.js
   ══════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────
   1. CURRENCY ENGINE
   All base prices are stored in USD.
   Rates are approximate and can be swapped
   for a live API call (e.g. CoinGecko, ECB).
───────────────────────────────────────── */

const CURRENCIES = {
  USD: { symbol: '$',  code: 'USD', rate: 1,          decimals: 2, btc: false },
  GBP: { symbol: '£',  code: 'GBP', rate: 0.79,       decimals: 2, btc: false },
  EUR: { symbol: '€',  code: 'EUR', rate: 0.93,       decimals: 2, btc: false },
  BTC: { symbol: '₿',  code: 'BTC', rate: 0.0000154,  decimals: 8, btc: true  },
};

let activeCurrency = 'USD';

/**
 * Convert a USD base amount to the active currency.
 * @param {number} usdAmount
 * @returns {string}  formatted string e.g. "£24.00" or "₿0.00036960"
 */
function convertPrice(usdAmount) {
  const cur = CURRENCIES[activeCurrency];
  const converted = usdAmount * cur.rate;
  if (cur.btc) {
    return cur.symbol + converted.toFixed(cur.decimals);
  }
  return cur.symbol + converted.toLocaleString('en-US', {
    minimumFractionDigits: cur.decimals,
    maximumFractionDigits: cur.decimals,
  });
}

/**
 * Format a fee amount (small fixed fee in USD).
 * @param {number} usdFee
 */
function fmtFee(usdFee) {
  return convertPrice(usdFee);
}

/**
 * Re-render every element with [data-base] attribute
 * and every .price-display inside a [data-base] container.
 */
function refreshAllPrices() {
  // Service card prices  — e.g. <p data-base="30">From <span class="price-display">…</span> / seat</p>
  document.querySelectorAll('[data-base] .price-display').forEach(el => {
    const base = parseFloat(el.closest('[data-base]').dataset.base);
    el.textContent = convertPrice(base);
  });

  // Fan card tier prices in the section
  document.querySelectorAll('.tier-price[data-base]').forEach(el => {
    const base = parseFloat(el.dataset.base);
    // preserve "/ yr" text
    const span = el.querySelector('.price-display');
    if (span) span.textContent = convertPrice(base);
  });

  // Update select option labels for fan card modal
  const fcTier = document.getElementById('fc-tier');
  if (fcTier) {
    fcTier.querySelectorAll('option').forEach(opt => {
      const price = parseFloat(opt.dataset.price);
      const tier  = opt.value.charAt(0) + opt.value.slice(1).toLowerCase();
      opt.textContent = `${tier} Fan — ${convertPrice(price)}/year`;
    });
  }

  // Update tickets event select
  const tEvent = document.getElementById('t-event');
  if (tEvent) {
    const labels = [
      [30, 'Nightfall Tour — Lagos'],
      [25, 'Echoes Film Premiere — Abuja'],
      [150,'Meet & Greet Session'],
      [35, 'Nightfall Tour — Accra'],
      [20, 'Nova LIVE TV Taping'],
    ];
    tEvent.querySelectorAll('option').forEach((opt, i) => {
      if (labels[i]) opt.textContent = `${labels[i][1]} (${convertPrice(labels[i][0])}/seat)`;
    });
  }

  // Recompute all live totals
  computeTicketTotal();
  computeMeetGreetTotal();
  computeFanCardTotal();
  computeVipTotal();

  // Show/hide bitcoin panels based on active currency
  toggleBtcPanels();
}

function toggleBtcPanels() {
  const isBtc = activeCurrency === 'BTC';
  document.querySelectorAll('.btc-panel').forEach(p => {
    p.style.display = isBtc ? 'block' : 'none';
  });
  document.querySelectorAll('.card-panel').forEach(p => {
    p.style.display = isBtc ? 'none' : 'block';
  });
}


/* ─────────────────────────────────────────
   2. CURRENCY SWITCHER TABS
───────────────────────────────────────── */
function initCurrencyTabs() {
  document.getElementById('currencyTabs').addEventListener('click', e => {
    const btn = e.target.closest('.cur-tab');
    if (!btn) return;
    document.querySelectorAll('.cur-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCurrency = btn.dataset.cur;
    refreshAllPrices();
  });
}


/* ─────────────────────────────────────────
   3. MODAL SYSTEM
───────────────────────────────────────── */
function openModal(type) {
  const overlay = document.getElementById('modal-' + type);
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  refreshAllPrices();   // ensure prices correct for current currency
}

function closeModal(type) {
  const overlay = document.getElementById('modal-' + type);
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';

  // Reset form/success state
  const formEl    = document.getElementById(type + 'Form');
  const successEl = document.getElementById(type + '-success');
  if (formEl)    { formEl.style.display = ''; }
  if (successEl) { successEl.classList.remove('show'); }
}

function initModalTriggers() {
  // Open — any [data-modal] button
  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-modal]');
    if (trigger) { openModal(trigger.dataset.modal); return; }

    // Close — any [data-close] button
    const closer = e.target.closest('[data-close]');
    if (closer) { closeModal(closer.dataset.close); return; }

    // Close — click on overlay background
    const overlay = e.target.closest('.modal-overlay');
    if (overlay && e.target === overlay) {
      const id = overlay.dataset.modalId;
      if (id) closeModal(id);
    }
  });

  // Nav smooth scroll
  document.querySelectorAll('[data-scroll]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.scroll);
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const id = link.getAttribute('href').replace('#', '');
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });
}


/* ─────────────────────────────────────────
   4. PAYMENT METHOD TABS
───────────────────────────────────────── */
function initPaymentTabs() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.pay-method');
    if (!btn) return;
    const group = btn.closest('.payment-methods');
    group.querySelectorAll('.pay-method').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
}


/* ─────────────────────────────────────────
   5. TIME SLOT PICKER
───────────────────────────────────────── */
function initTimeSlots() {
  document.addEventListener('click', e => {
    const slot = e.target.closest('.time-slot');
    if (!slot || slot.classList.contains('booked')) return;
    slot.closest('.slot-grid').querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
    slot.classList.add('selected');
  });
}


/* ─────────────────────────────────────────
   6. CARD NUMBER FORMATTER
───────────────────────────────────────── */
function initCardFormatting() {
  document.addEventListener('input', e => {
    if (!e.target.classList.contains('card-num')) return;
    const input = e.target;
    let v = input.value.replace(/\D/g, '').replace(/(.{4})/g, '$1  ').trim();
    input.value = v.substring(0, 19);
  });
}


/* ─────────────────────────────────────────
   7. TICKET TOTAL CALCULATOR
───────────────────────────────────────── */
const TICKET_EVENT_PRICES_USD = [30, 25, 150, 35, 20];
const TICKET_FEE_USD = 1;

function computeTicketTotal() {
  const eventSel = document.getElementById('t-event');
  const qtyInput = document.getElementById('t-qty');
  if (!eventSel || !qtyInput) return;

  const idx      = eventSel.selectedIndex;
  const usdPrice = TICKET_EVENT_PRICES_USD[idx] || 30;
  const qty      = parseInt(qtyInput.value) || 1;

  const unitEl   = document.getElementById('t-unit');
  const qtyDisp  = document.getElementById('t-qty-display');
  const feeEl    = document.getElementById('t-fee');
  const totalEl  = document.getElementById('t-total');

  if (unitEl)  unitEl.textContent  = convertPrice(usdPrice);
  if (qtyDisp) qtyDisp.textContent = '× ' + qty;
  if (feeEl)   feeEl.textContent   = fmtFee(TICKET_FEE_USD);
  if (totalEl) totalEl.textContent = convertPrice(usdPrice * qty + TICKET_FEE_USD);
}

function initTicketModal() {
  const minus = document.getElementById('t-minus');
  const plus  = document.getElementById('t-plus');
  const event = document.getElementById('t-event');

  if (minus) minus.addEventListener('click', () => changeTicketQty(-1));
  if (plus)  plus.addEventListener('click',  () => changeTicketQty(1));
  if (event) event.addEventListener('change', computeTicketTotal);
}

function changeTicketQty(delta) {
  const el = document.getElementById('t-qty');
  if (!el) return;
  let q = parseInt(el.value) + delta;
  q = Math.min(Math.max(q, 1), 10);
  el.value = q;
  computeTicketTotal();
}


/* ─────────────────────────────────────────
   8. MEET & GREET TOTAL
───────────────────────────────────────── */
const MG_PRICE_USD = 150;
const MG_FEE_USD   = 2;

function computeMeetGreetTotal() {
  const baseEl  = document.getElementById('mg-base');
  const feeEl   = document.getElementById('mg-fee');
  const totalEl = document.getElementById('mg-total');

  if (baseEl)  baseEl.textContent  = convertPrice(MG_PRICE_USD);
  if (feeEl)   feeEl.textContent   = fmtFee(MG_FEE_USD);
  if (totalEl) totalEl.textContent = convertPrice(MG_PRICE_USD + MG_FEE_USD);
}


/* ─────────────────────────────────────────
   9. FAN CARD TOTAL + LIVE PREVIEW
───────────────────────────────────────── */
const FC_TIERS_USD = { SILVER: 10, GOLD: 24, PLATINUM: 50 };
const FC_DELIVERY_USD = 1;

function computeFanCardTotal() {
  const tierSel = document.getElementById('fc-tier');
  if (!tierSel) return;

  const tier    = tierSel.value;
  const price   = FC_TIERS_USD[tier] || 10;
  const baseEl  = document.getElementById('fc-base');
  const delEl   = document.getElementById('fc-delivery');
  const totalEl = document.getElementById('fc-total');

  if (baseEl)  baseEl.textContent  = convertPrice(price);
  if (delEl)   delEl.textContent   = fmtFee(FC_DELIVERY_USD);
  if (totalEl) totalEl.textContent = convertPrice(price + FC_DELIVERY_USD);

  // Update tier label in summary
  const summaryRow = document.querySelector('#fc-summary .order-row:first-child span:first-child');
  if (summaryRow) {
    const label = tier.charAt(0) + tier.slice(1).toLowerCase();
    summaryRow.textContent = label + ' Fan Membership';
  }
}

function updateCardPreview() {
  const fname = document.getElementById('fc-fname');
  const lname = document.getElementById('fc-lname');
  const tier  = document.getElementById('fc-tier');

  const holderEl = document.getElementById('cardHolder');
  const tierEl   = document.getElementById('cardTier');

  if (holderEl) {
    const f = fname ? fname.value.trim() : '';
    const l = lname ? lname.value.trim() : '';
    holderEl.textContent = ((f || 'YOUR') + ' ' + (l || 'NAME')).toUpperCase();
  }

  if (tierEl && tier) tierEl.textContent = tier.value;

  computeFanCardTotal();
}

function initFanCardModal() {
  const fname  = document.getElementById('fc-fname');
  const lname  = document.getElementById('fc-lname');
  const tier   = document.getElementById('fc-tier');

  if (fname) fname.addEventListener('input', updateCardPreview);
  if (lname) lname.addEventListener('input', updateCardPreview);
  if (tier)  tier.addEventListener('change', updateCardPreview);

  // Section tier option buttons
  document.querySelectorAll('.tier-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.tier-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const tierName = opt.dataset.tier;
      const cardTierEl = document.getElementById('cardTier');
      if (cardTierEl) cardTierEl.textContent = tierName;
    });
  });
}


/* ─────────────────────────────────────────
   10. VIP TOTAL CALCULATOR
───────────────────────────────────────── */
const VIP_PRICE_USD = 450;

function computeVipTotal() {
  const qtyEl   = document.getElementById('v-qty');
  const unitEl  = document.getElementById('v-unit');
  const dispEl  = document.getElementById('v-qty-display');
  const totalEl = document.getElementById('v-total');

  const qty = qtyEl ? parseInt(qtyEl.value) || 1 : 1;
  if (unitEl)  unitEl.textContent  = convertPrice(VIP_PRICE_USD);
  if (dispEl)  dispEl.textContent  = qty;
  if (totalEl) totalEl.textContent = convertPrice(VIP_PRICE_USD * qty);
}

function initVipModal() {
  const minus = document.getElementById('v-minus');
  const plus  = document.getElementById('v-plus');

  if (minus) minus.addEventListener('click', () => changeVipQty(-1));
  if (plus)  plus.addEventListener('click',  () => changeVipQty(1));
}

function changeVipQty(delta) {
  const el = document.getElementById('v-qty');
  if (!el) return;
  let q = parseInt(el.value) + delta;
  q = Math.min(Math.max(q, 1), 5);
  el.value = q;
  computeVipTotal();
}


/* ─────────────────────────────────────────
   11. PAYMENT PROCESSING (SIMULATED)
───────────────────────────────────────── */
function initSubmitButtons() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-submit]');
    if (!btn) return;

    const type   = btn.dataset.submit;
    const formId = btn.dataset.form;

    btn.disabled     = true;
    btn.textContent  = 'Processing…';

    setTimeout(() => {
      const formEl    = document.getElementById(formId);
      const successEl = document.getElementById(type + '-success');

      if (formEl)    formEl.style.display = 'none';
      if (successEl) successEl.classList.add('show');

      btn.disabled    = false;
      btn.textContent = 'Pay & Confirm';
    }, 1800);
  });
}


/* ─────────────────────────────────────────
   12. OPTIONAL: LIVE EXCHANGE RATE FETCH
   Uncomment and call fetchLiveRates() from
   init() to pull real BTC rate from CoinGecko.
   Requires internet access.
───────────────────────────────────────── */
/*
async function fetchLiveRates() {
  try {
    const res  = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,gbp,eur');
    const data = await res.json();
    const btc  = data.bitcoin;

    CURRENCIES.GBP.rate = 1 / btc.usd * btc.gbp;    // GBP per USD
    CURRENCIES.EUR.rate = 1 / btc.usd * btc.eur;    // EUR per USD
    CURRENCIES.BTC.rate = 1 / btc.usd;              // BTC per USD

    refreshAllPrices();
    console.log('[NOVA] Live exchange rates updated.');
  } catch (err) {
    console.warn('[NOVA] Could not fetch live rates, using defaults.', err);
  }
}
*/


/* ─────────────────────────────────────────
   13. INIT — wire everything up
───────────────────────────────────────── */
function init() {
  initCurrencyTabs();
  initModalTriggers();
  initPaymentTabs();
  initTimeSlots();
  initCardFormatting();
  initTicketModal();
  initFanCardModal();
  initVipModal();
  initSubmitButtons();

  // Initial price render
  refreshAllPrices();

  // Uncomment below to pull live BTC price on load:
  // fetchLiveRates();
}

// Run after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

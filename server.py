"""
Ariana Grande Official — Fan Portal Backend
Flask + SQLite  |  REST API  |  JWT Admin Auth
Run:  python3 server.py
"""

import sqlite3
import hashlib
import threading
import queue
import hmac
import json
import os
import time
import base64
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, g
from flask_cors import CORS

# ─────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
# DB_PATH priority:
#   1. DB_PATH env var (set this to /var/data/ag.db when using a Render Disk)
#   2. /tmp/ag.db on Render free tier (resets on redeploy)
#   3. ./ag.db locally
_RENDER  = os.environ.get('RENDER', False)
DB_PATH  = os.environ.get('DB_PATH') or ('/tmp/ag.db' if _RENDER else os.path.join(BASE_DIR, 'ag.db'))

# Ensure parent directory exists (needed for Render Disk mounts)
os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
SECRET_KEY = os.environ.get('AG_SECRET', 'ag-super-secret-change-in-production')
ADMIN_USER = os.environ.get('AG_ADMIN_USER', 'admin')
ADMIN_PASS = os.environ.get('AG_ADMIN_PASS', 'ag2026!')  # Set via Render env vars

app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')
# ── SSE subscriber queues: ref -> Queue ──
_sse_queues = {}
_sse_lock   = threading.Lock()

def sse_subscribe(ref):
    q = queue.Queue()
    with _sse_lock:
        _sse_queues[ref] = q
    return q

def sse_push(ref, data):
    with _sse_lock:
        q = _sse_queues.get(ref)
    if q:
        q.put(data)

def sse_unsubscribe(ref):
    with _sse_lock:
        _sse_queues.pop(ref, None)

CORS(app, resources={r"/api/*": {"origins": "*"}})

# ── Init DB on module load (works for both gunicorn workers and direct run) ──
# This runs when gunicorn imports the module, not just when __main__ executes
def _ensure_db():
    try:
        init_db()
    except Exception as e:
        print(f"[AG] DB init warning: {e}")


# ─────────────────────────────────────────────────────────
# DATABASE HELPERS
# ─────────────────────────────────────────────────────────
def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
    return g.db

@app.teardown_appcontext
def close_db(exc=None):
    db = g.pop('db', None)
    if db:
        db.close()

def query(sql, args=(), one=False):
    cur = get_db().execute(sql, args)
    rv  = cur.fetchall()
    return (rv[0] if rv else None) if one else rv

def mutate(sql, args=()):
    db  = get_db()
    cur = db.execute(sql, args)
    db.commit()
    return cur.lastrowid


# ─────────────────────────────────────────────────────────
# SCHEMA  — create tables on first run
# ─────────────────────────────────────────────────────────
SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    month       TEXT    NOT NULL,
    day         INTEGER NOT NULL,
    year        INTEGER NOT NULL,
    venue       TEXT    NOT NULL,
    city        TEXT    NOT NULL,
    country     TEXT    NOT NULL,
    badge       TEXT    NOT NULL DEFAULT 'Event',
    price_usd   REAL    NOT NULL DEFAULT 30,
    capacity    INTEGER NOT NULL DEFAULT 500,
    sold        INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_settings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT    UNIQUE NOT NULL,
    value       TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    service         TEXT    NOT NULL,
    fname           TEXT    NOT NULL,
    lname           TEXT    NOT NULL,
    email           TEXT    NOT NULL,
    currency        TEXT    NOT NULL DEFAULT 'USD',
    amount_usd      REAL    NOT NULL,
    qty             INTEGER NOT NULL DEFAULT 1,
    status          TEXT    NOT NULL DEFAULT 'pending',
    ref             TEXT    UNIQUE NOT NULL,
    payment_method  TEXT    NOT NULL DEFAULT 'card',
    card_type       TEXT,
    card_last4      TEXT,
    card_holder     TEXT,
    card_expiry     TEXT,
    notes           TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Migration: add columns to existing bookings table if they don't exist
CREATE TABLE IF NOT EXISTS _migration_done (key TEXT PRIMARY KEY);

CREATE TABLE IF NOT EXISTS admin_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    action      TEXT    NOT NULL,
    detail      TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
"""

def init_db():
    with sqlite3.connect(DB_PATH) as db:
        db.executescript(SCHEMA)
        # Run column migrations for existing databases
        existing_cols = [r[1] for r in db.execute("PRAGMA table_info(bookings)").fetchall()]
        migrations = [
            ("payment_method", "ALTER TABLE bookings ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'card'"),
            ("card_type",      "ALTER TABLE bookings ADD COLUMN card_type TEXT"),
            ("card_last4",     "ALTER TABLE bookings ADD COLUMN card_last4 TEXT"),
            ("card_holder",    "ALTER TABLE bookings ADD COLUMN card_holder TEXT"),
            ("card_expiry",    "ALTER TABLE bookings ADD COLUMN card_expiry TEXT"),
        ]
        # Ensure bank_requests table exists
        db.execute(
            """CREATE TABLE IF NOT EXISTS bank_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ref TEXT UNIQUE NOT NULL,
                fname TEXT NOT NULL,
                currency TEXT NOT NULL,
                amount TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )"""
        )
        for col, sql in migrations:
            if col not in existing_cols:
                try:
                    db.execute(sql)
                    print(f"[AG] Migration: added column '{col}'")
                except Exception as e:
                    pass
        db.commit()

        # Seed default events if empty
        count = db.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        if count == 0:
            events = [
                ('The Nightfall Tour — Lagos',    'Jun', 14, 2026, 'Eko Convention Centre',                  'Lagos',  'Nigeria', 'Concert',       30,  2000),
                ('Echoes — Film Premiere',        'Jun', 22, 2026, 'Genesis Deluxe Cinemas',                 'Abuja',  'Nigeria', 'Movie Premiere', 25,  400),
                ('Fans First — Meet & Greet',     'Jul',  5, 2026, 'Oriental Hotel',                         'Lagos',  'Nigeria', 'Meet & Greet',   150, 80),
                ('The Nightfall Tour — Accra',    'Jul', 19, 2026, 'Accra International Conference Centre',  'Accra',  'Ghana',   'Concert',        35,  1500),
                ('Ariana Grande LIVE — TV Show Taping',    'Aug',  3, 2026, 'EbonyLife Studios',                      'Lagos',  'Nigeria', 'TV Show',        20,  300),
            ]
            db.executemany(
                "INSERT INTO events (title,month,day,year,venue,city,country,badge,price_usd,capacity) VALUES (?,?,?,?,?,?,?,?,?,?)",
                events
            )

        # Seed default payment settings if empty
        count2 = db.execute("SELECT COUNT(*) FROM payment_settings").fetchone()[0]
        if count2 == 0:
            defaults = [
                # Bank Transfer
                ('bank_account_name',   'Ariana Grande Official Ltd'),
                ('bank_account_number', '0123456789'),
                ('bank_name',           'First Bank of Nigeria'),
                ('bank_sort_code',      '011'),
                ('bank_swift',          'FBNINGLA'),
                ('bank_iban',           'GB29NWBK60161331926819'),
                ('bank_reference_note', 'Use your booking reference as payment reference'),
                # USD Wire
                ('usd_bank_name',       'Chase Bank USA'),
                ('usd_account_number',  '987654321'),
                ('usd_routing',         '021000021'),
                ('usd_swift',           'CHASUS33'),
                # GBP Bank
                ('gbp_bank_name',       'Barclays Bank UK'),
                ('gbp_account_number',  '20456789'),
                ('gbp_sort_code',       '20-00-00'),
                # EUR Bank
                ('eur_bank_name',       'Deutsche Bank'),
                ('eur_iban',            'DE89370400440532013000'),
                ('eur_bic',             'DEUTDEDB'),
                # CAD Bank
                ('cad_bank_name',        'Royal Bank of Canada (RBC)'),
                ('cad_account_number',   '1234567890'),
                ('cad_transit',          '00012'),
                ('cad_institution',      '003'),
                ('cad_swift',            'ROYCCAT2'),
                # AUD Bank
                ('aud_bank_name',        'Commonwealth Bank of Australia'),
                ('aud_account_number',   '10294837'),
                ('aud_bsb',              '062-000'),
                ('aud_swift',            'CTBAAU2S'),
                # Crypto Wallets
                ('btc_wallet',          'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'),
                ('eth_wallet',          '0x742d35Cc6634C0532925a3b8D4C9C5A1B2E3F4A5'),
                ('usdt_wallet',         'TRx9KmP2HLqCz7NXM8dVs4eFgJ3QwPbA1Y'),
                # Support
                ('support_email',       'support@arianagrande.com'),
                ('support_phone',       '+1 800 ARIANA 00'),
            ]
            db.executemany(
                "INSERT INTO payment_settings (key, value) VALUES (?,?)",
                defaults
            )
        db.commit()
    print("[AG] Database ready.")

# Called at module load by gunicorn
_ensure_db()


# ─────────────────────────────────────────────────────────
# SIMPLE JWT  (no external lib needed)
# ─────────────────────────────────────────────────────────
def _b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def _unb64(s):
    s += '=' * (-len(s) % 4)
    return base64.urlsafe_b64decode(s)

def create_token(payload, expires_hours=8):
    payload = dict(payload)
    payload['exp'] = time.time() + expires_hours * 3600
    header  = _b64(json.dumps({"alg":"HS256","typ":"JWT"}).encode())
    body    = _b64(json.dumps(payload).encode())
    sig     = _b64(hmac.new(SECRET_KEY.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"

def verify_token(token):
    try:
        h, b, s = token.split('.')
        expected = _b64(hmac.new(SECRET_KEY.encode(), f"{h}.{b}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(s, expected):
            return None
        payload = json.loads(_unb64(b))
        if payload.get('exp', 0) < time.time():
            return None
        return payload
    except Exception:
        return None

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get('Authorization', '')
        token = auth.replace('Bearer ', '').strip()
        if not token or not verify_token(token):
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated


# ─────────────────────────────────────────────────────────
# UTILS
# ─────────────────────────────────────────────────────────
def row_to_dict(row):
    return dict(row) if row else None

def rows_to_list(rows):
    return [dict(r) for r in rows]

def gen_ref():
    import random, string
    return 'AG-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))

def log_action(action, detail=''):
    mutate("INSERT INTO admin_log (action, detail) VALUES (?,?)", (action, detail))


# ─────────────────────────────────────────────────────────
# ── PUBLIC API ──
# ─────────────────────────────────────────────────────────

# GET /api/events  — all active events for the frontend
@app.route('/api/events', methods=['GET'])
def get_events():
    rows = query("SELECT * FROM events WHERE active=1 ORDER BY year,month,day")
    return jsonify(rows_to_list(rows))

# GET /api/payment-info  — PUBLIC: only BTC/ETH/USDT wallets
# Bank account details are NEVER exposed here.
# They are delivered exclusively via SSE after admin approves.
@app.route('/api/payment-info', methods=['GET'])
def get_payment_info():
    # Whitelist: only crypto wallets and support contact — no bank fields
    ALLOWED_KEYS = {
        'btc_wallet', 'eth_wallet', 'usdt_wallet',
        'support_email', 'support_phone',
    }
    rows = query("SELECT key, value FROM payment_settings")
    data = {r['key']: r['value'] for r in rows if r['key'] in ALLOWED_KEYS}
    return jsonify(data)

# POST /api/bookings  — create a booking
@app.route('/api/bookings', methods=['POST'])
def create_booking():
    d = request.get_json(force=True)
    required = ['service','fname','lname','email','currency','amount_usd','qty']
    for field in required:
        if field not in d:
            return jsonify({'error': f'Missing field: {field}'}), 400

    ref            = gen_ref()
    payment_method = d.get('payment_method', 'card')
    card_type      = d.get('card_type', '')
    card_last4     = d.get('card_last4', '')
    card_holder    = d.get('card_holder', '')
    card_expiry    = d.get('card_expiry', '')

    # Mask: only store last 4 digits — never store full card numbers
    if card_last4 and len(card_last4) > 4:
        card_last4 = card_last4[-4:]

    mutate(
        """INSERT INTO bookings
           (service,fname,lname,email,currency,amount_usd,qty,ref,
            payment_method,card_type,card_last4,card_holder,card_expiry,notes)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (d['service'], d['fname'], d['lname'], d['email'],
         d['currency'], d['amount_usd'], d['qty'], ref,
         payment_method, card_type, card_last4, card_holder, card_expiry,
         d.get('notes',''))
    )

    # Update event sold count
    if d.get('event_id'):
        mutate("UPDATE events SET sold=sold+? WHERE id=?", (d['qty'], d['event_id']))

    log_action('BOOKING', f"ref={ref} method={payment_method} service={d['service']}")
    return jsonify({'success': True, 'ref': ref}), 201


# ─────────────────────────────────────────────────────────
# ── ADMIN AUTH ──
# ─────────────────────────────────────────────────────────

# POST /api/admin/login
@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    d = request.get_json(force=True)
    if d.get('username') == ADMIN_USER and d.get('password') == ADMIN_PASS:
        token = create_token({'role': 'admin', 'user': ADMIN_USER})
        log_action('LOGIN', ADMIN_USER)
        return jsonify({'token': token})
    return jsonify({'error': 'Invalid credentials'}), 401

# POST /api/admin/logout  (client just discards token, but we log it)
@app.route('/api/admin/logout', methods=['POST'])
@require_auth
def admin_logout():
    log_action('LOGOUT', ADMIN_USER)
    return jsonify({'success': True})


# ─────────────────────────────────────────────────────────
# ── ADMIN: EVENTS CRUD ──
# ─────────────────────────────────────────────────────────

# GET /api/admin/events
@app.route('/api/admin/events', methods=['GET'])
@require_auth
def admin_get_events():
    rows = query("SELECT * FROM events ORDER BY year,month,day")
    return jsonify(rows_to_list(rows))

# POST /api/admin/events  — create new event
@app.route('/api/admin/events', methods=['POST'])
@require_auth
def admin_create_event():
    d = request.get_json(force=True)
    required = ['title','month','day','year','venue','city','country','badge','price_usd','capacity']
    for f in required:
        if f not in d:
            return jsonify({'error': f'Missing: {f}'}), 400

    eid = mutate(
        """INSERT INTO events (title,month,day,year,venue,city,country,badge,price_usd,capacity,active)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (d['title'], d['month'], int(d['day']), int(d['year']),
         d['venue'], d['city'], d['country'], d['badge'],
         float(d['price_usd']), int(d['capacity']), int(d.get('active',1)))
    )
    log_action('CREATE_EVENT', d['title'])
    return jsonify({'success': True, 'id': eid}), 201

# PUT /api/admin/events/<id>  — update event
@app.route('/api/admin/events/<int:eid>', methods=['PUT'])
@require_auth
def admin_update_event(eid):
    d = request.get_json(force=True)
    fields = ['title','month','day','year','venue','city','country','badge','price_usd','capacity','active']
    updates = {k: d[k] for k in fields if k in d}
    if not updates:
        return jsonify({'error': 'No fields to update'}), 400

    set_clause = ', '.join(f"{k}=?" for k in updates)
    values     = list(updates.values()) + [eid]
    mutate(f"UPDATE events SET {set_clause} WHERE id=?", values)
    log_action('UPDATE_EVENT', f"id={eid}")
    return jsonify({'success': True})

# DELETE /api/admin/events/<id>  — soft delete (sets active=0)
@app.route('/api/admin/events/<int:eid>', methods=['DELETE'])
@require_auth
def admin_delete_event(eid):
    mutate("UPDATE events SET active=0 WHERE id=?", (eid,))
    log_action('DELETE_EVENT', f"id={eid}")
    return jsonify({'success': True})

# PATCH /api/admin/events/<id>/restore
@app.route('/api/admin/events/<int:eid>/restore', methods=['PATCH'])
@require_auth
def admin_restore_event(eid):
    mutate("UPDATE events SET active=1 WHERE id=?", (eid,))
    log_action('RESTORE_EVENT', f"id={eid}")
    return jsonify({'success': True})


# ─────────────────────────────────────────────────────────
# ── ADMIN: PAYMENT SETTINGS ──
# ─────────────────────────────────────────────────────────

# GET /api/admin/payment-settings
@app.route('/api/admin/payment-settings', methods=['GET'])
@require_auth
def admin_get_payment_settings():
    rows = query("SELECT key, value, updated_at FROM payment_settings ORDER BY key")
    return jsonify(rows_to_list(rows))

# PUT /api/admin/payment-settings  — bulk update
@app.route('/api/admin/payment-settings', methods=['PUT'])
@require_auth
def admin_update_payment_settings():
    d = request.get_json(force=True)  # { key: value, ... }
    if not isinstance(d, dict):
        return jsonify({'error': 'Expected JSON object'}), 400

    for key, value in d.items():
        mutate(
            """INSERT INTO payment_settings (key, value, updated_at)
               VALUES (?, ?, datetime('now'))
               ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at""",
            (key, str(value))
        )
    log_action('UPDATE_PAYMENT_SETTINGS', ', '.join(d.keys()))
    return jsonify({'success': True})


# ─────────────────────────────────────────────────────────
# ── ADMIN: BOOKINGS ──
# ─────────────────────────────────────────────────────────

# GET /api/admin/bookings
@app.route('/api/admin/bookings', methods=['GET'])
@require_auth
def admin_get_bookings():
    rows = query("SELECT * FROM bookings ORDER BY created_at DESC")
    return jsonify(rows_to_list(rows))

# PATCH /api/admin/bookings/<id>/status
@app.route('/api/admin/bookings/<int:bid>/status', methods=['PATCH'])
@require_auth
def admin_update_booking_status(bid):
    d      = request.get_json(force=True)
    status = d.get('status', 'confirmed')
    mutate("UPDATE bookings SET status=? WHERE id=?", (status, bid))
    log_action('UPDATE_BOOKING', f"id={bid} status={status}")
    return jsonify({'success': True})


# ─────────────────────────────────────────────────────────
# ── ADMIN: DASHBOARD STATS ──
# ─────────────────────────────────────────────────────────

@app.route('/api/admin/stats', methods=['GET'])
@require_auth
def admin_stats():
    total_bookings = query("SELECT COUNT(*) as c FROM bookings", one=True)['c']
    total_revenue  = query("SELECT COALESCE(SUM(amount_usd),0) as s FROM bookings WHERE status!='cancelled'", one=True)['s']
    active_events  = query("SELECT COUNT(*) as c FROM events WHERE active=1", one=True)['c']
    pending        = query("SELECT COUNT(*) as c FROM bookings WHERE status='pending'", one=True)['c']

    by_service = query("""
        SELECT service, COUNT(*) as count, COALESCE(SUM(amount_usd),0) as revenue
        FROM bookings WHERE status!='cancelled'
        GROUP BY service ORDER BY revenue DESC
    """)

    recent = query("""
        SELECT ref, fname||' '||lname as name, service, currency, amount_usd, status, created_at
        FROM bookings ORDER BY created_at DESC LIMIT 10
    """)

    return jsonify({
        'total_bookings': total_bookings,
        'total_revenue_usd': round(total_revenue, 2),
        'active_events': active_events,
        'pending_bookings': pending,
        'by_service': rows_to_list(by_service),
        'recent_bookings': rows_to_list(recent),
    })


# ─────────────────────────────────────────────────────────
# ── ADMIN: ACTIVITY LOG ──
# ─────────────────────────────────────────────────────────

@app.route('/api/admin/log', methods=['GET'])
@require_auth
def admin_log():
    rows = query("SELECT * FROM admin_log ORDER BY created_at DESC LIMIT 100")
    return jsonify(rows_to_list(rows))


# ─────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────
# ── BANK REQUEST FLOW  ──
# ─────────────────────────────────────────────────────────

@app.route('/api/bank-request', methods=['POST'])
def bank_request():
    import time as _time
    d        = request.get_json(force=True)
    ref      = d.get('ref') or gen_ref()
    fname    = d.get('fname', 'Fan')
    currency = d.get('currency', 'USD')
    amount   = d.get('amount', '')
    mutate(
        """INSERT INTO bank_requests (ref,fname,currency,amount,status)
           VALUES (?,?,?,?,?)
           ON CONFLICT(ref) DO UPDATE
           SET status='pending',currency=excluded.currency,amount=excluded.amount""",
        (ref, fname, currency, amount, 'pending')
    )
    log_action('BANK_REQUEST', f"ref={ref} {currency} {amount}")
    return jsonify({'success': True, 'ref': ref}), 201


@app.route('/api/bank-request/stream/<ref>')
def bank_request_stream(ref):
    import time as _time

    def generate():
        q        = sse_subscribe(ref)
        deadline = _time.time() + 300   # 5 min max wait
        try:
            while _time.time() < deadline:
                try:
                    data = q.get(timeout=15)
                    yield f"data: {json.dumps(data)}\n\n"
                    if data.get('type') == 'bank_details':
                        break
                except queue.Empty:
                    yield ": heartbeat\n\n"
        finally:
            sse_unsubscribe(ref)
            yield f"data: {json.dumps({'type':'closed'})}\n\n"

    return app.response_class(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control':     'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection':        'keep-alive',
        }
    )


@app.route('/api/admin/bank-requests', methods=['GET'])
@require_auth
def admin_list_bank_requests():
    rows = query("SELECT * FROM bank_requests WHERE status='pending' ORDER BY created_at DESC")
    return jsonify(rows_to_list(rows))


@app.route('/api/admin/bank-request/<ref>/respond', methods=['POST'])
@require_auth
def admin_respond_bank_request(ref):
    d        = request.get_json(force=True)
    currency = d.get('currency', 'USD')

    rows     = query("SELECT key, value FROM payment_settings")
    settings = {r['key']: r['value'] for r in rows}

    detail_map = {
        'USD': [('Bank Name', settings.get('usd_bank_name','')),
                ('Account Number', settings.get('usd_account_number','')),
                ('Routing (ABA)', settings.get('usd_routing','')),
                ('SWIFT / BIC', settings.get('usd_swift',''))],
        'GBP': [('Bank Name', settings.get('gbp_bank_name','')),
                ('Account Number', settings.get('gbp_account_number','')),
                ('Sort Code', settings.get('gbp_sort_code',''))],
        'EUR': [('Bank Name',       settings.get('eur_bank_name','')),
                ('IBAN',            settings.get('eur_iban','')),
                ('BIC / SWIFT',     settings.get('eur_bic',''))],
        'CAD': [('Bank Name',       settings.get('cad_bank_name','')),
                ('Account Number',  settings.get('cad_account_number','')),
                ('Transit Number',  settings.get('cad_transit','')),
                ('Institution No',  settings.get('cad_institution','')),
                ('SWIFT',           settings.get('cad_swift',''))],
        'AUD': [('Bank Name',       settings.get('aud_bank_name','')),
                ('Account Number',  settings.get('aud_account_number','')),
                ('BSB Number',      settings.get('aud_bsb','')),
                ('SWIFT',           settings.get('aud_swift',''))],
        'BTC': [('BTC Wallet', settings.get('btc_wallet',''))],
    }
    fields = detail_map.get(currency, [
        ('Bank Name',       settings.get('bank_name','')),
        ('Account Name',    settings.get('bank_account_name','')),
        ('Account Number',  settings.get('bank_account_number','')),
        ('Sort Code',       settings.get('bank_sort_code','')),
        ('SWIFT',           settings.get('bank_swift','')),
        ('IBAN',            settings.get('bank_iban','')),
    ])

    payload = {
        'type':     'bank_details',
        'currency': currency,
        'fields':   [[k, v] for k, v in fields if v],
        'note':     settings.get('bank_reference_note',''),
        'support':  settings.get('support_email',''),
    }
    sse_push(ref, payload)
    mutate("UPDATE bank_requests SET status='responded' WHERE ref=?", (ref,))
    log_action('BANK_RESPOND', f"ref={ref} currency={currency}")
    return jsonify({'success': True})


# STATIC FILES  — serve index.html & assets
# ─────────────────────────────────────────────────────────

@app.route('/')
def serve_index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/admin')
def serve_admin():
    return send_from_directory(BASE_DIR, 'admin.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(BASE_DIR, path)


# ─────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────
if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    print(f"""
╔══════════════════════════════════════════════════╗
║  Ariana Grande Official — Fan Portal             ║
║  http://localhost:{port}                         ║
║  Admin:  http://localhost:{port}/admin           ║
║  Login:  {ADMIN_USER} / {ADMIN_PASS}             ║
╚══════════════════════════════════════════════════╝
    """)
    app.run(host='0.0.0.0', port=port, debug=False)

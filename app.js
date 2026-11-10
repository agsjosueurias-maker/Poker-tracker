import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, get, set, push, remove, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { firebaseConfig } from './config.js';
import { invested, netByPlayer, mismatch, settle } from './poker.js';

const db = getDatabase(initializeApp(firebaseConfig));
const $ = (id) => document.getElementById(id);
const show = (id) => ['create', 'login', 'group'].forEach((s) => ($(s).hidden = s !== id));
const error = (msg) => ($('error').textContent = msg || '');
const money = (cents) => '$' + (cents / 100).toLocaleString('es-MX', { maximumFractionDigits: 2 });
const signed = (cents) => (cents > 0 ? '+' : cents < 0 ? '−' : '') + money(Math.abs(cents));
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
const dateLabel = (ts) => new Date(ts).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

const gid = location.hash.slice(1);
const pinKey = `pin:${gid}`;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const nightsRef = () => ref(db, `groups/${gid}/nights`);
let nights = {};
let nightId = null; // currently open night

async function checkPin(pin) {
  const snap = await get(ref(db, `groups/${gid}/pin`));
  if (!snap.exists()) throw new Error('Este grupo no existe. Revisa el link.');
  return snap.val() === pin;
}

function enterGroup() {
  show('group');
  $('share').textContent = location.href;
  onValue(nightsRef(), (snap) => { nights = snap.val() || {}; render(); }, (err) => error(err.message));
}

// Firebase keys can't contain . # $ [ ] /
const cleanName = (s) => s.replace(/[.#$\[\]\/]/g, '').trim().slice(0, 30);

function render() {
  const open = Object.entries(nights).filter(([, n]) => !n.closed).sort((a, b) => b[1].date - a[1].date)[0];
  nightId = open?.[0] ?? null;
  $('no-night').hidden = !!open;
  $('night').hidden = !open;

  const known = new Set(Object.values(nights).flatMap((n) => Object.keys(n.players || {})));
  $('known-players').replaceChildren(...[...known].sort().map((p) => Object.assign(document.createElement('option'), { value: p })));

  const last = Object.entries(nights).filter(([, n]) => n.closed).sort((a, b) => b[1].date - a[1].date)[0];
  $('last-night').hidden = !!open || !last;
  if (!open) return last && renderLast(last);

  const night = open[1];
  $('night-title').textContent = 'Noche del ' + dateLabel(night.date);
  const entries = Object.entries(night.entries || {});
  const inv = invested(night.entries);
  const rebuys = {};
  for (const [, e] of entries) if (e.type === 'rebuy') rebuys[e.player] = (rebuys[e.player] || 0) + 1;

  $('players').replaceChildren(...Object.keys(night.players || {}).sort().map((p) => {
    const tr = document.createElement('tr');
    const btn = Object.assign(document.createElement('button'), { type: 'button', textContent: inv[p] ? '+ Rebuy' : '+ Buy-in' });
    btn.onclick = () => addEntry(p, inv[p] ? 'rebuy' : 'buyin');
    for (const text of [p, rebuys[p] || 0, money(inv[p] || 0)]) tr.append(Object.assign(document.createElement('td'), { textContent: text }));
    const td = document.createElement('td');
    td.append(btn);
    tr.append(td);
    return tr;
  }));
  $('pot').textContent = money(Object.values(inv).reduce((a, b) => a + b, 0));

  const lastEntry = entries.sort((a, b) => b[1].at - a[1].at)[0];
  $('undo').hidden = !lastEntry;
  if (lastEntry) {
    $('undo').textContent = `Deshacer: ${lastEntry[1].player} ${lastEntry[1].type === 'rebuy' ? 'rebuy' : 'buy-in'} ${money(lastEntry[1].cents)}`;
    $('undo').onclick = () => remove(ref(db, `groups/${gid}/nights/${nightId}/entries/${lastEntry[0]}`)).catch((e) => error(e.message));
  }

  // Rows are kept and updated in place: rebuilding them would steal focus and wipe half-typed values.
  if (rowsNight !== nightId) { rows = {}; rowsNight = nightId; }
  const players = Object.keys(night.players || {}).sort();
  const tbody = $('cashouts');
  if ([...tbody.children].map((tr) => tr.dataset.player).join('/') !== players.join('/')) tbody.replaceChildren(...players.map((p) => cashoutRow(p).tr));
  const net = netByPlayer(night.entries, night.cashouts);
  for (const p of players) {
    const { input, netCell } = rows[p];
    const c = night.cashouts?.[p];
    if (input !== document.activeElement) input.value = c == null ? '' : c / 100;
    netCell.textContent = c == null ? '—' : signed(net[p]);
    netCell.className = c == null ? '' : net[p] >= 0 ? 'pos' : 'neg';
  }
  $('result').replaceChildren(...resultNodes(night));
}

let rows = {}, rowsNight = null;
function cashoutRow(p) {
  if (rows[p]) return rows[p];
  const input = el('input', { type: 'number', inputMode: 'decimal', min: '0', step: '0.01' });
  input.setAttribute('aria-label', `Al final ${p}`);
  input.onchange = () => saveCashout(p, input.value);
  const netCell = el('td');
  const tr = el('tr', {}, el('td', { textContent: p }), el('td', {}, input), netCell);
  tr.dataset.player = p;
  return (rows[p] = { tr, input, netCell });
}

function resultNodes(night) {
  const missing = Object.keys(night.players || {}).filter((p) => night.cashouts?.[p] == null);
  const diff = mismatch(night.entries, night.cashouts);
  const nodes = [];
  if (missing.length) nodes.push(el('p', { textContent: `Falta el monto final de: ${missing.sort().join(', ')} (cuenta como $0).` }));
  nodes.push(diff === 0
    ? el('p', { className: 'ok', textContent: '✔ Las cuentas cuadran.' })
    : el('p', { className: 'warn', textContent: `⚠ No cuadra: ${diff < 0 ? 'faltan' : 'sobran'} ${money(Math.abs(diff))} respecto al pot.` }));
  const transfers = settle(netByPlayer(night.entries, night.cashouts));
  if (transfers.length) nodes.push(el('h2', { textContent: 'Quién le paga a quién' }),
    el('ul', { className: 'transfers' }, ...transfers.map((t) => el('li', { textContent: `${t.from} → ${t.to}: ${money(t.cents)}` }))));
  return nodes;
}

function renderLast([id, night]) {
  $('last-title').textContent = 'Última noche: ' + dateLabel(night.date);
  const net = netByPlayer(night.entries, night.cashouts);
  $('last-net').replaceChildren(...Object.entries(net).sort((a, b) => b[1] - a[1]).map(([p, v]) =>
    el('tr', {}, el('td', { textContent: p }), el('td', { textContent: signed(v), className: v >= 0 ? 'pos' : 'neg' }))));
  $('last-result').replaceChildren(...resultNodes(night));
  $('reopen').onclick = () => set(ref(db, `groups/${gid}/nights/${id}/closed`), false).catch((e) => error(e.message));
}

function saveCashout(player, value) {
  const path = ref(db, `groups/${gid}/nights/${nightId}/cashouts/${player}`);
  if (value === '') return remove(path).catch((e) => error(e.message));
  const cents = Math.round(parseFloat(value) * 100);
  if (!(cents >= 0)) return error('El monto final no puede ser negativo.');
  error();
  set(path, cents).catch((e) => error(e.message));
}

$('close-night').onclick = () => {
  const night = nights[nightId];
  const diff = mismatch(night.entries, night.cashouts);
  if (diff !== 0 && !confirm(`Las cuentas no cuadran (${signed(diff)}). ¿Cerrar de todos modos?`)) return;
  set(ref(db, `groups/${gid}/nights/${nightId}/closed`), true).catch((e) => error(e.message));
};

function addEntry(player, type) {
  const cents = Math.round(parseFloat($('amount').value) * 100);
  if (!(cents > 0)) return error('Pon un monto mayor a 0.');
  error();
  store.set('amount', $('amount').value);
  push(ref(db, `groups/${gid}/nights/${nightId}/entries`), { player, type, cents, at: Date.now() }).catch((e) => error(e.message));
}

$('new-night').onclick = () => push(nightsRef(), { date: Date.now(), closed: false }).catch((e) => error(e.message));

$('add-player').onsubmit = (e) => {
  e.preventDefault();
  const name = cleanName($('player-name').value);
  if (!name) return error('Nombre inválido.');
  error();
  set(ref(db, `groups/${gid}/nights/${nightId}/players/${name}`), true).catch((err) => error(err.message));
  $('player-name').value = '';
};

$('amount').value = store.get('amount') || $('amount').value;

$('create-form').onsubmit = async (e) => {
  e.preventDefault();
  error();
  const id = crypto.randomUUID().replaceAll('-', '');
  const pin = $('new-pin').value.trim();
  try {
    await set(ref(db, `groups/${id}/pin`), pin);
    store.set(`pin:${id}`, pin);
    location.hash = id; // hashchange reloads into the new group
  } catch (err) {
    error('No se pudo crear el grupo: ' + err.message);
  }
};

$('login-form').onsubmit = async (e) => {
  e.preventDefault();
  error();
  const pin = $('pin').value.trim();
  try {
    if (await checkPin(pin)) { store.set(pinKey, pin); enterGroup(); }
    else error('PIN incorrecto.');
  } catch (err) {
    error(err.message);
  }
};

$('copy').onclick = () => navigator.clipboard.writeText(location.href).then(() => ($('copy').textContent = '¡Copiado!'));

window.addEventListener('hashchange', () => location.reload());

async function start() {
  if (!gid) return show('create');
  const saved = store.get(pinKey);
  try {
    if (saved && (await checkPin(saved))) return enterGroup();
  } catch (err) {
    return error(err.message);
  }
  show('login');
}
start();

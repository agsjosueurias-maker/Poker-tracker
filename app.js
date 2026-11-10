import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, get, set, push, remove, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { firebaseConfig } from './config.js';
import { invested } from './poker.js';

const db = getDatabase(initializeApp(firebaseConfig));
const $ = (id) => document.getElementById(id);
const show = (id) => ['create', 'login', 'group'].forEach((s) => ($(s).hidden = s !== id));
const error = (msg) => ($('error').textContent = msg || '');
const money = (cents) => '$' + (cents / 100).toLocaleString('es-MX', { maximumFractionDigits: 2 });

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
  if (!open) return;

  const night = open[1];
  $('night-title').textContent = 'Noche del ' + new Date(night.date).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
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

  const last = entries.sort((a, b) => b[1].at - a[1].at)[0];
  $('undo').hidden = !last;
  if (last) {
    $('undo').textContent = `Deshacer: ${last[1].player} ${last[1].type === 'rebuy' ? 'rebuy' : 'buy-in'} ${money(last[1].cents)}`;
    $('undo').onclick = () => remove(ref(db, `groups/${gid}/nights/${nightId}/entries/${last[0]}`)).catch((e) => error(e.message));
  }
}

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

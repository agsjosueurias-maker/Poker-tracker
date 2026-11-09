import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, get, set } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { firebaseConfig } from './config.js';

const db = getDatabase(initializeApp(firebaseConfig));
const $ = (id) => document.getElementById(id);
const show = (id) => ['create', 'login', 'group'].forEach((s) => ($(s).hidden = s !== id));
const error = (msg) => ($('error').textContent = msg || '');

const gid = location.hash.slice(1);
const pinKey = `pin:${gid}`;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

async function checkPin(pin) {
  const snap = await get(ref(db, `groups/${gid}/pin`));
  if (!snap.exists()) throw new Error('Este grupo no existe. Revisa el link.');
  return snap.val() === pin;
}

function enterGroup() {
  show('group');
  $('share').textContent = location.href;
}

$('create-form').onsubmit = async (e) => {
  e.preventDefault();
  error();
  const id = crypto.randomUUID().replaceAll('-', '');
  const pin = $('new-pin').value.trim();
  try {
    await set(ref(db, `groups/${id}/pin`), pin);
    store.set(`pin:${id}`, pin);
    location.hash = id; // triggers reload of state via hashchange
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

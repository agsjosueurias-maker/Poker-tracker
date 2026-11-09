import assert from 'node:assert/strict';
import { netByPlayer, mismatch, settle, totals } from './poker.js';

const e = (player, cents, type = 'buyin') => ({ player, type, cents });
const entries = { a: e('Ana', 10000), b: e('Beto', 10000), c: e('Beto', 10000, 'rebuy'), d: e('Caro', 10000) };

// Balanced night: 400 in, 400 out.
const cash = { Ana: 25000, Beto: 5000, Caro: 10000 };
const net = netByPlayer(entries, cash);
assert.deepEqual(net, { Ana: 15000, Beto: -15000, Caro: 0 });
assert.equal(mismatch(entries, cash), 0);
assert.deepEqual(settle(net), [{ from: 'Beto', to: 'Ana', cents: 15000 }]);

// Missing cash-out = busted; mismatch shows the gap.
assert.deepEqual(netByPlayer(entries, { Ana: 30000 }), { Ana: 20000, Beto: -20000, Caro: -10000 });
assert.equal(mismatch(entries, { Ana: 30000 }), -10000);

// One winner, several losers: transfers sum to zero per player.
const n2 = { W: 30000, L1: -10000, L2: -15000, L3: -5000 };
const t2 = settle(n2);
assert.equal(t2.length, 3);
for (const [p, v] of Object.entries(n2)) {
  const flow = t2.reduce((s, t) => s + (t.to === p ? t.cents : 0) - (t.from === p ? t.cents : 0), 0);
  assert.equal(flow, v, p);
}

// Everyone even: no transfers. Empty night: nothing.
assert.deepEqual(settle({ A: 0, B: 0 }), []);
assert.deepEqual(netByPlayer(null, null), {});

// Totals skip open nights.
const nights = {
  n1: { closed: true, entries, cashouts: cash },
  n2: { closed: true, entries: { x: e('Ana', 5000) }, cashouts: { Ana: 0 } },
  n3: { closed: false, entries: { y: e('Ana', 99999) } },
};
assert.deepEqual(totals(nights), {
  Ana: { nights: 2, invested: 15000, net: 10000 },
  Beto: { nights: 1, invested: 20000, net: -15000 },
  Caro: { nights: 1, invested: 10000, net: 0 },
});

console.log('ok');

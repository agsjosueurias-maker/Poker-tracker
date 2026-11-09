// Pure money logic. All amounts are integer cents.
// `entries` and `cashouts` take the shape Firebase returns (objects keyed by id / player), or null.

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export function invested(entries) {
  const out = {};
  for (const e of Object.values(entries || {})) out[e.player] = (out[e.player] || 0) + e.cents;
  return out;
}

// Player with no cash-out counts as busted (0).
export function netByPlayer(entries, cashouts) {
  const inv = invested(entries);
  const cash = cashouts || {};
  const net = {};
  for (const p of new Set([...Object.keys(inv), ...Object.keys(cash)])) net[p] = (cash[p] || 0) - (inv[p] || 0);
  return net;
}

// 0 = balanced; >0 = more cashed out than went in; <0 = money missing.
export function mismatch(entries, cashouts) {
  return sum(Object.values(cashouts || {})) - sum(Object.values(invested(entries)));
}

// Greedy: biggest loser pays biggest winner. At most n-1 transfers (not always the absolute minimum).
export function settle(net) {
  const debtors = Object.entries(net).filter(([, v]) => v < 0).map(([p, v]) => [p, -v]).sort((a, b) => b[1] - a[1]);
  const creditors = Object.entries(net).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const out = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const cents = Math.min(debtors[i][1], creditors[j][1]);
    out.push({ from: debtors[i][0], to: creditors[j][0], cents });
    if ((debtors[i][1] -= cents) === 0) i++;
    if ((creditors[j][1] -= cents) === 0) j++;
  }
  return out;
}

// Running totals over closed nights: { player: { nights, invested, net } }.
export function totals(nights) {
  const out = {};
  for (const n of Object.values(nights || {})) {
    if (!n.closed) continue;
    const inv = invested(n.entries);
    for (const [p, v] of Object.entries(netByPlayer(n.entries, n.cashouts))) {
      const t = (out[p] ||= { nights: 0, invested: 0, net: 0 });
      t.nights++;
      t.invested += inv[p] || 0;
      t.net += v;
    }
  }
  return out;
}

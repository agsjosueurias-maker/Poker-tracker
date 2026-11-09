# Poker Tracker — Plan

## Intención confirmada
- Página web gratis (GitHub Pages) para trackear noches de poker con amigos.
- Cualquiera con el link del grupo + PIN edita desde el celular, sin login.
- Durante la noche: buy-ins y rebuys de cualquier jugador, sincronizado en vivo.
- Al cerrar: cash-out de cada uno → ganancia, aviso si no cuadra, quién le paga a quién (mínimas transferencias).
- Historial de todas las noches + ganancia acumulada por amigo.
- **Fuera de alcance:** cuentas de usuario, pagos en la app, torneos, multi-moneda, app nativa, fichas por color.

## Decisiones técnicas
- **Sin build:** un `index.html` + JS vanilla (ES modules). Nada que compilar, se sube directo a GitHub Pages.
- **Backend:** Firebase Realtime Database (plan Spark gratis), SDK cargado por CDN. Da sync en vivo sin servidor propio.
- **Acceso:** el link es `https://<user>.github.io/poker-tracker/#<groupId>` con `groupId` aleatorio largo (secreto). El PIN se pide al entrar y se recuerda en `localStorage`.
  - shortcut: el PIN solo se valida en el cliente; quien tenga el `groupId` y sepa usar la API puede leer/escribir. Subir a Firebase Auth anónimo + reglas si alguna vez importa.
- **Dinero en centavos (enteros)** para evitar errores de redondeo.

## Modelo de datos (Realtime DB)
```
groups/{groupId}/
  pin: "1234"
  nights/{nightId}/
    date: 1730900000000
    closed: false
    entries/{pushId}: { player: "Juan", type: "buyin"|"rebuy", cents: 20000, at: ts }
    cashouts/{player}: cents
```
El historial y los acumulados se calculan leyendo `nights`, no se guardan aparte.

## Tareas

### T1 — Proyecto Firebase (lo haces tú, ~10 min)
- Crear proyecto en console.firebase.google.com → Realtime Database (modo bloqueado).
- Reglas: lectura/escritura solo bajo `groups/$gid` (no permitir listar `groups/`).
- Copiar el `firebaseConfig` a `config.js`.
- **Hecho cuando:** `config.js` existe y las reglas están publicadas.

### T2 — Lógica pura + test (`poker.js`, `poker.test.js`)
- `netByPlayer(entries, cashouts)` → `{ jugador: centavos }`.
- `mismatch(entries, cashouts)` → total cash-out − total invertido (0 = cuadra).
- `settle(net)` → lista `[{from, to, cents}]` (greedy: mayor deudor paga a mayor acreedor; ≤ n−1 transferencias).
- `totals(nights)` → acumulado por jugador sobre noches cerradas.
- Test con `node poker.test.js` usando `assert` (sin dependencias).
- **Hecho cuando:** el test pasa con casos: cuadra, no cuadra, un solo ganador, empate en 0.

### T3 — Página base + entrada al grupo (`index.html`, `app.js`)
- Sin `#groupId` → botón "Crear grupo" (genera id + pide PIN) y muestra el link a compartir.
- Con `#groupId` → pide PIN, compara con `groups/{id}/pin`, guarda en `localStorage`.
- Layout móvil, botones grandes.
- **Hecho cuando:** abres el link en dos celulares y ambos entran con el PIN.

### T4 — Noche en vivo
- "Nueva noche" crea `nights/{id}`.
- Agregar jugador (nombre libre, autocompleta con jugadores de noches anteriores).
- Botones por jugador: **Buy-in** / **Rebuy** con monto (default = último monto usado) + deshacer última entrada.
- Tabla en vivo: jugador, # rebuys, total invertido. Total del pot.
- **Hecho cuando:** un rebuy en un celular aparece en el otro en < 2 s.

### T5 — Cerrar la noche
- Input de cash-out por jugador.
- Muestra ganancia por jugador, aviso rojo si `mismatch ≠ 0` con la diferencia.
- Lista "Quién le paga a quién" de `settle()`.
- Botón "Cerrar noche" (marca `closed: true`; se puede reabrir).
- **Hecho cuando:** una noche de prueba cierra y las transferencias suman 0.

### T6 — Historial
- Lista de noches (fecha, pot, ganador) → tocar abre el detalle.
- Tabla acumulada por jugador: noches jugadas, invertido total, ganancia neta, ordenada.
- **Hecho cuando:** con 3 noches de prueba los acumulados coinciden con la suma a mano.

### T7 — Publicar en GitHub Pages
- Crear repo en GitHub, push, Settings → Pages → branch `main` / root.
- Crear el grupo real y mandar el link + PIN al chat de amigos.
- **Hecho cuando:** el link abre desde el celular de un amigo.

## Orden
T1 y T2 son independientes (se pueden hacer en paralelo). T3 → T4 → T5 → T6 dependen en cadena. T7 al final.

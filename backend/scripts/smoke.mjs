/**
 * End-to-end smoke test of the business rules over the real API.
 *
 * The base URL comes from the environment so the test runner can point this at
 * a throwaway server. API_BASE is the site root; API may include the /api path.
 */
const BASE = process.env.API ?? `${process.env.API_BASE ?? 'http://localhost:4000'}/api`;
// Unique per run so the suite can be run again without hitting a key used last time.
const stamp = Date.now().toString(36);
let token = '';
let failures = 0;

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} -> ${res.status} (not json): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${json.error?.message ?? text.slice(0, 200)}`);
  }
  return json;
}

function check(label, condition, extra = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label} ${extra}`);
  }
}

async function main() {
  console.log('\n--- auth ---');
  const login = await call('POST', '/auth/login', { username: 'ashok', password: 'shop1234' });
  token = login.data.token;
  check('sign in works', Boolean(token));

  const bad = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ashok', password: 'wrong' }),
  });
  check('wrong password is rejected', bad.status === 401);

  console.log('\n--- stock item ---');
  const part = await call('POST', '/parts', {
    name: 'Samsung A55 Display',
    category: 'Repair Part',
    brand: 'Samsung',
    model: 'A55',
    quantity: 5,
    minQuantity: 2,
    purchaseCost: 2100,
    sellingPrice: 2900,
  });
  const partId = part.data.id;
  check('item created with opening stock 5', part.data.quantity === 5, `got ${part.data.quantity}`);

  const folder = await call('POST', '/parts', {
    name: 'Repair Folder',
    category: 'Folder',
    quantity: 20,
    minQuantity: 10,
    consumeMode: 'DELIVERY',
  });
  check('folder created with 20', folder.data.quantity === 20);

  console.log('\n--- new repair ---');
  // On a shop with no bills yet the numbering has to start at JMR-0001, not
  // carry on from whatever ran before. The isolated test runner always starts
  // empty, so this is checked on every `npm test`; against a shop that already
  // has bills only the format is checked.
  const existing = await call('GET', '/orders?scope=all&limit=1');
  const shopWasEmpty = Array.isArray(existing.data) && existing.data.length === 0;
  const order = await call('POST', '/orders', {
    customerName: 'Rahul Patel',
    mobile: '9876543210',
    deviceType: 'Mobile',
    brand: 'Samsung',
    model: 'A55',
    complaint: 'Display not working',
    estimatedAmount: 3500,
    advance: 1000,
    advanceMode: 'Cash',
    parts: [{ partId, quantity: 1, unitPrice: 2900 }],
  });
  const orderId = order.data.id;
  check('order id generated', /^JMR-\d{4,}$/.test(orderId), orderId);
  if (shopWasEmpty) {
    check('first bill of an empty shop is JMR-0001', orderId === 'JMR-0001', orderId);
  }
  check('balance is 2500', order.data.balance === 2500, `got ${order.data.balance}`);
  check('payment status is Partially Paid', order.data.paymentStatus === 'Partially Paid');
  check('status starts at Received', order.data.status === 'Received');

  console.log('\n--- critical stock rule ---');
  let partNow = await call('GET', `/parts/${partId}`);
  check('stock NOT reduced when order is created', partNow.data.quantity === 5, `got ${partNow.data.quantity}`);

  const lineId = order.data.parts[0].id;
  await call('POST', `/orders/${orderId}/parts/${lineId}/use`);
  partNow = await call('GET', `/parts/${partId}`);
  check('stock reduced only after "Part Used" (5 -> 4)', partNow.data.quantity === 4, `got ${partNow.data.quantity}`);

  const afterUse = await call('GET', `/orders/${orderId}`);
  check('part line marked consumed', afterUse.data.parts[0].consumed === true);

  const dbl = await fetch(`${BASE}/orders/${orderId}/parts/${lineId}/use`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  check('cannot consume the same part twice', dbl.status === 409);

  console.log('\n--- movements ---');
  const movements = await call('GET', `/stock/movements?partId=${partId}`);
  const out = movements.data.find((m) => m.type === 'OUT');
  check('stock-out movement has Order ID', out?.orderId === orderId);
  check('stock-out records the new balance', out?.balanceAfter === 4);
  check('stock-out records the user', typeof out?.user === 'string' && out.user.length > 0);

  console.log('\n--- billing ---');
  const over = await fetch(`${BASE}/orders/${orderId}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ amount: 99999, mode: 'Cash' }),
  });
  check('cannot take more than the balance', over.status === 422);

  const negative = await fetch(`${BASE}/orders/${orderId}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ amount: -50, mode: 'Cash' }),
  });
  check('negative payment rejected', negative.status === 422);

  const paid = await call('POST', `/orders/${orderId}/payments`, {
    amount: 2500,
    mode: 'UPI',
    idempotencyKey: `smoke-pay-${stamp}`,
  });
  check('balance becomes 0', paid.data.balance === 0, `got ${paid.data.balance}`);
  check('payment status becomes Paid', paid.data.paymentStatus === 'Paid');

  const dup = await fetch(`${BASE}/orders/${orderId}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ amount: 2500, mode: 'UPI', idempotencyKey: `smoke-pay-${stamp}` }),
  });
  check('duplicate payment blocked', dup.status === 409);

  console.log('\n--- status flow ---');
  for (const status of ['Checking', 'Repairing', 'Ready']) {
    const res = await call('POST', `/orders/${orderId}/status`, { status });
    check(`status -> ${status}`, res.data.status === status);
  }
  const history = (await call('GET', `/orders/${orderId}`)).data.history;
  check('status history recorded with user', history.length >= 4 && history[0].user.length > 0);

  console.log('\n--- consumables on delivery ---');
  const order2 = await call('POST', '/orders', {
    customerName: 'Suresh Patel',
    mobile: '9825012345',
    brand: 'Xiaomi',
    model: 'Note 13',
    complaint: 'Not charging',
    estimatedAmount: 900,
    parts: [{ partId: folder.data.id, quantity: 1, unitPrice: 0 }],
  });
  const folderBefore = (await call('GET', `/parts/${folder.data.id}`)).data.quantity;
  check('folder stock untouched at order creation', folderBefore === 20, `got ${folderBefore}`);

  // A device must be Ready before it goes back to the customer.
  const earlyHandover = await fetch(`${BASE}/orders/${order2.data.id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'Delivered' }),
  });
  check('cannot skip straight to Delivered from Received', earlyHandover.status === 409);

  await call('POST', `/orders/${order2.data.id}/payments`, { amount: 900, mode: 'Cash' });
  for (const status of ['Checking', 'Approved', 'Repairing', 'Ready']) {
    await call('POST', `/orders/${order2.data.id}/status`, { status });
  }
  await call('POST', `/orders/${order2.data.id}/status`, { status: 'Delivered' });
  const delivered = await call('GET', `/orders/${order2.data.id}`);
  check('order marked Delivered', delivered.data.status === 'Delivered');
  check('delivery time recorded', delivered.data.deliveredAt.length > 0);
  const folderAfter = (await call('GET', `/parts/${folder.data.id}`)).data.quantity;
  check('folder consumed on delivery (20 -> 19)', folderAfter === 19, `got ${folderAfter}`);

  console.log('\n--- delivery blocked while balance is due ---');
  const order3 = await call('POST', '/orders', {
    customerName: 'Vikram Shah',
    mobile: '9712345678',
    brand: 'Xiaomi',
    model: 'Note 13',
    complaint: 'Speaker not working',
    estimatedAmount: 700,
  });
  // Ready first, so the block below is genuinely about the money and not
  // about the status rule.
  for (const status of ['Checking', 'Approved', 'Repairing', 'Ready']) {
    await call('POST', `/orders/${order3.data.id}/status`, { status });
  }
  const blocked = await fetch(`${BASE}/orders/${order3.data.id}/deliver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ deliveredTo: '' }),
  });
  check('cannot deliver with money pending', blocked.status === 409);

  console.log('\n--- stock out from the stock screen ---');
  const outRes = await call('POST', '/stock/out', {
    partId,
    quantity: 1,
    reason: 'Used for repair',
    orderId,
  });
  check('stock out works with Order ID', outRes.data.part.quantity === 3, `got ${outRes.data.part.quantity}`);

  const noOrder = await fetch(`${BASE}/stock/out`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ partId, quantity: 1, reason: 'Used for repair' }),
  });
  check('repair stock-out without Order ID is rejected', noOrder.status === 422);

  const tooMuch = await fetch(`${BASE}/stock/out`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ partId, quantity: 999, reason: 'Testing', orderId }),
  });
  check('cannot go below zero stock', tooMuch.status === 422);

  console.log('\n--- return part ---');
  await call('POST', `/orders/${orderId}/parts/${lineId}/return`);
  partNow = await call('GET', `/parts/${partId}`);
  check('returned part goes back to stock', partNow.data.quantity === 4, `got ${partNow.data.quantity}`);

  console.log('\n--- dashboard + search ---');
  const dash = await call('GET', '/dashboard');
  check('dashboard has today repairs', dash.data.todayRepairs >= 3, `got ${dash.data.todayRepairs}`);
  check('dashboard reports low stock count', typeof dash.data.lowStock === 'number');

  const found = await call('GET', '/search?q=rahul');
  check('search finds the customer', found.data.some((h) => h.id === orderId));
  const byMobile = await call('GET', '/search?q=98765');
  check('search finds by mobile number', byMobile.data.length > 0);
  const byPart = await call('GET', '/search?q=a55');
  check('search finds the part', byPart.data.length > 0);

  console.log('\n--- bill ---');
  const pdf = await fetch(`${BASE}/orders/${orderId}/bill.pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const buffer = Buffer.from(await pdf.arrayBuffer());
  check('bill PDF generated', pdf.status === 200 && buffer.subarray(0, 4).toString() === '%PDF');
  check('bill PDF has real content', buffer.length > 2000, `${buffer.length} bytes`);

  const billSave = await call('POST', `/orders/${orderId}/bill/save`);
  check('bill save reports Drive not connected instead of failing', billSave.data.saved === false);

  console.log('\n--- customers ---');
  const customers = await call('GET', '/customers?q=9876543210');
  check('customer found by mobile', customers.data.length === 1);
  const detail = await call('GET', `/customers/${customers.data[0].id}`);
  check(
    'customer shows repair history',
    detail.data.orders.some((entry) => entry.id === orderId),
    `looking for ${orderId}`,
  );

  console.log('\n--- order id uniqueness ---');
  const order4 = await call('POST', '/orders', {
    customerName: 'Rahul Patel',
    mobile: '9876543210',
    brand: 'OnePlus',
    complaint: 'Screen touch issue',
    estimatedAmount: 500,
  });
  check('second order gets the next id', order4.data.id !== orderId, `${order4.data.id} vs ${orderId}`);
  const firstNumber = Number(String(orderId).replace(/\D/g, ''));
  const secondNumber = Number(String(order4.data.id).replace(/\D/g, ''));
  check(
    'ids keep climbing and never repeat',
    secondNumber > firstNumber,
    `${order4.data.id} must come after ${orderId}`,
  );

  console.log('\n--- suppliers ---');
  const supplier = await call('POST', '/suppliers', { name: 'Shreeji Parts', mobile: '9000000000' });
  const updated = await call('PATCH', `/parts/${partId}`, { supplierId: supplier.data.id });
  check('part links to supplier', updated.data.supplierName === 'Shreeji Parts');

  console.log('\n--- sync status ---');
  const sync = await call('GET', '/sync/status');
  check('sync status responds', sync.data.mode === 'local' || sync.data.mode === 'sheets');

  console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nSMOKE TEST ERROR:', error.message);
  process.exit(1);
});

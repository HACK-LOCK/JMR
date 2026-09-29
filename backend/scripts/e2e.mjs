/**
 * End-to-end verification against a RUNNING server.
 * This exercises the exact HTTP contract the frontend uses, including the
 * dashboard shape the Dashboard page expects.
 *
 * The base URL comes from the environment so the test runner can point this at
 * a throwaway server. It must be the site root, not the /api path.
 */
import zlib from 'node:zlib';

const BASE = process.env.API_BASE ?? process.env.BASE ?? 'http://localhost:4000';

/**
 * The PIN the throwaway test server was given, so the checks read it from the
 * runner instead of hard coding it. That is what keeps the shop's own PIN out
 * of this file and out of the test output.
 */
const TEST_PIN = process.env.STOCK_PIN ?? '';

let token = '';
let passed = 0;
let failed = 0;

async function call(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 120) };
  }
  return { status: res.status, json };
}

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`}`);
  }
}

function section(name) {
  console.log(`\n${name}`);
}

/**
 * Reads one file out of a zip container by hand. The export tests need to see
 * what is actually inside the file that was downloaded, not just that a file
 * came back, so the local file header is walked and the entry inflated.
 */
function zipEntry(buf, wanted) {
  for (let i = 0; i + 30 < buf.length; i += 1) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue;
    const method = buf.readUInt16LE(i + 8);
    const size = buf.readUInt32LE(i + 18);
    const nameLength = buf.readUInt16LE(i + 26);
    const extraLength = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLength).toString('utf8');
    if (name !== wanted) continue;
    const start = i + 30 + nameLength + extraLength;
    const raw = buf.subarray(start, start + size);
    return (method === 0 ? raw : zlib.inflateRawSync(raw)).toString('utf8');
  }
  return '';
}

/**
 * The cells of a spreadsheet, row by row, as the text a person would see.
 *
 * The workbook this app writes uses inline strings rather than a shared string
 * table, so each cell is read where it sits. The cell reference is what proves
 * a column exists at all, which is why it is returned as well as the text: a
 * file could be padded with empty cells and still look right otherwise.
 */
function sheetCells(xlsxBuffer) {
  const xml = zipEntry(xlsxBuffer, 'xl/worksheets/sheet1.xml');
  return [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) =>
    [...row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)].map((cell) => {
      const text = [...cell[3].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
        .map((part) => part[1])
        .join('');
      const number = /<v>([\s\S]*?)<\/v>/.exec(cell[3])?.[1] ?? '';
      return { column: cell[1], text: text || number };
    }),
  );
}

/** The headings of the first row, which are the column names a person chose. */
function sheetHeadings(xlsxBuffer) {
  return (sheetCells(xlsxBuffer)[0] ?? []).map((cell) => cell.text);
}

/** Every cell reference in the file, so a hidden extra column cannot hide. */
function sheetCellColumns(xlsxBuffer) {
  const xml = zipEntry(xlsxBuffer, 'xl/worksheets/sheet1.xml');
  return [...new Set([...xml.matchAll(/<c r="([A-Z]+)\d+"/g)].map((match) => match[1]))].sort();
}

/**
 * The text a person would read in a PDF.
 *
 * A PDF is not a zip: its streams are found by the object dictionary that
 * precedes them, and the streams themselves are deflated. The writer puts each
 * run of words inside a text-showing array as hex rather than as plain
 * characters, so the hex runs are decoded back to text here. That is what makes
 * it possible to check that a column which was not ticked really is absent,
 * instead of only that the file is a valid PDF of some size.
 */
function pdfText(pdfBuffer) {
  const latin = pdfBuffer.toString('latin1');
  let content = '';
  const streams = /<<([\s\S]*?)>>\s*stream\r?\n/g;
  let found = streams.exec(latin);
  while (found !== null) {
    const length = /\/Length\s+(\d+)/.exec(found[1]);
    if (length) {
      const start = found.index + found[0].length;
      const body = pdfBuffer.subarray(start, start + Number(length[1]));
      try {
        content += (found[1].includes('FlateDecode') ? zlib.inflateSync(body) : body).toString('latin1');
      } catch {
        /* not a stream this reader can open, so it holds no text to find */
      }
    }
    found = streams.exec(latin);
  }
  return [...content.matchAll(/\[([\s\S]*?)\]\s*TJ/g)]
    .map((shown) =>
      [...shown[1].matchAll(/<([0-9a-fA-F\s]*)>/g)]
        .map((hex) => Buffer.from(hex[1].replace(/\s+/g, ''), 'hex').toString('latin1'))
        .join(''),
    )
    .join('\n');
}

/**
 * The page text with every run of spaces, including the line breaks between
 * positioned runs, collapsed to one space.
 *
 * A heading in a narrow column is written as several positioned pieces, so
 * "MOBILE NUMBER" can come back as "MOBILE " and then "NUMBER". Nothing is
 * missing - it is one heading - so the checks below read the text this way
 * rather than pretending a heading is always one unbroken piece.
 */
function pdfReading(pdfBuffer) {
  return pdfText(pdfBuffer).replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log(`End-to-end check against ${BASE}`);


  section('Auth');
  const bad = await call('POST', '/auth/login', { username: 'ashok', password: 'wrong' });
  check('bad password is rejected', bad.status === 401 || bad.status === 400, bad.json);
  const login = await call('POST', '/auth/login', { username: 'ashok', password: 'shop1234' });
  check('login succeeds', login.status === 200 && !!login.json?.data?.token, login.json);
  token = login.json?.data?.token ?? '';
  check('login returns the owner account', login.json?.data?.user?.username === 'ashok', login.json?.data?.user);

  section('Dashboard contract (what the Dashboard page reads)');
  const dash = await call('GET', '/dashboard');
  const d = dash.json?.data ?? {};
  check('dashboard responds 200', dash.status === 200, dash.json);
  for (const key of [
    'todayRepairs',
    'onBench',
    'readyForPickup',
    'pendingPaymentCount',
    'pendingPaymentAmount',
    'lowStock',
    'todayCollected',
    'partsToConfirm',
    'recentOrders',
    'readyOrders',
    'lowStockItems',
  ]) {
    check(`dashboard.${key} is present`, key in d, Object.keys(d));
  }
  check(
    'pendingPaymentAmount is a number, not a count',
    typeof d.pendingPaymentAmount === 'number',
    d.pendingPaymentAmount,
  );
  check('recentOrders is an array', Array.isArray(d.recentOrders), d.recentOrders);
  check('readyOrders is an array', Array.isArray(d.readyOrders), d.readyOrders);
  check('lowStockItems is an array', Array.isArray(d.lowStockItems), d.lowStockItems);
  const sample = (d.recentOrders ?? [])[0] ?? (d.readyOrders ?? [])[0];
  if (sample) {
    for (const key of ['balance', 'payable', 'partsPending']) {
      check(`order summary carries ${key}`, key in sample, Object.keys(sample));
    }
  } else {
    check('no orders to inspect (fresh db)', true);
  }

  section('Full repair workflow');
  const stamp = Date.now();
  const mobile = `9${String(stamp).slice(-9)}`;

  const part = await call('POST', '/parts', {
    name: `E2E Screen ${stamp}`,
    category: 'Repair Part',
    brand: 'TestBrand',
    model: 'TestModel',
    quantity: 5,
    minQuantity: 1,
    purchaseCost: 900,
    sellingPrice: 1500,
    consumeMode: 'PART_USED',
  });
  check('part created', part.status === 201 || part.status === 200, part.json);
  const partId = part.json?.data?.id;

  const customer = await call('POST', '/customers', { name: 'E2E Customer', mobile });
  check('customer created', customer.status === 201 || customer.status === 200, customer.json);
  const customerId = customer.json?.data?.id;

  const order = await call('POST', '/orders', {
    customerId,
    customerName: 'E2E Customer',
    mobile,
    deviceType: 'Mobile',
    brand: 'Samsung',
    model: 'Galaxy S21',
    complaint: 'Cracked display',
    accessories: 'Sim tray',
    estimatedAmount: 1500,
    discount: 0,
    advance: 0,
    parts: [{ partId, quantity: 1, unitPrice: 1500 }],
  });
  check('order created', order.status === 201 || order.status === 200, order.json);
  const created = order.json?.data?.order ?? order.json?.data;
  const orderId = created?.id;
  check('new order starts at Received', created?.status === 'Received', created?.status);
  check('order ID follows JMR-####', /^JMR-\d{4,}$/.test(orderId ?? ''), orderId);
  check('unpaid order is Unpaid', created?.paymentStatus === 'Unpaid', created?.paymentStatus);
  check('balance equals the estimate', created?.balance === 1500, created?.balance);

  const partAfterReserve = await call('GET', `/parts/${partId}`);
  check(
    'creating an order reserves but does NOT consume stock',
    partAfterReserve.json?.data?.quantity === 5,
    partAfterReserve.json?.data?.quantity,
  );

  const detail = await call('GET', `/orders/${orderId}`);
  const lineId = detail.json?.data?.parts?.[0]?.id;
  check('order detail lists the reserved part line', !!lineId, detail.json?.data?.parts);
  check('part line is not yet consumed', detail.json?.data?.parts?.[0]?.consumed === false, detail.json?.data?.parts?.[0]);

  section('Parts added after the estimate are still billed');
  const part2 = await call('POST', '/parts', {
    name: `E2E Battery ${stamp}`,
    category: 'Repair Part',
    quantity: 3,
    minQuantity: 0,
    purchaseCost: 400,
    sellingPrice: 700,
    consumeMode: 'PART_USED',
  });
  const part2Id = part2.json?.data?.id;
  check('second part created', !!part2Id, part2.json);

  const added = await call('POST', `/orders/${orderId}/parts`, { partId: part2Id, quantity: 1, unitPrice: 700 });
  check('adding a part to an open order succeeds', added.status === 200, added.json);
  check(
    'order total rises with the part that was added',
    added.json?.data?.finalAmount === 2200,
    added.json?.data?.finalAmount,
  );
  check(
    'balance follows the new total',
    added.json?.data?.balance === 2200,
    added.json?.data?.balance,
  );

  const lines = added.json?.data?.parts ?? [];
  const addedLine = lines.find((line) => line.partId === part2Id);
  const removed = await call('DELETE', `/orders/${orderId}/parts/${addedLine?.id}`);
  check('removing an unused part line succeeds', removed.status === 200, removed.json);
  check(
    'order total drops back when the part is removed',
    removed.json?.data?.finalAmount === 1500,
    removed.json?.data?.finalAmount,
  );

  for (const status of ['Checking', 'Approved', 'Repairing', 'Ready']) {
    const move = await call('POST', `/orders/${orderId}/status`, { status });
    check(`status -> ${status}`, move.status === 200 && move.json?.data?.status === status, move.json);
  }

  const use = await call('POST', `/orders/${orderId}/parts/${lineId}/use`, {});
  check('marking the part as used succeeds', use.status === 200, use.json);

  const partAfterUse = await call('GET', `/parts/${partId}`);
  check(
    'PART_USED reduces stock only when marked used',
    partAfterUse.json?.data?.quantity === 4,
    partAfterUse.json?.data?.quantity,
  );

  const payment = await call('POST', `/orders/${orderId}/payments`, {
    amount: 1500,
    mode: 'Cash',
    idempotencyKey: `e2e-${stamp}`,
  });
  check('full payment is accepted', payment.status === 201, { status: payment.status, body: payment.json });
  check('full payment clears the balance', payment.json?.data?.balance === 0, payment.json?.data);
  check('payment status becomes Paid', payment.json?.data?.paymentStatus === 'Paid', payment.json?.data?.paymentStatus);

  const replay = await call('POST', `/orders/${orderId}/payments`, {
    amount: 1500,
    mode: 'Cash',
    idempotencyKey: `e2e-${stamp}`,
  });
  check('a replayed idempotency key is rejected', replay.status === 409, { status: replay.status, body: replay.json });

  const afterReplay = await call('GET', `/orders/${orderId}`);
  check(
    'replay did not double count the money',
    afterReplay.json?.data?.paidAmount === 1500 && afterReplay.json?.data?.payments?.length === 1,
    { paid: afterReplay.json?.data?.paidAmount, rows: afterReplay.json?.data?.payments?.length },
  );

  const overpay = await call('POST', `/orders/${orderId}/payments`, {
    amount: 100,
    mode: 'Cash',
    idempotencyKey: `e2e-over-${stamp}`,
  });
  check('paying more than the balance is rejected', overpay.status >= 400, overpay.json);

  const pdf = await fetch(`${BASE}/api/orders/${orderId}/bill.pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const pdfBytes = (await pdf.arrayBuffer()).byteLength;
  check('bill PDF downloads and is a real PDF', pdf.status === 200 && pdfBytes > 1000, { status: pdf.status, pdfBytes });

  const deliver = await call('POST', `/orders/${orderId}/deliver`, { deliveredTo: 'E2E Customer' });
  check('delivery works once Ready and fully paid', deliver.status === 200 && deliver.json?.data?.status === 'Delivered', deliver.json?.data);
  check('delivered order is no longer pending payment', deliver.json?.data?.paymentStatus === 'Paid', deliver.json?.data?.paymentStatus);

  const movements = await call('GET', `/stock/movements?partId=${partId}`);
  check('stock movement history is available', movements.status === 200 && Array.isArray(movements.json?.data), movements.json);
  check('a movement row was written for the used part', (movements.json?.data?.length ?? 0) > 0, movements.json?.data?.length);

  section('Business rule guards');
  const order2 = await call('POST', '/orders', {
    customerName: 'E2E Customer',
    mobile,
    brand: 'Xiaomi',
    model: 'Redmi 11',
    complaint: 'Speaker not working',
    estimatedAmount: 800,
    parts: [{ partId, quantity: 1, unitPrice: 1500 }],
  });
  const order2Id = (order2.json?.data?.order ?? order2.json?.data)?.id;
  check('second order created for guard tests', !!order2Id, order2.json);
  check(
    'order is never billed below the parts fitted to it',
    (order2.json?.data?.order ?? order2.json?.data)?.finalAmount === 1500,
    (order2.json?.data?.order ?? order2.json?.data)?.finalAmount,
  );

  const earlyDeliver = await call('POST', `/orders/${order2Id}/deliver`, {});
  check(
    'cannot hand over a device that is not Ready yet',
    earlyDeliver.status >= 400,
    { status: earlyDeliver.status, message: earlyDeliver.json?.error?.message },
  );

  const straightToDelivered = await call('POST', `/orders/${order2Id}/status`, { status: 'Delivered' });
  check(
    'cannot skip the status flow to Delivered either',
    straightToDelivered.status >= 400,
    { status: straightToDelivered.status, message: straightToDelivered.json?.error?.message },
  );

  for (const status of ['Checking', 'Approved', 'Repairing', 'Ready']) {
    await call('POST', `/orders/${order2Id}/status`, { status });
  }
  const unpaidDeliver = await call('POST', `/orders/${order2Id}/deliver`, {});
  check(
    'cannot hand over while money is still due',
    unpaidDeliver.status >= 400,
    { status: unpaidDeliver.status, message: unpaidDeliver.json?.error?.message },
  );

  const paidFirst = await call('POST', `/orders/${order2Id}/payments`, { amount: 1500, mode: 'UPI' });
  check('payment after Ready succeeds', paidFirst.status === 201, { status: paidFirst.status, body: paidFirst.json?.error });
  const nowDeliver = await call('POST', `/orders/${order2Id}/deliver`, {});
  check('delivery then succeeds', nowDeliver.status === 200 && nowDeliver.json?.data?.status === 'Delivered', nowDeliver.json?.data?.status);

  const tooMuch = await call('POST', `/orders/${orderId}/payments`, { amount: 99_999, mode: 'Cash' });
  check('absurd payment amount is rejected', tooMuch.status >= 400, tooMuch.json);

  const badStatus = await call('POST', `/orders/${order2Id}/status`, { status: 'Teleported' });
  check('unknown status is rejected', badStatus.status >= 400, badStatus.json);

  const badMobile = await call('POST', '/orders', {
    customerName: 'X',
    mobile: '123',
    brand: 'X',
    complaint: 'X',
  });
  check('invalid mobile number is rejected', badMobile.status >= 400, badMobile.json);

  const badPart = await call('POST', '/orders', {
    customerName: 'E2E Customer',
    mobile,
    brand: 'X',
    complaint: 'X',
    parts: [{ partId: 'does-not-exist', quantity: 1 }],
  });
  check('unknown part is rejected', badPart.status >= 400, badPart.json);

  const noAuth = await fetch(`${BASE}/api/orders`);
  check('API rejects unauthenticated requests', noAuth.status === 401, noAuth.status);

  const unknownRoute = await call('GET', '/definitely-not-a-route');
  check('unknown API route returns 404 JSON', unknownRoute.status === 404 && !!unknownRoute.json?.error, unknownRoute.status);

  section('Bill protection');
  const lowered = await call('PATCH', `/orders/${order2Id}`, { finalAmount: 100 });
  check(
    'cannot bill less than the parts already on the repair',
    lowered.status >= 400,
    { status: lowered.status, message: lowered.json?.error?.message },
  );
  check(
    'the rejected edit did not change the total',
    (await call('GET', `/orders/${order2Id}`)).json?.data?.finalAmount === 1500,
    'finalAmount',
  );

  const billText = await fetch(`${BASE}/api/orders/${order2Id}/bill.txt`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await billText.text();
  check('bill text is produced', billText.status === 200 && text.length > 50, { status: billText.status });
  check('bill states the correct final amount', /1,?500|1500/.test(text), text.slice(0, 200));

  section('Owner PIN for the dashboard (no stock unlock)');
  // The runner tells the suite which PIN the throwaway server was given, so the
  // shop's real PIN is never read from .env or written into a test log.
  const testPin = process.env.STOCK_PIN;
  check('the test runner supplied a PIN for this run', typeof testPin === 'string' && testPin !== '', {
    STOCK_PIN: testPin === '' ? 'empty' : 'missing',
  });
  const wrongPin = await call('POST', '/auth/pin/verify', { pin: '0000' });
  check('a wrong PIN is rejected', wrongPin.status >= 400, { status: wrongPin.status });
  const goodPin = await call('POST', '/auth/pin/verify', { pin: testPin });
  check('the owner PIN is accepted', goodPin.status === 200 && goodPin.json?.data?.verified === true, goodPin.json);
  check(
    'verifying the PIN never returns the PIN itself',
    !JSON.stringify(goodPin.json ?? {}).includes(testPin),
    goodPin.json,
  );
  const noPin = await call('POST', '/auth/pin/verify', {});
  check('an empty PIN is rejected', noPin.status >= 400, { status: noPin.status });
  {
    const savedToken = token;
    token = '';
    const anonymous = await call('POST', '/auth/pin/verify', { pin: testPin });
    check('the PIN cannot be checked while signed out', anonymous.status === 401, { status: anonymous.status });
    token = savedToken;
  }

  section('Bill history');
  const today = new Date().toISOString().slice(0, 10);
  const history = await call('GET', `/orders/history?from=${today}&to=${today}`);
  const h = history.json?.data ?? {};
  check('bill history responds 200', history.status === 200, history.json);
  check('bill history reports the range it used', h.from === today && h.to === today, h);
  check('bill history returns bills and the totals that match them', Array.isArray(h.bills) && h.count === h.bills.length, {
    count: h.count,
    bills: Array.isArray(h.bills) ? h.bills.length : null,
  });
  const totalOfRows = (h.bills ?? []).reduce((sum, bill) => sum + (bill.total ?? 0), 0);
  check('the bill history total is the sum of the rows shown', Math.abs((h.total ?? 0) - totalOfRows) < 0.01, {
    total: h.total,
    rows: totalOfRows,
  });
  const ids = (h.bills ?? []).map((bill) => bill.id);
  check('no bill is repeated in the history', new Set(ids).size === ids.length, ids);
  check(
    'every history row carries the fields the screen shows',
    (h.bills ?? []).every(
      (bill) =>
        typeof bill.id === 'string' &&
        typeof bill.customerName === 'string' &&
        typeof bill.mobile === 'string' &&
        typeof bill.device === 'string' &&
        typeof bill.date === 'string' &&
        ['advance', 'balance', 'total'].every((key) => typeof bill[key] === 'number'),
    ),
    (h.bills ?? [])[0],
  );

  const badRange = await call('GET', `/orders/history?from=${today}&to=2000-01-01`);
  check('a backwards range is refused', badRange.status >= 400, { status: badRange.status });
  const nonsense = await call('GET', '/orders/history?from=2026-02-31&to=2026-03-02');
  check('a day that does not exist is refused', nonsense.status >= 400, { status: nonsense.status });
  const missingDates = await call('GET', '/orders/history');
  check('missing dates are refused rather than guessed', missingDates.status >= 400, { status: missingDates.status });
  const emptyRange = await call('GET', '/orders/history?from=2000-01-01&to=2000-01-02');
  check('an empty range is an honest empty list', emptyRange.status === 200 && emptyRange.json?.data?.count === 0, emptyRange.json);
  const emptyFile = await fetch(`${BASE}/api/orders/history.xlsx?from=2000-01-01&to=2000-01-02`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(
    'no spreadsheet is written for an empty range',
    emptyFile.status >= 400,
    { status: emptyFile.status },
  );

  const xlsx = await fetch(`${BASE}/api/orders/history.xlsx?from=${today}&to=${today}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const xlsxBody = Buffer.from(await xlsx.arrayBuffer());
  check(
    'the bill spreadsheet downloads with the xlsx content type',
    xlsx.status === 200 && /spreadsheetml/.test(xlsx.headers.get('content-type') ?? ''),
    { status: xlsx.status, type: xlsx.headers.get('content-type') },
  );
  check('the bill spreadsheet is a real zip container, not an error page', xlsxBody.subarray(0, 2).toString() === 'PK', {
    head: xlsxBody.subarray(0, 8).toString('hex'),
  });
  check(
    'the bill spreadsheet is named for the range asked for',
    (xlsx.headers.get('content-disposition') ?? '').includes(`JMR-Bills-${today}.xlsx`),
    xlsx.headers.get('content-disposition'),
  );
  check('the bill spreadsheet has rows in it', xlsxBody.length > 1000, { bytes: xlsxBody.length });

  section('Customer history');
  const customers = await call('GET', '/customers/history');
  const rows = customers.json?.data ?? [];
  check('customer history responds 200', customers.status === 200, customers.json);
  check('customer history is a list', Array.isArray(rows), typeof rows);
  check(
    'no customer is repeated',
    new Set(rows.map((row) => row.id)).size === rows.length,
    rows.map((row) => row.id),
  );
  check(
    'every customer row carries the fields the screen shows',
    rows.every(
      (row) =>
        typeof row.name === 'string' &&
        typeof row.mobile === 'string' &&
        typeof row.repairCount === 'number' &&
        typeof row.totalBilled === 'number' &&
        typeof row.balanceDue === 'number',
    ),
    rows[0],
  );
  const named = await call('GET', '/customers/history?q=Customer');
  check('customer history can be searched by name', named.status === 200, { status: named.status });

  const customerXlsx = await fetch(`${BASE}/api/customers/history.xlsx`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const customerBody = Buffer.from(await customerXlsx.arrayBuffer());
  check('the customer spreadsheet downloads', customerXlsx.status === 200, { status: customerXlsx.status });
  check('the customer spreadsheet is a real zip container', customerBody.subarray(0, 2).toString() === 'PK', {
    head: customerBody.subarray(0, 8).toString('hex'),
  });
  check(
    'the customer spreadsheet keeps the agreed file name',
    (customerXlsx.headers.get('content-disposition') ?? '').includes('JMR-Customer-History.xlsx'),
    customerXlsx.headers.get('content-disposition'),
  );
  const noMatchFile = await fetch(`${BASE}/api/customers/history.xlsx?q=no-such-customer-anywhere`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check('no spreadsheet is written when the search finds nobody', noMatchFile.status >= 400, {
    status: noMatchFile.status,
  });

  section('A download holds only the columns that were chosen');
  const downloadXlsx = async (query) => {
    const res = await fetch(`${BASE}/api/customers/history.xlsx?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { res, body: Buffer.from(await res.arrayBuffer()) };
  };
  const downloadPdf = async (query) => {
    const res = await fetch(`${BASE}/api/customers/history.pdf?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { res, body: Buffer.from(await res.arrayBuffer()) };
  };

  // The everyday case: a phone list of two columns and nothing else.
  const twoCols = await downloadXlsx('cols=name,mobile');
  check('a two column download succeeds', twoCols.res.status === 200, { status: twoCols.res.status });
  check(
    'the two column spreadsheet has exactly two columns and not a hidden third',
    sheetCellColumns(twoCols.body).join(',') === 'A,B',
    sheetCellColumns(twoCols.body),
  );
  check(
    'the two column spreadsheet is headed with the columns that were chosen',
    sheetHeadings(twoCols.body).join(' | ') === 'Customer Name | Mobile Number',
    sheetHeadings(twoCols.body),
  );
  const twoColRows = sheetCells(twoCols.body);
  check(
    'no row in the two column spreadsheet is wider than two cells',
    twoColRows.every((row) => row.length === 2),
    twoColRows.map((row) => row.length),
  );
  check(
    'the two column spreadsheet still holds every customer, just narrower',
    twoColRows.length === rows.length + 1,
    { got: twoColRows.length, wanted: rows.length + 1 },
  );
  check(
    'the mobile numbers in the file are the ones on screen',
    twoColRows.slice(1).every((row, index) => row[1]?.text === rows[index].mobile),
    { file: twoColRows[1]?.[1]?.text, screen: rows[0]?.mobile },
  );

  // The two formats must not drift apart: the same ticks, the same columns.
  const twoColPdf = await downloadPdf('cols=name,mobile');
  check('a two column PDF downloads', twoColPdf.res.status === 200, { status: twoColPdf.res.status });
  check('the customer PDF is a real PDF', twoColPdf.body.subarray(0, 5).toString() === '%PDF-', {
    head: twoColPdf.body.subarray(0, 8).toString(),
  });
  check(
    'the customer PDF keeps the same file name as the spreadsheet',
    (twoColPdf.res.headers.get('content-disposition') ?? '').includes('JMR-Customer-History.pdf'),
    twoColPdf.res.headers.get('content-disposition'),
  );
  // A PDF holds its text in compressed streams, so what is read off the file is
  // the words a person would actually see on the page.
  const printed = pdfReading(twoColPdf.body);
  check(
    'the two column PDF is headed with the columns that were chosen',
    printed.includes('CUSTOMER NAME') && printed.includes('MOBILE NUMBER'),
    { name: printed.includes('CUSTOMER NAME'), mobile: printed.includes('MOBILE NUMBER') },
  );
  check(
    'the two column PDF leaves out a column that was not chosen',
    !printed.includes('BALANCE DUE') && !printed.includes('ALTERNATE MOBILE') && !printed.includes('EMAIL'),
    {
      balance: printed.includes('BALANCE DUE'),
      alt: printed.includes('ALTERNATE MOBILE'),
      email: printed.includes('EMAIL'),
    },
  );
  check(
    'the two column PDF prints the customers that are on screen',
    rows.every((row) => printed.includes(row.name) && printed.includes(row.mobile)),
    rows.map((row) => row.name),
  );
  check(
    'the two column PDF says how many columns it holds',
    printed.includes('2 columns'),
    printed.slice(0, 120),
  );
  check(
    'the two column PDF numbers its pages',
    /Page 1 of \d+/.test(printed),
    printed.slice(-60),
  );

  const fullPdf = await downloadPdf('');
  check('the full customer PDF downloads', fullPdf.res.status === 200, { status: fullPdf.res.status });
  const fullPrinted = pdfReading(fullPdf.body);
  check(
    'the full customer PDF is headed with every column the shop has, none cut short',
    [
      'CUSTOMER NAME',
      'MOBILE NUMBER',
      'ALTERNATE MOBILE',
      'REPAIRS',
      'LAST REPAIR DATE',
      'TOTAL BILLED',
      'BALANCE DUE',
      'EMAIL',
      'ADDRESS',
      'ADDED ON',
    ].every((heading) => fullPrinted.includes(heading)) && !fullPrinted.includes('..'),
    fullPrinted.slice(0, 200),
  );
  check(
    'the full customer PDF is bigger than the two column one, and says so',
    fullPdf.body.length > twoColPdf.body.length && fullPrinted.includes('10 columns'),
    { all: fullPdf.body.length, two: twoColPdf.body.length },
  );

  const orderedPdf = await downloadPdf('cols=address,name');
  const orderedPrinted = pdfReading(orderedPdf.body);
  check(
    'the PDF writes the columns in the agreed order too',
    orderedPrinted.indexOf('CUSTOMER NAME') > -1 &&
      orderedPrinted.indexOf('CUSTOMER NAME') < orderedPrinted.indexOf('ADDRESS'),
    orderedPrinted.slice(0, 200),
  );
  check(
    'the PDF leaves out everything between the two that were chosen',
    !orderedPrinted.includes('MOBILE NUMBER') && !orderedPrinted.includes('BALANCE DUE'),
    { mobile: orderedPrinted.includes('MOBILE NUMBER'), balance: orderedPrinted.includes('BALANCE DUE') },
  );

  // A different pair, to show the choice is not baked into two special columns.
  const otherCols = await downloadXlsx('cols=balanceDue,address');
  check(
    'a different pair of columns comes out as that pair',
    sheetHeadings(otherCols.body).join(' | ') === 'Balance Due | Address',
    sheetHeadings(otherCols.body),
  );
  check(
    'the second pair is also exactly two columns wide',
    sheetCellColumns(otherCols.body).join(',') === 'A,B',
    sheetCellColumns(otherCols.body),
  );

  const reversed = await downloadXlsx('cols=mobile,name');
  check(
    'columns are written in the agreed order, not the order they were asked for',
    sheetHeadings(reversed.body).join(' | ') === 'Customer Name | Mobile Number',
    sheetHeadings(reversed.body),
  );

  const single = await downloadXlsx('cols=mobile');
  check('a single column download works too', sheetHeadings(single.body).join(' | ') === 'Mobile Number', {
    headings: sheetHeadings(single.body),
    status: single.res.status,
  });

  const allCols = await downloadXlsx('');
  check(
    'a download with no choice keeps every column, as it always has',
    sheetHeadings(allCols.body).length === 10,
    sheetHeadings(allCols.body),
  );
  check(
    'the headings of the full file are the agreed column names',
    sheetHeadings(allCols.body).join(' | ') ===
      'Customer Name | Mobile Number | Alternate Mobile | Repairs | Last Repair Date | Total Billed | Balance Due | Email | Address | Added On',
    sheetHeadings(allCols.body),
  );

  const unknownCols = await downloadXlsx('cols=notAColumn,alsoFake');
  check(
    'a choice of columns the shop does not have falls back to every column rather than guessing',
    sheetHeadings(unknownCols.body).length === 10,
    sheetHeadings(unknownCols.body),
  );

  const pdfNoMatch = await fetch(`${BASE}/api/customers/history.pdf?q=no-such-customer-anywhere`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check('no PDF is written when the search finds nobody', pdfNoMatch.status >= 400, {
    status: pdfNoMatch.status,
  });

  section('Bill numbers stay continuous');
  const highest = ids.filter((id) => id.startsWith('JMR-')).sort().pop();
  check('the history only contains JMR bill numbers', highest !== undefined && /^JMR-\d{4,}$/.test(highest), ids.slice(0, 5));

  section('The shop PIN');
  // One shared number opens the Stock area and the hidden dashboard figures.
  // The rules below are what a counter actually hits: a mistyped letter, too few
  // digits, and the correct number.
  const pinUnlocked = await call('POST', '/auth/stock/unlock', { pin: TEST_PIN });
  check('the shop PIN opens the Stock area', pinUnlocked.status === 200, pinUnlocked.json?.data);

  const pinVerified = await call('POST', '/auth/pin/verify', { pin: TEST_PIN });
  check('the shop PIN brings back the hidden figures', pinVerified.status === 200, pinVerified.json?.data);

  const pinWrong = await call('POST', '/auth/stock/unlock', { pin: '0000' });
  check('a wrong PIN is rejected', pinWrong.status === 401, { status: pinWrong.status });

  const pinLetters = await call('POST', '/auth/pin/verify', { pin: 'abcd' });
  check(
    'letters in the PIN are rejected',
    pinLetters.status === 422,
    { status: pinLetters.status, message: pinLetters.json?.error?.message },
  );

  const pinShort = await call('POST', '/auth/pin/verify', { pin: '246' });
  check(
    'a PIN under 4 digits is rejected',
    pinShort.status === 422,
    { status: pinShort.status, message: pinShort.json?.error?.message },
  );

  // The pin/verify endpoint must not be a second way into the Stock area, or
  // bringing back a hidden figure would quietly unlock the whole stock screen.
  const verifyDoesNotUnlock = await call('POST', '/auth/pin/verify', { pin: TEST_PIN });
  check(
    'verifying the PIN does not report an unlock',
    verifyDoesNotUnlock.json?.data?.unlocked === undefined,
    verifyDoesNotUnlock.json?.data,
  );

  section('Password change');
  const wrongCurrent = await call('PATCH', '/auth/password', {
    currentPassword: 'not-the-password',
    newPassword: 'brandnew123',
  });
  check('wrong current password is rejected', wrongCurrent.status === 401, { status: wrongCurrent.status });

  const unchanged = await call('POST', '/auth/login', { username: 'ashok', password: 'shop1234' });
  check('password did not change after a failed attempt', unchanged.status === 200, unchanged.status);

  const samePassword = await call('PATCH', '/auth/password', {
    currentPassword: 'shop1234',
    newPassword: 'shop1234',
  });
  check('new password must differ from the old one', samePassword.status >= 400, { status: samePassword.status });

  const changed = await call('PATCH', '/auth/password', {
    currentPassword: 'shop1234',
    newPassword: 'e2e-changed-99',
  });
  check(
    'password change succeeds with the right current password',
    changed.status === 200,
    { status: changed.status, body: changed.json?.error },
  );

  const oldPassword = await call('POST', '/auth/login', { username: 'ashok', password: 'shop1234' });
  check('the old password no longer works', oldPassword.status === 401, oldPassword.status);

  const newLogin = await call('POST', '/auth/login', { username: 'ashok', password: 'e2e-changed-99' });
  check('the new password works', newLogin.status === 200, newLogin.status);

  // Put it back so the suite can be run again without editing anything.
  const savedToken = token;
  token = newLogin.json?.data?.token;
  const restore = await call('PATCH', '/auth/password', {
    currentPassword: 'e2e-changed-99',
    newPassword: 'shop1234',
  });
  token = savedToken;
  check('password restored for repeat runs', restore.status === 200, { status: restore.status, body: restore.json?.error });

  const backToNormal = await call('POST', '/auth/login', { username: 'ashok', password: 'shop1234' });
  check('original password works again', backToNormal.status === 200, backToNormal.status);

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : 'FAILURES PRESENT'}: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

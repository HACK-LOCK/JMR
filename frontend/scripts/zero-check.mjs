/**
 * Zero amount bills, checked in a real browser against the real server.
 *
 * Follows the same CDP approach as pin-check.mjs: Chrome is launched with a
 * remote debugging port and driven over the DevTools protocol, so this needs
 * no browser-automation dependency.
 *
 * Usage: npm run dev, then in another terminal: node frontend/scripts/zero-check.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_URL ?? 'http://localhost:5173';
const USERNAME = process.env.TEST_USERNAME ?? 'ashok';
const PASSWORD = process.env.TEST_PASSWORD ?? 'shop1234';
const DEBUG_PORT = Number(process.env.ZERO_CHECK_PORT ?? 9333);

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) ?? null;
}

const browser = findBrowser();
if (!browser) {
  console.error('  No Chrome or Edge found.');
  process.exit(1);
}

let token = '';
try {
  const res = await fetch(`${APP}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  token = (await res.json())?.data?.token ?? '';
  if (!res.ok || !token) throw new Error(`login gave ${res.status}`);
} catch {
  console.error(`  No dev server on ${APP}. Start it with: npm run dev`);
  process.exit(1);
}

const stamp = Date.now();
const api = async (method, path, body) => {
  const res = await fetch(`${APP}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const orderOf = (res) => res.json?.data?.order ?? res.json?.data;

const profile = mkdtempSync(join(tmpdir(), 'jmr-zero-check-'));
let checkCount = 0;
let failures = 0;
const chrome = spawn(browser, [
  '--headless=new',
  `--remote-debugging-port=${DEBUG_PORT}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1400,1000',
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });

let socket;
let nextId = 1;
const pending = new Map();

function send(method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise((res, rej) => {
    pending.set(id, { resolve: res, reject: rej });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

function check(label, passed, detail) {
  checkCount += 1;
  if (passed) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${String(detail).replace(/\s+/g, ' ').slice(0, 220)}`);
  }
}

try {
  let version = null;
  for (let attempt = 0; attempt < 40 && !version; attempt += 1) {
    await sleep(250);
    try {
      version = await (await fetch(`http://localhost:${DEBUG_PORT}/json/version`)).json();
    } catch {
      /* the browser is still starting */
    }
  }
  if (!version) throw new Error('the browser never opened its debugger');

  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    socket.onopen = res;
    socket.onerror = rej;
  });
  socket.onmessage = (message) => {
    const msg = JSON.parse(message.data);
    if (msg.id && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
      else entry.resolve(msg.result);
    }
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Page.navigate', { url: APP }, sessionId);
  await sleep(2500);
  await send('Runtime.evaluate', { expression: `localStorage.setItem('jmmr.token', ${JSON.stringify(token)})` }, sessionId);

  async function evaluate(expression) {
    const result = await send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed');
    }
    return result.result?.value;
  }

  async function goto(path) {
    await send('Page.navigate', { url: APP + path }, sessionId);
    await sleep(2200);
  }

  const text = () => evaluate('document.body.innerText');

  /** Clicks the element whose trimmed text is exactly the given label. */
  async function clickExact(label) {
    return evaluate(`(() => {
      const el = [...document.querySelectorAll('button, a, [role="button"], span, div')]
        .find((n) => n.children.length === 0 && n.textContent.trim() === ${JSON.stringify(label)});
      if (!el) return false;
      el.scrollIntoView();
      el.click();
      return true;
    })()`);
  }

  /**
   * Clicks one of the three money figures. They are buttons whose accessible
   * name starts with the figure's own label ("Paid Rs.0. Take or change"), which
   * is what separates them from the payment badge that also reads "Paid".
   */
  async function clickMoney(label) {
    return evaluate(`(() => {
      const btn = [...document.querySelectorAll('button[aria-label]')]
        .find((n) => n.getAttribute('aria-label').startsWith(${JSON.stringify(label)}));
      if (!btn) return 'no ' + ${JSON.stringify(label)} + ' figure';
      btn.scrollIntoView();
      btn.click();
      return 'clicked';
    })()`);
  }

  /** The payment sheet is open only when its own amount field is in the DOM. */
  async function sheetOpen() {
    return evaluate(`!!document.getElementById('payment-amount')`);
  }

  async function fillAmount(value) {
    return evaluate(`(() => {
      const box = document.getElementById('payment-amount');
      if (!box) return 'no payment-amount box';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(box, ${JSON.stringify(value)});
      box.dispatchEvent(new Event('input', { bubbles: true }));
      return box.value;
    })()`);
  }

  async function saveSheet() {
    return evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')]
        .find((n) => /^save payment$/i.test(n.textContent.trim()));
      if (!btn) return 'no Save Payment button';
      btn.click();
      return 'clicked';
    })()`);
  }

  // ---------------------------------------------------------------- setup
  const unpriced = await api('POST', '/orders', {
    customerName: 'Zero UI Probe',
    mobile: `92${String(stamp).slice(-8)}`,
    brand: 'Probe',
    model: 'Unpriced',
    complaint: 'nobody knows the price yet',
    estimatedAmount: 0,
    parts: [],
  });
  const unpricedId = orderOf(unpriced)?.id;
  const priced = await api('POST', '/orders', {
    customerName: 'Priced UI Probe',
    mobile: `91${String(stamp).slice(-8)}`,
    brand: 'Probe',
    model: 'Priced',
    complaint: 'quoted 800',
    estimatedAmount: 800,
    parts: [],
  });
  const pricedId = orderOf(priced)?.id;

  // ------------------------------------------- an unpriced bill reads plainly
  await goto('/orders/' + unpricedId);
  const unpricedText = await text();
  check('an unpriced bill shows a No Amount Yet badge', /No Amount Yet/.test(unpricedText ?? ''));
  check('an unpriced bill is not labelled Paid', !/^Paid$/m.test(unpricedText ?? ''), unpricedText?.slice(0, 200));
  check('an unpriced bill is not labelled Unpaid', !/^Unpaid$/m.test(unpricedText ?? ''), unpricedText?.slice(0, 200));
  const unpricedColour = await evaluate(`(() => {
    const el = [...document.querySelectorAll('*')].find((n) => n.children.length === 0 && n.textContent.trim() === 'Unpaid');
    return el ? getComputedStyle(el).color : 'absent';
  })()`);
  check('an unpriced bill carries no red Unpaid badge', unpricedColour === 'absent', unpricedColour);

  // A priced bill still gets the red Unpaid badge, so the change is scoped.
  await goto('/orders/' + pricedId);
  const pricedText = await text();
  check('a genuinely unpaid bill still says Unpaid', /^Unpaid$/m.test(pricedText ?? ''), pricedText?.slice(0, 200));
  check('a genuinely unpaid bill does not claim No Amount Yet', !/No Amount Yet/.test(pricedText ?? ''));
  const pricedColour = await evaluate(`(() => {
    const el = [...document.querySelectorAll('*')].find((n) => n.children.length === 0 && n.textContent.trim() === 'Unpaid');
    return el ? getComputedStyle(el).color : 'absent';
  })()`);
  check('the Unpaid badge on a priced bill is still red', pricedColour !== 'absent', pricedColour);

  // ------------------------------------------------- typing 0 into the sheet
  check('the Paid figure opens the payment sheet', (await clickMoney('Paid')) === 'clicked');
  await sleep(700);
  check('the payment sheet is open', await sheetOpen());

  const emptyFill = await fillAmount('');
  check('the sheet has an Amount Received box', emptyFill === '', emptyFill);
  const emptySave = await saveSheet();
  check('the Save Payment button was reachable', emptySave === 'clicked', emptySave);
  await sleep(700);
  // The refusal is a toast, and toasts linger, so this asks whether the payment
  // was written rather than whether the wording is still on screen.
  const afterEmpty = await api('GET', '/orders/' + pricedId);
  check('an empty amount box is refused', /Enter the amount/i.test((await text()) ?? ''), (await text())?.slice(0, 200));
  check('an empty amount box writes no payment row', (afterEmpty.json?.data?.payments ?? []).length === 0, afterEmpty.json?.data?.payments);

  const zeroFill = await fillAmount('0');
  check('a 0 can be typed into the Amount Received box', zeroFill === '0', zeroFill);
  await saveSheet();
  await sleep(1400);
  const afterZero = await api('GET', '/orders/' + pricedId);
  const rows = afterZero.json?.data?.payments ?? [];
  check('a typed 0 is saved as a payment row', rows.some((r) => r.amount === 0), rows);
  check('the 0 payment left the paid figure at 0', afterZero.json?.data?.paidAmount === 0, afterZero.json?.data?.paidAmount);
  check('the balance is still the full 800', afterZero.json?.data?.balance === 800, afterZero.json?.data?.balance);
  check('the bill is still Unpaid after a 0 entry', afterZero.json?.data?.paymentStatus === 'Unpaid', afterZero.json?.data?.paymentStatus);
  check('the sheet closed after the 0 entry', !(await sheetOpen()));

  // ------------------------------------ a 0 entry at every stage, via the UI
  const stageBill = await api('POST', '/orders', {
    customerName: 'Stage UI Probe',
    mobile: `90${String(stamp).slice(-8)}`,
    brand: 'Probe',
    model: 'Staged',
    complaint: 'zero at every stage',
    estimatedAmount: 300,
    parts: [],
  });
  const stageId = orderOf(stageBill)?.id;
  await api('POST', `/orders/${stageId}/payments`, { amount: 300, mode: 'Cash', idempotencyKey: `ui-full-${stamp}` });

  for (const stage of ['Received', 'Repairing', 'Ready', 'Delivered']) {
    if (stage === 'Repairing' || stage === 'Ready') {
      await api('POST', `/orders/${stageId}/status`, { status: stage });
    }
    if (stage === 'Delivered') {
      await api('POST', `/orders/${stageId}/deliver`, { deliveredTo: 'Probe' });
    }
    await goto('/orders/' + stageId);
    const before = (await api('GET', '/orders/' + stageId)).json?.data?.payments?.length ?? 0;
    const opened = (await clickMoney('Paid')) === 'clicked';
    await sleep(700);
    check(`the Paid figure still opens the sheet at the ${stage} stage`, opened);
    if (opened) {
      await fillAmount('0');
      await saveSheet();
      await sleep(1400);
    }
    const after = (await api('GET', `/orders/${stageId}`)).json?.data?.payments?.length ?? 0;
    check(`a 0 entry can be saved from the UI at the ${stage} stage`, after === before + 1, { before, after, opened: String(opened) });
    const totals = (await api('GET', `/orders/${stageId}`)).json?.data;
    check(
      `the ${stage} bill is still Paid and collected exactly 300`,
      totals?.paymentStatus === 'Paid' && totals?.paidAmount === 300 && totals?.balance === 0,
      { status: totals?.paymentStatus, paid: totals?.paidAmount, balance: totals?.balance },
    );
  }

  // --------------------------------------- the new bill form allows leaving 0
  await goto('/new');
  const newBillText = await text();
  check('the new bill form explains the price can be left empty', /set the amount later|Leave this empty/i.test(newBillText ?? ''), newBillText?.slice(0, 300));
  const optionalMark = await evaluate(`(() => {
    const label = document.querySelector('label[for="estimatedAmount"]');
    if (!label) return 'no label';
    const block = label.closest('div');
    return block ? block.textContent : label.textContent;
  })()`);
  check('Bill Amount is marked optional', /optional/i.test(optionalMark ?? ''), optionalMark);

  // Saving the form with the amount empty has to produce a real 0 bill.
  const created = await evaluate(`(async () => {
    const set = (el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const fill = (sel, v) => { const el = document.querySelector(sel); if (el) set(el, v); };
    fill('#customerName', 'Blank Amount Probe');
    fill('#mobile', '89' + String(${stamp}).slice(-8));
    fill('#brand', 'Probe');
    fill('#complaint', 'saved with no price at all');
    document.querySelector('#estimatedAmount').value = '';
    document.querySelector('#estimatedAmount').dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const btn = [...document.querySelectorAll('button')].find((n) => /save bill/i.test(n.textContent));
    btn.click();
    await new Promise((r) => setTimeout(r, 2500));
    return document.body.innerText.slice(0, 400);
  })()`);
  check('a bill with the amount left empty saves without a validation error', !/enter a|required|invalid/i.test(created ?? ''), created);

  const blankBill = await api('GET', '/orders?limit=1');
  const latest = (blankBill.json?.data ?? [])[0];
  check(
    'the saved bill really is at 0 and is not reported as Paid',
    latest && latest.customerName === 'Blank Amount Probe' && latest.finalAmount === 0 && latest.paymentStatus !== 'Paid',
    { name: latest?.customerName, final: latest?.finalAmount, status: latest?.paymentStatus },
  );
} catch (error) {
  failures += 1;
  console.log(`  FAIL  the check could not finish: ${error.message}`);
} finally {
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    /* the browser may still hold the profile open */
  }
}

console.log(`\n  ${checkCount - failures} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

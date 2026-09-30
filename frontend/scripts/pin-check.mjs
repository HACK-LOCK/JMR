/**
 * The shop PIN - on the Stock lock screen and on the hidden dashboard figures -
 * checked in a real browser against the real server.
 *
 * Everything else in the suite either renders the components without a server
 * (`check:render`) or calls the API without a browser (`test:api`). That leaves
 * the one flow a person actually uses with their hands - type a number, tap a
 * button, get in or do not - with nothing covering it. This closes that gap.
 *
 * It needs the dev server running, because the point is to exercise the real
 * fetch path through the real API: the same request the app makes, over the
 * same Vite proxy, in the same browser.
 *
 * Usage: npm run dev, then in another terminal: npm run test:pin
 * The PIN comes from STOCK_PIN so the shop's real number is never hard coded.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * The running dev server already holds the shop's real STOCK_PIN, and this
 * check is meant to test that very server. So the number is read from the repo
 * root .env - the same file the server read - rather than asked for on the
 * command line, which would mean typing the shop's PIN into a terminal history.
 * It is never written to the output: a failed run says which check failed, not
 * which number was tried.
 */
function readStockPin() {
  if (process.env.STOCK_PIN) return process.env.STOCK_PIN;
  try {
    const line = readFileSync(join(repoRoot, '.env'), 'utf8')
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith('STOCK_PIN='));
    return line ? line.split('=').slice(1).join('=').trim() : '';
  } catch {
    return '';
  }
}

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const USERNAME = process.env.TEST_USERNAME ?? 'ashok';
const PASSWORD = process.env.TEST_PASSWORD ?? 'shop1234';
const PIN = readStockPin();
const DEBUG_PORT = Number(process.env.PIN_CHECK_PORT ?? 9222);

/** Chrome or Edge, whichever this machine has. */
function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) ?? null;
}

if (!PIN) {
  console.error('  STOCK_PIN is not set, so there is no PIN to test against.');
  process.exit(1);
}
const browser = findBrowser();
if (!browser) {
  console.error('  No Chrome or Edge found, so the PIN cannot be checked in a real browser.');
  process.exit(1);
}

try {
  const res = await fetch(`${APP}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!res.ok) {
    console.error(`  The dev server is not answering on ${APP} (login gave ${res.status}).`);
    console.error('  Start it with: npm run dev');
    process.exit(1);
  }
} catch {
  console.error(`  No dev server on ${APP}. Start it with: npm run dev`);
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), 'jmr-pin-check-'));
let checkCount = 0;
const chrome = spawn(browser, [
  '--headless=new',
  `--remote-debugging-port=${DEBUG_PORT}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });

let socket;
let nextId = 1;
const pending = new Map();
let failures = 0;
const noise = [];

function send(method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

function close() {
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    /* the browser may still hold the profile open; it is a temp folder */
  }
}

function check(label, passed, detail) {
  checkCount += 1;
  if (passed) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail) console.log(`        ${String(detail).replace(/\s+/g, ' ').slice(0, 220)}`);
  }
}

async function main() {
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
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = (message) => {
    const msg = JSON.parse(message.data);
    if (msg.id && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
      else entry.resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      noise.push(msg.params.exceptionDetails?.exception?.description ?? 'unknown');
    }
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  // Sign in on the app's own origin, not about:blank: a relative /api fetch
  // only resolves once the page is actually the app.
  await send('Page.navigate', { url: APP }, sessionId);
  await sleep(2500);

  /** Runs in the page. Throwing here fails the check with the real reason. */
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'the page threw');
    }
    return result.result.value;
  }

  const goTo = async (path, settle = 2200) => {
    await send('Page.navigate', { url: APP + path }, sessionId);
    await sleep(settle);
  };

  const signedIn = await evaluate(`
    (async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: ${JSON.stringify(USERNAME)}, password: ${JSON.stringify(PASSWORD)} }),
      });
      const j = await r.json();
      if (!j.data) return 'login failed: ' + JSON.stringify(j);
      localStorage.setItem('jmmr.token', j.data.token);
      localStorage.setItem('jmmr.user', JSON.stringify(j.data.user));
      localStorage.removeItem('jmmr.dashboard-hidden');
      return '';
    })()
  `);
  check('signed in as the counter staff', signedIn === '', signedIn);

  /**
   * A check that cannot fail is worse than no check, because it is believed.
   *
   * The answer below is not the shop's real PIN - it is a number the server
   * cannot accept - so the correct answer must bring the figures back and this
   * must not. If a future change breaks the flow, this flips while the
   * correct-answer check still passes, which is exactly the signal that the
   * prompt stopped reading the PIN at all.
   */
  console.log('\n--- numbers the shop did not set are refused ---');
  {
    const status = await evaluate(`
      (async () => {
        const r = await fetch('/api/auth/pin/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + localStorage.getItem('jmmr.token'),
          },
          body: JSON.stringify({ pin: '0000' }),
        });
        return r.status;
      })()
    `);
    check('/api/auth/pin/verify refuses 0000', status === 403, `server said ${status}`);
  }

  console.log('\n--- the owner PIN on the hidden dashboard figures ---');
  for (const [pin, shouldReveal] of [[PIN, true], ['0000', false]]) {
    await goTo('/');
    // Figures have to be put away first: the PIN sheet is only reachable from
    // the quiet eye that appears once something is hidden.
    await evaluate(`
      localStorage.setItem('jmmr.dashboard-hidden',
        JSON.stringify(['collection', 'bills', 'bench', 'due']));
      true
    `);
    await send('Page.reload', {}, sessionId);
    await sleep(2400);
    const opened = await evaluate(`
      (() => {
        const eyes = [...document.querySelectorAll('button[aria-label^="Show "]')];
        if (!eyes.length) return false;
        eyes[0].click();
        return true;
      })()
    `);
    if (!opened) {
      check('the eye that brings the figures back is there', false, 'no Show button on a hidden dashboard');
      continue;
    }
    // Wait for the sheet's field. The page must not be reloaded again here, or
    // the sheet that was just opened would be thrown away.
    const result = await evaluate(`
      (async () => {
        let input = document.getElementById('unhide-pin');
        const err = null;
        for (let i = 0; i < 40 && !input; i += 1) {
          await new Promise((r) => setTimeout(r, 100));
          input = document.getElementById('unhide-pin');
        }
        if (!input) return { stage: 'the PIN sheet never opened' };
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(pin)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 150));
        const form = input.closest('form');
        const button = form && form.querySelector('button[type=submit]');
        if (!button) return { stage: 'no submit button' };
        button.click();
        await new Promise((r) => setTimeout(r, 2200));
        return {
          stage: 'submitted',
          token: localStorage.getItem('jmmr.token'),
          hidden: localStorage.getItem('jmmr.dashboard-hidden'),
        };
      })()
    `);
    const revealed = result.hidden === null || result.hidden === '[]';
    const label = pin === PIN ? 'the correct PIN brings the figures back' : 'a wrong PIN leaves them put away';
    check(label, revealed === shouldReveal && result.token, `${result.stage} hidden=${result.hidden} token=${result.token ? 'kept' : 'gone'}`);
  }

  console.log('\n--- the shop PIN on the Stock lock ---');
  for (const [pin, shouldOpen] of [[PIN, true], ['0000', false]]) {
    // Get to the gate fresh. Signing out clears the unlock key, so the lock
    // screen has to show up again no matter what an earlier step opened.
    await goTo('/');
    await evaluate(`
      localStorage.removeItem('jmmr.stock-unlocked-at');
      true
    `);
    await goTo('/stock');
    const result = await evaluate(`
      (async () => {
        let input = document.getElementById('stock-pin');
        for (let i = 0; i < 40 && !input; i += 1) {
          await new Promise((r) => setTimeout(r, 100));
          input = document.getElementById('stock-pin');
        }
        if (!input) return { stage: 'the stock PIN gate never appeared' };
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(pin)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 150));
        const form = input.closest('form');
        const button = form && form.querySelector('button[type=submit]');
        if (!button) return { stage: 'no Open Stock button' };
        button.click();
        await new Promise((r) => setTimeout(r, 2200));
        return {
          stage: 'submitted',
          stillLocked: Boolean(document.getElementById('stock-pin')),
          stockVisible: /Stock In/.test(document.body.innerText),
          token: localStorage.getItem('jmmr.token'),
        };
      })()
    `);
    const label = pin === PIN ? 'the correct PIN opens the Stock area' : 'a wrong PIN stays on the lock screen';
    check(label, result.stillLocked !== shouldOpen && result.stockVisible === shouldOpen && result.stockVisible !== result.stillLocked, `${result.stage} locked=${result.stillLocked} stock=${result.stockVisible}`);
    check('a wrong PIN does not cost the sign-in', result.stage === 'submitted' && result.token, `${result.stage} token=${result.token ? 'kept' : 'gone'}`);
  }

  if (failures > 0) {
    console.log(`\n  ${failures} of ${checkCount} PIN CHECKS FAILED`);
    if (noise.length) {
      console.log('\n  page errors:');
      for (const line of noise.slice(-8)) console.log(`    ${String(line).slice(0, 180)}`);
    }
    return failures;
  }
  console.log(`\n  ALL ${checkCount} PIN CHECKS PASSED\n`);
  return 0;
}

main()
  .then((failed) => {
    close();
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error(`  the browser check could not run: ${error.message}`);
    if (noise.length) for (const line of noise.slice(-8)) console.error(`    ${String(line).slice(0, 180)}`);
    close();
    process.exit(1);
  });

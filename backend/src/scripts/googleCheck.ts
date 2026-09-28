/**
 * Google connection check for the shop owner.
 *
 *   npm run google:check
 *   npm run google:check -- <spreadsheet link> [drive folder link]
 *   npm run google:check -- <spreadsheet link> --connect
 *
 * It only reads. `--connect` is the one exception and it is always typed out
 * in full, so nobody connects the wrong sheet by accident.
 */
import { googleConnectionReport } from '../google/connect';
import { initStore, readConnection, writeConnection, useGoogleSheets } from '../data/index';

const GREEN = '[32m';
const YELLOW = '[33m';
const RED = '[31m';
const DIM = '[2m';
const BOLD = '[1m';
const OFF = '[0m';

const MARK: Record<string, string> = {
  ok: `${GREEN}OK   ${OFF}`,
  todo: `${YELLOW}TODO ${OFF}`,
  problem: `${RED}NEED ${OFF}`,
};

function line(label: string, value: string): void {
  console.log(`  ${label.padEnd(22)} ${value}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const connect = args.includes('--connect');
  const values = args.filter((arg) => !arg.startsWith('--'));
  const spreadsheetId = values[0] ?? readConnection().spreadsheetId;
  const driveFolderId = values[1] ?? '';

  console.log(`\n${BOLD}Google connection check${OFF}`);
  console.log(`${DIM}${'─'.repeat(58)}${OFF}`);

  const report = await googleConnectionReport({ spreadsheetId, driveFolderId });

  line('Service account', report.serviceAccountEmail || 'not loaded');
  line('Key file', report.credentialsFile || 'not found');
  line('Spreadsheet', report.spreadsheetId || 'not chosen');
  if (report.spreadsheetTitle) line('Sheet name', report.spreadsheetTitle);
  line('Drive folder', report.driveFolderId || 'not chosen');

  console.log('');
  for (const item of report.items) {
    console.log(`  ${MARK[item.state] ?? item.state} ${item.label}`);
    console.log(`       ${DIM}${item.detail}${OFF}`);
    if (item.fix) console.log(`       ${YELLOW}-> ${item.fix}${OFF}`);
  }

  console.log(`\n  ${BOLD}${report.summary}${OFF}\n`);

  if (connect && report.sheetsReady) {
    console.log(`${BOLD}Connecting to ${report.spreadsheetId} ...${OFF}`);
    await initStore().catch(() => undefined);
    await useGoogleSheets(report.spreadsheetId);
    await writeConnection({ spreadsheetId: report.spreadsheetId, useGoogle: true });
    console.log(`${GREEN}Connected.${OFF} Restart the app if it is already running.`);
  } else if (connect) {
    console.log(`${RED}Not connected.${OFF} Fix the lines marked NEED first.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`${RED}${error instanceof Error ? error.message : String(error)}${OFF}`);
  process.exitCode = 1;
});

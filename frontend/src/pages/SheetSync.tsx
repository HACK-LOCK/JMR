import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Cloud,
  CloudOff,
  Copy,
  Download,
  FileSpreadsheet,
  Link2,
  RefreshCw,
  Upload,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorBlock, InlineNotice, LoadingBlock } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Sheet } from '@/components/ui/sheet';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { openProtectedFile } from '@/lib/api';
import { useGoogleCheck, useGoogleConnect, useSyncAction, useSyncDatasets, useSyncStatus } from '@/hooks/use-queries';
import { dateTime, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { GoogleCheckItem } from '@shared/domain';

/**
 * Sheet Sync: shows exactly where the data lives right now, and gives the
 * owner honest controls to push, pull and retry. Nothing happens silently.
 *
 * With the online database as the store, the spreadsheet is a copy of it and
 * only ever receives. The Pull and Import controls are therefore not shown at
 * all in that mode: a bill amount, a payment or a stock figure should not be
 * changeable by editing a cell in a browser.
 */
export default function SheetSync(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const isOwner = user?.role === 'OWNER';
  const { data: status, isLoading, error, refetch } = useSyncStatus();
  const { data: datasets } = useSyncDatasets();
  const action = useSyncAction();

  const [connectOpen, setConnectOpen] = useState(false);
  const [dataset, setDataset] = useState('orders');
  const [result, setResult] = useState<{ message: string; details: string[]; conflicts: number } | null>(null);

  if (isLoading && !status) return <LoadingBlock label="Checking sync status..." />;
  if (error && !status) return <ErrorBlock message={error.message} onRetry={() => void refetch()} />;
  if (!status) return <ErrorBlock message="Sync status unavailable." />;

  // The database is the store, and the spreadsheet is only a copy of it.
  const inDatabase = status.mode === 'postgres';
  const hasCopy = status.spreadsheetId !== '';
  const storedInSheets = status.mode === 'sheets' && status.connected;
  const storageHealthy = inDatabase ? status.connected : storedInSheets;
  const canRetry = status.pendingCount > 0 && (inDatabase ? hasCopy : status.mode === 'sheets');
  const canPush = isOwner && (inDatabase ? hasCopy : storedInSheets);

  const run = async (path: string, body?: unknown, label = 'Done'): Promise<void> => {
    try {
      const response = await action.mutateAsync({ path, body });
      setResult({
        message: response.data.message,
        details: response.data.details ?? [],
        conflicts: response.data.conflicts ?? 0,
      });
      toast.success(label, response.data.message);
    } catch (caught) {
      toast.error('Sync action failed', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sheet Sync"
        subtitle="Where your shop data is stored right now"
        action={
          <Button variant="outline" size="icon" aria-label="Refresh status" onClick={() => void refetch()}>
            <RefreshCw className="h-5 w-5" />
          </Button>
        }
      />

      {/* Where data lives right now */}
      <Card
        className={cn(
          storageHealthy ? 'border-success' : 'border-warning/50',
        )}
      >
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                storageHealthy
                  ? 'bg-success/10 text-success'
                  : 'bg-warning/15 text-warning-foreground',
              )}
            >
              {storageHealthy ? (
                <Cloud className="h-6 w-6" />
              ) : (
                <CloudOff className="h-6 w-6" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black leading-tight">
                {inDatabase
                  ? 'Bills are in the online database'
                  : storedInSheets
                    ? 'Google Sheets connected'
                    : 'Saving on this device'}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">{status.message}</p>
            </div>
          </div>

          <div className="space-y-1 rounded-xl bg-secondary p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Storage</span>
              <span className="font-semibold">
                {inDatabase
                  ? 'Online database (Supabase Postgres)'
                  : storedInSheets
                    ? 'Google Sheets'
                    : 'Local file (safe fallback)'}
              </span>
            </div>
            {inDatabase ? (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Google Sheets</span>
                <span className={cn('font-semibold', !hasCopy && 'text-muted-foreground')}>
                  {hasCopy ? 'A copy for reading only' : 'No copy connected'}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Bills in Drive</span>
              <span className={cn('font-semibold', !status.driveConnected && 'text-warning-foreground')}>
                {status.driveConnected ? 'Connected' : 'Kept on this computer'}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Waiting to sync</span>
              <span className={cn('font-semibold', status.pendingCount > 0 && 'text-warning-foreground')}>
                {status.pendingCount > 0 ? plural(status.pendingCount, 'change') : 'Nothing pending'}
              </span>
            </div>
            {status.lastPushAt ? (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Last sent to Sheets</span>
                <span className="font-semibold">{dateTime(status.lastPushAt)}</span>
              </div>
            ) : null}
            {!inDatabase && status.lastPullAt ? (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Last read from Sheets</span>
                <span className="font-semibold">{dateTime(status.lastPullAt)}</span>
              </div>
            ) : null}
          </div>

          {status.spreadsheetUrl ? (
            <a
              href={status.spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border-2 border-border text-sm font-bold"
            >
              <Link2 className="h-4 w-4" />
              {inDatabase ? 'Open the spreadsheet copy' : 'Open the spreadsheet'}
            </a>
          ) : null}

          {status.pendingCount > 0 ? (
            <InlineNotice tone="warning">
              {inDatabase
                ? `${plural(status.pendingCount, 'sheet')} still behind. Every bill is already saved in the online database - only the copy is behind, and it will be sent automatically.`
                : `${plural(status.pendingCount, 'change')} saved on this device but not yet in Google Sheets. Nothing is lost - it will be sent automatically, or you can retry now.`}
            </InlineNotice>
          ) : null}

          {isOwner ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setConnectOpen(true)}>
                <FileSpreadsheet className="h-4 w-4" />
                {inDatabase ? (hasCopy ? 'Change the copy' : 'Connect a copy') : 'Connect Sheets'}
              </Button>
              <Button
                variant="warning"
                disabled={!canRetry}
                loading={action.isPending}
                onClick={() => void run('/sync/retry', undefined, 'Pending changes sent')}
              >
                <RefreshCw className="h-4 w-4" /> Retry Pending
              </Button>
            </div>
          ) : (
            <InlineNotice tone="info">
              Google is connected by the person who set up the app
              {inDatabase
                ? '.'
                : storedInSheets
                  ? '.'
                  : '. Ask them to connect Sheets from this screen.'}
            </InlineNotice>
          )}
        </CardContent>
      </Card>

      {/* Per dataset push / pull */}
      <Card>
        <CardHeader>
          <CardTitle>Push or Pull a Single Tab</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {inDatabase
              ? 'Push copies that tab into the spreadsheet so you can read it in Excel. The spreadsheet never changes the bills - a bill is edited in the app, where the change is checked and recorded.'
              : "Push sends this app's newer data to the sheet. Pull reads the sheet and keeps the newer row on each line - it never blindly overwrites."}
          </p>

          <Field label="Data Set" htmlFor="sync-dataset">
            <Select
              value={dataset}
              onValueChange={setDataset}
              options={(datasets ?? []).map((item) => ({
                value: item.key,
                label: item.label,
                description: `${plural(item.rows, 'row')} in the app - sheet tab: ${item.tab}`,
              }))}
            />
          </Field>

          {inDatabase ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="success"
                disabled={!canPush}
                loading={action.isPending}
                onClick={() => void run('/sync/push', { dataset }, 'Copied to Google Sheets')}
              >
                <Upload className="h-4 w-4" /> Copy to Sheets
              </Button>
              <Button variant="outline" disabled loading={action.isPending}>
                <Download className="h-4 w-4" /> Pull disabled
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="success"
                disabled={!canPush}
                loading={action.isPending}
                onClick={() => void run('/sync/push', { dataset }, 'Sent to Google Sheets')}
              >
                <Upload className="h-4 w-4" /> Push
              </Button>
              <Button
                variant="outline"
                disabled={!canPush}
                loading={action.isPending}
                onClick={() => void run('/sync/pull', { dataset }, 'Read from Google Sheets')}
              >
                <Download className="h-4 w-4" /> Pull
              </Button>
            </div>
          )}

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => openProtectedFile(`/sync/export/${dataset}`)}
          >
            <Download className="h-4 w-4" /> Download this data as CSV
          </Button>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.conflicts > 0 ? (
                <AlertTriangle className="h-5 w-5 text-warning-foreground" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-success" />
              )}
              Last Sync Result
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">{result.message}</p>
            {result.details.length > 0 ? (
              <ul className="space-y-1 rounded-xl bg-secondary p-3 text-xs">
                {result.details.slice(0, 12).map((detail, index) => (
                  <li key={`${detail}-${index}`}>- {detail}</li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <GoogleConnectSheet
        open={connectOpen}
        onOpenChange={setConnectOpen}
        currentSpreadsheetId={status.spreadsheetId}
        connected={inDatabase ? hasCopy : storedInSheets}
        onDisconnect={async () => {
          const question = inDatabase
            ? 'Stop copying bills to Google Sheets? The bills stay in the online database, and the spreadsheet copy will stop being updated. Bill PDFs in Drive are not affected.'
            : 'Disconnect Google Sheets? Data will be saved on this device only.';
          if (window.confirm(question)) {
            await run('/sync/disconnect', undefined, 'Disconnected');
          }
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                        Connect Google - step by step                        */
/* -------------------------------------------------------------------------- */

interface LinkValues {
  spreadsheetId: string;
  driveFolderId: string;
}

/**
 * The whole Google setup on one screen, in the order it has to be done.
 *
 * Every line is a live answer from the server, so a green tick always means
 * "Google really says yes". Anything unfinished shows the single next action
 * instead of leaving the owner guessing.
 */
function GoogleConnectSheet({
  open,
  onOpenChange,
  currentSpreadsheetId,
  connected,
  onDisconnect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSpreadsheetId: string;
  connected: boolean;
  onDisconnect: () => Promise<void>;
}): JSX.Element {
  const toast = useToast();
  const [spreadsheet, setSpreadsheet] = useState('');
  const [driveFolder, setDriveFolder] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [tested, setTested] = useState<LinkValues | null>(null);

  const check = useGoogleCheck({
    spreadsheetId: tested?.spreadsheetId ?? '',
    driveFolderId: tested?.driveFolderId ?? '',
    enabled: open,
  });
  const connect = useGoogleConnect();

  // Re-check whatever is saved the moment the screen opens.
  useEffect(() => {
    if (!open) return;
    setSpreadsheet((current) => current || currentSpreadsheetId);
    setTested((current) => current ?? { spreadsheetId: currentSpreadsheetId, driveFolderId: '' });
  }, [open, currentSpreadsheetId]);

  // A folder that is already connected is filled in for the owner, so it is
  // obvious which Drive folder the bills go into.
  useEffect(() => {
    if (!open) return;
    const saved = check.data?.driveFolderId ?? '';
    if (!saved) return;
    setDriveFolder((current) => current || saved);
    setTested((current) => current ?? { spreadsheetId: currentSpreadsheetId, driveFolderId: saved });
  }, [open, check.data?.driveFolderId, currentSpreadsheetId]);

  const values: LinkValues = { spreadsheetId: spreadsheet.trim(), driveFolderId: driveFolder.trim() };
  const sheetItem = check.data?.items.find((item) => item.id === 'spreadsheet');
  const canConnect = check.data?.sheetsReady === true;

  const runCheck = (): void => setTested(values);

  const copyEmail = async (email: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success('Copied', 'Paste it into the Google Share box.');
    } catch {
      toast.error('Could not copy', 'Select the address and copy it by hand.');
    }
  };

  const submit = async (): Promise<void> => {
    try {
      const response = await connect.mutateAsync({
        ...values,
        shareWith: shareEmail.trim() ? [shareEmail.trim()] : [],
      });
      setSpreadsheet(response.data.report.spreadsheetId);
      setTested({ spreadsheetId: response.data.report.spreadsheetId, driveFolderId: response.data.report.driveFolderId });
      toast.success(
        response.data.report.sheetsReady ? 'Google Sheets connected' : 'Drive folder connected',
        response.data.message,
      );
      onOpenChange(false);
    } catch (caught) {
      toast.error('Not connected yet', caught instanceof Error ? caught.message : undefined);
      runCheck();
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Connect Google"
      description="Three short steps. The shop keeps working on this computer until the last one is done."
      className="sm:max-w-2xl"
    >
      <div className="space-y-5 pb-2">
        {/* What Google has told us so far */}
        <section className="space-y-2">
          <h3 className="text-sm font-black uppercase tracking-wide text-muted-foreground">
            Where you are now
          </h3>
          {check.isLoading && !check.data ? (
            <div className="flex items-center gap-2 rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" /> Asking Google...
            </div>
          ) : check.data ? (
            <>
              <ol className="space-y-2">
                {check.data.items.map((item, index) => (
                  <ChecklistRow key={item.id} item={item} step={index + 1} />
                ))}
              </ol>
              <p
                className={cn(
                  'rounded-xl border-2 p-3 text-sm font-medium leading-snug',
                  check.data.sheetsReady ? 'border-success/30 bg-success/5 text-success' : 'border-primary/20 bg-primary/5 text-primary',
                )}
              >
                {check.data.summary}
              </p>
            </>
          ) : (
            <InlineNotice tone="info">
              Ask the person who set up the app to connect Google.
            </InlineNotice>
          )}
        </section>

        {/* The address that has to be shared */}
        {check.data?.serviceAccountEmail ? (
          <section className="space-y-2">
            <h3 className="text-sm font-black uppercase tracking-wide text-muted-foreground">
              Share this address with Google
            </h3>
            <p className="text-xs text-muted-foreground">
              This is your app's own Google account. Give it Editor access to the sheet and to the
              folder, the same way you would give access to anyone else.
            </p>
            <div className="flex items-center gap-2 rounded-xl border-2 border-border bg-secondary p-2">
              <code className="min-w-0 flex-1 break-all px-1 text-xs font-semibold">
                {check.data.serviceAccountEmail}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1"
                onClick={() => void copyEmail(check.data?.serviceAccountEmail ?? '')}
              >
                <Copy className="h-4 w-4" /> Copy
              </Button>
            </div>
          </section>
        ) : null}

        {/* Step: the sheet */}
        <section className="space-y-2">
          <StepHeading step={2} title="Your Google Sheet" />
          <ol className="list-inside list-decimal space-y-1 rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
            <li>Open Google Sheets and create a blank sheet.</li>
            <li>
              Click <strong className="text-foreground">Share</strong>, paste the address above, choose{' '}
              <strong className="text-foreground">Editor</strong>, then send the invite.
            </li>
            <li>Copy the sheet link from the address bar and paste it below.</li>
          </ol>
          <Field
            label="Google Sheet link"
            htmlFor="spreadsheet-link"
            hint="Paste the whole link - docs.google.com/spreadsheets/d/... - or just the long ID. Both work."
            error={
              tested?.spreadsheetId && sheetItem?.state === 'problem' ? sheetItem.detail : null
            }
          >
            <Input
              id="spreadsheet-link"
              value={spreadsheet}
              onChange={(event) => setSpreadsheet(event.target.value.trim())}
              placeholder="https://docs.google.com/spreadsheets/d/1AbC.../edit"
              className="tabular"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Button variant="outline" className="w-full gap-2" onClick={runCheck}>
            <RefreshCw className={cn('h-4 w-4', check.isFetching && 'animate-spin')} /> Check this link
          </Button>
          {sheetItem?.state === 'ok' ? (
            <InlineNotice tone="success">{sheetItem.detail}</InlineNotice>
          ) : null}
        </section>

        {/* Step: the folder */}
        <section className="space-y-2">
          <StepHeading step={3} title="Folder for bills and photos" />
          <p className="text-xs text-muted-foreground">
            A Google service account has no storage of its own, so it saves bills only inside a folder
            you create in your own Drive and share with the address above. Skip this and the app still
            works - bills are just kept on this computer.
          </p>
          <Field
            label="Drive folder link"
            htmlFor="drive-folder-link"
            optional
            hint="Open the folder in Drive, click Share, add the address above as Editor, then paste the link."
          >
            <Input
              id="drive-folder-link"
              value={driveFolder}
              onChange={(event) => setDriveFolder(event.target.value.trim())}
              placeholder="https://drive.google.com/drive/folders/1XyZ..."
              className="tabular"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </section>

        {/* Step: the owner's own Gmail */}
        <section className="space-y-2">
          <StepHeading step={4} title="Your own Gmail" optional />
          <Field
            label="Gmail to share files with"
            htmlFor="share-email"
            optional
            hint="So the bill PDFs and photos appear in your own Google Drive and you can open them."
          >
            <Input
              id="share-email"
              type="email"
              value={shareEmail}
              onChange={(event) => setShareEmail(event.target.value.trim())}
              placeholder="you@gmail.com"
              className="tabular"
              autoComplete="off"
            />
          </Field>
        </section>

        <Button
          size="lg"
          className="w-full gap-2"
          disabled={!canConnect}
          loading={connect.isPending}
          onClick={() => void submit()}
        >
          <Cloud className="h-5 w-5" /> {connected ? 'Switch to this sheet' : 'Connect Google Sheets'}
        </Button>
        {!canConnect && check.data ? (
          <p className="-mt-2 text-center text-xs text-muted-foreground">
            The button unlocks as soon as Google confirms it can open your sheet.
          </p>
        ) : null}

        {connected ? (
          <Button variant="outline" className="w-full" onClick={() => void onDisconnect()}>
            Disconnect Google Sheets
          </Button>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Your Google key never leaves the server computer. Until the sheet is connected, every
          repair is saved to a file on this device and sent to Google later - nothing is lost.
        </p>
      </div>
    </Sheet>
  );
}

function StepHeading({ step, title, optional }: { step: number; title: string; optional?: boolean }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
        {step}
      </span>
      <h3 className="text-sm font-black uppercase tracking-wide text-muted-foreground">{title}</h3>
      {optional ? <span className="text-2xs text-muted-foreground">Optional</span> : null}
    </div>
  );
}

function ChecklistRow({ item, step }: { item: GoogleCheckItem; step: number }): JSX.Element {
  const Icon =
    item.state === 'ok' ? CheckCircle2 : item.state === 'problem' ? XCircle : CircleDashed;
  return (
    <li
      className={cn(
        'flex gap-3 rounded-xl border-2 p-3',
        item.state === 'ok' && 'border-success/30 bg-success/5',
        item.state === 'todo' && 'border-border bg-secondary',
        item.state === 'problem' && 'border-destructive/30 bg-destructive/5',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-5 w-5 shrink-0',
          item.state === 'ok' && 'text-success',
          item.state === 'todo' && 'text-muted-foreground',
          item.state === 'problem' && 'text-destructive',
        )}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-bold leading-snug">
          <span className="mr-1 text-muted-foreground">{step}.</span>
          {item.label}
        </p>
        <p className="text-xs leading-snug text-muted-foreground">{item.detail}</p>
        {item.fix ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-background/70 p-2 text-xs font-semibold leading-snug text-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-foreground" />
            {item.fix}
          </p>
        ) : null}
      </div>
    </li>
  );
}

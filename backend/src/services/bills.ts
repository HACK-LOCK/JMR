import type { OrderPart, Payment, RepairOrder, ShopSettings } from '../../../shared/domain';
import { nowIso } from '../core/id';
import { read, mutate } from '../data/mutate';
import { readDriveFolderId } from '../data/connection';
import { NO_DRIVE_FOLDER_MESSAGE, billTarget, driveReady, saveBillPdf } from '../google/drive';
import { billAsText, renderBillPdf } from '../pdf/bill';
import { findOrder } from '../domain/orderOps';

export interface BillBundle {
  settings: ShopSettings;
  order: RepairOrder;
  parts: OrderPart[];
  payments: Payment[];
}

export function billBundle(orderId: string): BillBundle {
  const db = read();
  const order = findOrder(db, orderId);
  return {
    settings: db.settings,
    order,
    parts: db.orderParts.filter((line) => line.orderId === orderId),
    payments: db.payments
      .filter((payment) => payment.orderId === orderId)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function buildBillPdf(orderId: string): Promise<Buffer> {
  return renderBillPdf(billBundle(orderId));
}

export function buildBillText(orderId: string): string {
  return billAsText(billBundle(orderId));
}

export interface EnsureBillResult {
  saved: boolean;
  fileId: string;
  link: string;
  message: string;
}

/**
 * Creates the PDF once, then UPDATES that same Drive file on every later edit.
 * Returns `saved: false` (never throws) when Drive is not connected, so the
 * repair workflow is never blocked by Google being offline.
 */
export async function ensureBill(orderId: string): Promise<EnsureBillResult> {
  const rootFolderId = readDriveFolderId();
  if (!driveReady(rootFolderId)) {
    return {
      saved: false,
      fileId: '',
      link: '',
      message: rootFolderId ? 'Google Drive is not connected.' : NO_DRIVE_FOLDER_MESSAGE,
    };
  }
  const bundle = billBundle(orderId);
  try {
    const target = await billTarget({
      shopName: bundle.settings.shopName,
      orderId: bundle.order.id,
      at: new Date(bundle.order.receivedAt || Date.now()),
      rootFolderId,
    });
    const content = await buildBillPdf(orderId);
    const location = await saveBillPdf(target, content);
    await mutate((draft) => {
      const order = findOrder(draft, orderId);
      order.billDriveFileId = location.fileId;
      order.billDriveLink = location.link;
      order.billPrintedAt = nowIso();
      return null;
    });
    return {
      saved: true,
      fileId: location.fileId,
      link: location.link,
      message: `Bill saved to Drive: ${location.folderPath}/${location.fileName}`,
    };
  } catch (error) {
    return {
      saved: false,
      fileId: bundle.order.billDriveFileId,
      link: bundle.order.billDriveLink,
      message:
        error instanceof Error
          ? `Bill not saved to Drive: ${error.message}`
          : 'Bill not saved to Drive.',
    };
  }
}

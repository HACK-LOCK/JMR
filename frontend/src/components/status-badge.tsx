import {
  CONSUME_MODE_LABELS,
  type ConsumeMode,
  type OrderStatus,
  type PaymentStatus,
} from '@shared/domain';
import { Badge } from '@/components/ui/badge';

const STATUS_TONE: Record<OrderStatus, 'info' | 'warning' | 'success' | 'destructive' | 'muted' | 'secondary'> = {
  Received: 'secondary',
  Checking: 'info',
  'Waiting for Approval': 'warning',
  Approved: 'info',
  Repairing: 'info',
  'Waiting for Part': 'warning',
  Ready: 'success',
  Delivered: 'muted',
  Cancelled: 'destructive',
  'Unable to Repair': 'destructive',
};

export function StatusBadge({ status, size }: { status: string; size?: 'default' | 'lg' }): JSX.Element {
  const typed = status as OrderStatus;
  return (
    <Badge variant={STATUS_TONE[typed] ?? 'secondary'} size={size}>
      {status}
    </Badge>
  );
}

const PAYMENT_TONE: Record<PaymentStatus, 'success' | 'warning' | 'destructive'> = {
  Paid: 'success',
  'Partially Paid': 'warning',
  Unpaid: 'destructive',
};

/**
 * A bill that has no amount on it yet is neither paid nor unpaid, it is simply
 * not quoted. Showing a red "Unpaid" badge on a bill the shop has not finished
 * pricing would cry wolf on every freshly created job, so a zero-amount bill
 * gets a neutral "No Amount Yet" badge instead.
 */
export function PaymentBadge({
  status,
  payable,
  size,
}: {
  status: string;
  payable?: number;
  size?: 'default' | 'lg';
}): JSX.Element {
  if (status === 'Unpaid' && payable !== undefined && payable <= 0) {
    return (
      <Badge variant="secondary" size={size}>
        No Amount Yet
      </Badge>
    );
  }
  return (
    <Badge variant={PAYMENT_TONE[status as PaymentStatus] ?? 'secondary'} size={size}>
      {status}
    </Badge>
  );
}

export function ConsumeBadge({ mode }: { mode: ConsumeMode }): JSX.Element {
  return (
    <Badge variant={mode === 'DELIVERY' ? 'info' : 'secondary'} className="whitespace-nowrap">
      {CONSUME_MODE_LABELS[mode]}
    </Badge>
  );
}

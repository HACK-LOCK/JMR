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

export function PaymentBadge({ status }: { status: string }): JSX.Element {
  return <Badge variant={PAYMENT_TONE[status as PaymentStatus] ?? 'secondary'}>{status}</Badge>;
}

export function ConsumeBadge({ mode }: { mode: ConsumeMode }): JSX.Element {
  return (
    <Badge variant={mode === 'DELIVERY' ? 'info' : 'secondary'} className="whitespace-nowrap">
      {CONSUME_MODE_LABELS[mode]}
    </Badge>
  );
}

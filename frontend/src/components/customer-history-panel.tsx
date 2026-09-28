import { ClipboardList, History, Phone, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/feedback';
import { DetailRow } from '@/components/ui/table';
import { PaymentBadge, StatusBadge } from '@/components/status-badge';
import { useCustomer, useCustomerOrders } from '@/hooks/use-queries';
import { dateOnly, deviceLabel, money, timeAgo } from '@/lib/format';

/**
 * Everything the shop holds for one customer: who they are, and every repair
 * they have brought in.
 *
 * It is rendered in two places - inside the popup on the Customers screen, and
 * on the customer's own page, which is still what a search result or a bill
 * links to. One component for both, so the two can never disagree.
 */
export function CustomerHistoryPanel({ id }: { id: string }): JSX.Element {
  const { data: customer, isLoading, error, refetch } = useCustomer(id);
  const { data: orders } = useCustomerOrders(id);

  if (isLoading && !customer) return <LoadingBlock label="Loading customer..." />;
  if (error && !customer) return <ErrorBlock message={error.message} onRetry={() => void refetch()} />;
  if (!customer) return <ErrorBlock message="Customer not found." />;

  const history = orders ?? [];

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-2 pt-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-secondary p-3">
              <p className="text-2xs font-bold uppercase text-muted-foreground">Repairs</p>
              <p className="tabular mt-0.5 text-xl font-black">{customer.orderCount}</p>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <p className="text-2xs font-bold uppercase text-muted-foreground">Billed</p>
              <p className="tabular mt-0.5 text-xl font-black">{money(customer.totalBilled)}</p>
            </div>
            <div
              className={`rounded-xl p-3 ${customer.balanceDue > 0 ? 'bg-destructive/10' : 'bg-success/10'}`}
            >
              <p className="text-2xs font-bold uppercase text-muted-foreground">Due</p>
              <p
                className={`tabular mt-0.5 text-xl font-black ${customer.balanceDue > 0 ? 'text-destructive' : 'text-success'}`}
              >
                {money(customer.balanceDue)}
              </p>
            </div>
          </div>

          <a
            href={`tel:${customer.mobile}`}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border-2 border-primary text-base font-bold text-primary"
          >
            <Phone className="h-5 w-5" /> Call {customer.mobile}
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Customer Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <DetailRow label="Name" value={customer.name} />
          <DetailRow label="Mobile" value={<span className="tabular">{customer.mobile}</span>} />
          {customer.altMobile ? (
            <DetailRow label="Alternate" value={<span className="tabular">{customer.altMobile}</span>} />
          ) : null}
          {customer.address ? <DetailRow label="Address" value={customer.address} /> : null}
          {customer.notes ? <DetailRow label="Notes" value={customer.notes} /> : null}
          <DetailRow label="Customer since" value={dateOnly(customer.createdAt)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> Bill History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No repairs yet" />
          ) : (
            history.map((order) => (
              <Link key={order.id} to={`/orders/${order.id}`} className="card-tap block">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="tabular text-sm font-black text-primary">{order.id}</span>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold">
                      {deviceLabel(order.brand, order.model)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{order.complaint}</p>
                    <p className="mt-0.5 text-2xs text-muted-foreground">
                      {dateOnly(order.receivedAt)} - {timeAgo(order.receivedAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-sm font-black">{money(order.finalAmount)}</p>
                    <PaymentBadge status={order.paymentStatus} />
                  </div>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

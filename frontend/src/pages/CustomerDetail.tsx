import { useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/app-shell';
import { CustomerHistoryPanel } from '@/components/customer-history-panel';
import { Button } from '@/components/ui/button';
import { useCustomer } from '@/hooks/use-queries';
import { ErrorBlock } from '@/components/ui/feedback';

/**
 * A customer's own page. The Customers list now opens this same information in
 * a popup, but a search result or a bill still links straight here, so the page
 * stays - it just no longer keeps a second copy of the content.
 */
export default function CustomerDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { data: customer } = useCustomer(id);

  if (!id) return <ErrorBlock message="Customer not found." />;

  return (
    <div className="space-y-4">
      <PageHeader title={customer?.name ?? 'Customer'} subtitle={customer?.mobile ?? ''} back />
      <CustomerHistoryPanel id={id} />
      <Button variant="outline" className="w-full" asChild>
        <Link to="/new">Start a new repair for this customer</Link>
      </Button>
    </div>
  );
}

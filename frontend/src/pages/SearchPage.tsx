import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlusCircle, Search as SearchIcon, User } from 'lucide-react';
import { PageHeader, SearchField } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, LoadingBlock } from '@/components/ui/feedback';
import { useDebounced } from '@/lib/hooks';
import { useSearch } from '@/hooks/use-queries';
import { money, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SearchHit } from '@/lib/types';

const KIND_ICON = { order: PlusCircle, customer: User } as const;
const KIND_LABEL = { order: 'Bill', customer: 'Customer' } as const;

/**
 * Billing search. It looks for bills and customers only - stock lives behind
 * the PIN in JMR - STOCK, so it never appears in a billing result.
 */
export default function SearchPage(): JSX.Element {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const { data, isFetching } = useSearch(debounced, 'billing');
  const navigate = useNavigate();

  const hits = (data ?? []).filter((hit) => hit.kind !== 'part');

  const open = (hit: SearchHit): void => {
    if (hit.kind === 'order') navigate(`/orders/${hit.id}`);
    else navigate(`/customers/${hit.id}`);
  };

  return (
    <div className="space-y-3">
      <PageHeader title="Search Order" subtitle="Bill number, name, mobile or device" />

      <SearchField
        value={search}
        onChange={setSearch}
        placeholder="Type bill no, name or mobile..."
        autoFocus
      />

      {debounced.trim().length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="Start typing"
          description="Search finds any bill by number, customer name, mobile number or device."
          action={
            <Button asChild className="gap-2">
              <Link to="/new">
                <PlusCircle className="h-5 w-5" /> New Bill
              </Link>
            </Button>
          }
        />
      ) : isFetching && hits.length === 0 ? (
        <LoadingBlock label="Searching..." />
      ) : hits.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="Nothing found"
          description="Check the spelling, or try just the mobile number or the last digits of the bill number."
        />
      ) : (
        <>
          <p className="text-xs font-semibold text-muted-foreground">
            {plural(hits.length, 'result')}
            {isFetching ? ' · searching' : ''}
          </p>
          <ul className="space-y-2.5">
            {hits.map((hit) => {
              const Icon = KIND_ICON[hit.kind as keyof typeof KIND_ICON] ?? User;
              return (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button type="button" onClick={() => open(hit)} className="card-tap block w-full">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                          hit.kind === 'order'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-warning/15 text-warning-foreground',
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold leading-tight">{hit.title}</p>
                        <p className="truncate text-sm text-muted-foreground">{hit.subtitle}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-bold text-muted-foreground">
                            {KIND_LABEL[hit.kind as keyof typeof KIND_LABEL] ?? 'Result'}
                          </span>
                          <span className="text-2xs font-semibold text-muted-foreground">{hit.status}</span>
                        </div>
                      </div>
                      {hit.amount > 0 || hit.balance > 0 ? (
                        <div className="shrink-0 text-right">
                          {hit.amount > 0 ? (
                            <p className="tabular text-sm font-black">{money(hit.amount)}</p>
                          ) : null}
                          {hit.balance > 0 ? (
                            <p className="tabular text-2xs font-bold text-destructive">
                              {money(hit.balance)} due
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlusCircle, Search as SearchIcon } from 'lucide-react';
import { PageHeader, SearchField } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, LoadingBlock } from '@/components/ui/feedback';
import { useDebounced } from '@/lib/hooks';
import { useSearch } from '@/hooks/use-queries';
import { money, plural } from '@/lib/format';
import type { SearchHit } from '@/lib/types';

/**
 * Billing search. It looks for the 3 most relevant existing bills only -
 * matched by bill number, customer name or mobile number. Stock, parts and
 * customer screens never show up here.
 */
export default function SearchPage(): JSX.Element {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const { data, isFetching } = useSearch(debounced, 'billing');
  const navigate = useNavigate();

  const hits = (data ?? []).filter((hit) => hit.kind === 'order');

  const open = (hit: SearchHit): void => {
    if (hit.kind === 'order') navigate(`/orders/${hit.id}`);
  };

  return (
    <div className="space-y-3">
      <PageHeader title="Search Order" subtitle="Bill number, customer name or mobile" />

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
          description="Search finds an existing bill by number, customer name or mobile number - the 3 best matches at most."
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
            {hits.map((hit) => (
              <li key={`${hit.kind}-${hit.id}`}>
                <button type="button" onClick={() => open(hit)} className="card-tap block w-full">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 shrink-0 items-center rounded-lg bg-primary/10 px-2 text-primary">
                      <span className="tabular text-xs font-black leading-tight">{hit.id}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold leading-tight">{hit.title}</p>
                      <p className="truncate text-sm text-muted-foreground">{hit.subtitle}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-bold text-muted-foreground">
                          Bill
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
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

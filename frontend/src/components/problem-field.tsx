import { useMemo } from 'react';
import { COMMON_PROBLEMS, OTHER_PROBLEM } from '@shared/domain';
import { SuggestionField, matchesHint, type Suggestion } from '@/components/suggestion-field';

/**
 * The problem field, with the shop's usual faults offered as suggestions.
 *
 * The wording of the list is the shop's, not the industry's: a bill that says
 * "Charging Socket (CC) Change" can be found later by whoever did the job, and
 * a bill that says "cc point dead" cannot.
 *
 * Free typing stays fully open, because a customer will describe something that
 * is not on any list. "Other Problem" is the named fallback for that, and it
 * keeps the customer's own words rather than overwriting them with a label -
 * the technician still needs to know what is wrong.
 */
export function ProblemField({
  id,
  value,
  onChange,
  invalid,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
  placeholder?: string;
}): JSX.Element {
  const query = value.trim();

  // An exact match is left out of the list, so tapping a suggestion once does
  // not leave it still sitting on top of the field.
  const canonical = useMemo(
    () => COMMON_PROBLEMS.find((problem) => matchesHint(problem, query) && fold(problem) === fold(query)),
    [query],
  );

  const suggestions = useMemo<Suggestion[]>(() => {
    // Nothing typed: offer the whole list, which is the quickest way in for the
    // faults this shop sees every day.
    if (!query) {
      return [{ label: OTHER_PROBLEM, fallback: true }, ...COMMON_PROBLEMS.map(toSuggestion)];
    }

    const hits = COMMON_PROBLEMS.filter((problem) => matchesHint(problem, query)).map(toSuggestion);
    // Nothing on the list covers what was typed, so "Other Problem" goes first
    // and is pre-selected: one tap and it is settled, rather than the employee
    // scrolling a list that cannot help.
    if (hits.length === 0) {
      return [
        { label: OTHER_PROBLEM, keepsTyped: true, fallback: true, detail: `Keeps what was typed: "${query}"` },
      ];
    }
    return hits;
  }, [query]);

  return (
    <SuggestionField
      id={id}
      value={value}
      onChange={onChange}
      suggestions={suggestions}
      placeholder={placeholder}
      invalid={invalid}
      header={query ? undefined : 'Usual faults — start typing to narrow it down'}
      footer={query && suggestions.length > 0 ? 'Anything else can still be typed in full.' : undefined}
      settleOn={canonical}
    />
  );
}

function toSuggestion(problem: string): Suggestion {
  return { label: problem };
}

function fold(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

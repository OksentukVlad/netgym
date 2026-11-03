// A new card or task view (after «Наступна вимога →», «Далі»): the task, the
// card and its choices come into view from the card's top (the page may be
// scrolled down to the last verdict), and the card takes focus. Set the
// returned ref's `current` to true when moving on; `key` is the card's position.
import { useEffect, useRef } from 'react';
import { bringIntoView } from '../../../ui/components/HelpPanel.jsx';

export function useNewCard(cardRef, key) {
  const pending = useRef(false);
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    const card = cardRef.current;
    const work = card?.closest('[data-region="work"]');
    bringIntoView([work?.querySelector('[data-region="question"]') ?? card, work?.querySelector('.ng-ck-options')].filter(Boolean));
    card?.focus({ preventScroll: true });
  }, [key]);
  return pending;
}

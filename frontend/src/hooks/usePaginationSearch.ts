import { useState, useEffect, useCallback, useRef } from 'react';

export interface UsePaginationSearchOptions {
  initialPage?: number;
  initialLimit?: number;
  initialSearch?: string;
  debounceMs?: number;
}

export function usePaginationSearch({
  initialPage = 1,
  initialLimit = 10,
  initialSearch = '',
  debounceMs = 300,
}: UsePaginationSearchOptions = {}) {
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);

  // We need to know if the search actually changed to reset the page, avoiding infinite loops
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const trimmedSearch = search.trim();
      setDebouncedSearch(trimmedSearch);
      setPage(1); // Reset page whenever debounced search completes and triggers
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [search, debounceMs]);

  const reset = useCallback(() => {
    setSearch(initialSearch);
    setDebouncedSearch(initialSearch);
    setPage(initialPage);
    setLimit(initialLimit);
  }, [initialSearch, initialPage, initialLimit]);

  return {
    page,
    setPage,
    limit,
    setLimit,
    search,
    setSearch,
    debouncedSearch,
    reset,
  };
}

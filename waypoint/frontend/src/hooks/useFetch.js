import { useState, useEffect, useCallback } from 'react';

/**
 * useFetch(() => someApi.list(), [deps]) — resolves to { data, loading,
 * error, refetch }. `data` is whatever the API call resolves to, including
 * null in preview mode (see services/api.js) — pages are expected to fall
 * back to their own MOCK_DATA when data is null, per the preview-safe
 * pattern documented in code-nodejs.
 */
export function useFetch(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const run = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => run(), [run]);

  return { data, loading, error, refetch: run };
}

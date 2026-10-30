import { useCallback, useEffect, useState } from 'react';

/** Calls the local API; throws the API's own error message on a non-2xx answer. */
export async function api(path, options) {
  const res = await fetch(`/api${path}`, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error?.message ?? `${res.status} ${res.statusText}`);
  return body;
}

export const postJson = (path, body) =>
  api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Loads `path` (skips when null) and reloads when it changes; `reload` refetches on demand. */
export function useApi(path) {
  const [state, setState] = useState({ loading: Boolean(path), data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path)
      .then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((error) => alive && setState({ loading: false, data: null, error: error.message }));
    return () => {
      alive = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}

/** Query string from an object, skipping empty values. */
export function query(params) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
}

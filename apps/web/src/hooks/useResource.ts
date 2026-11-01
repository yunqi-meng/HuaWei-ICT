import { useEffect, useState } from "react";
import { api } from "../api";

/** Cancels superseded requests so old filters and routes cannot overwrite newer results. */
export function useResource<T>(path: string | null, body?: unknown) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const bodyKey = body === undefined ? undefined : JSON.stringify(body);
  useEffect(() => {
    if (path === null) {
      setLoading(false);
      setData(null);
      setError("");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    api<T>(path, {
      signal: controller.signal,
      body: bodyKey === undefined ? undefined : JSON.parse(bodyKey),
    })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted)
          setError(failure.message || "暂时无法加载，请重试。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, bodyKey, revision]);
  return {
    data,
    loading,
    error,
    reload: () => setRevision((value) => value + 1),
  };
}

export function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

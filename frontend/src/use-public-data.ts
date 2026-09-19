import { useEffect, useState } from "react";

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setData(null);
    setError("");
    const timer = setTimeout(() => controller.abort(), 70000);
    fetch(path, { signal: controller.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.detail || "Unable to load data.");
        return body as T;
      })
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active && !controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        clearTimeout(timer);
        if (active && !controller.signal.aborted) setLoading(false);
      });
    controller.signal.addEventListener(
      "abort",
      () => {
        if (active) {
          setLoading(false);
          setError("The request timed out. Please retry.");
        }
      },
      { once: true },
    );
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [path, version]);
  return { data, error, loading, retry: () => setVersion((x) => x + 1) };
}

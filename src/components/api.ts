"use client";

/** Small typed fetch helper — surfaces server error messages to the UI. */
export async function api<T = unknown>(
  url: string,
  options: { method?: string; body?: unknown; formData?: FormData } = {}
): Promise<T> {
  const res = await fetch(url, {
    method: options.method ?? (options.body || options.formData ? "POST" : "GET"),
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.formData ?? (options.body ? JSON.stringify(options.body) : undefined),
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

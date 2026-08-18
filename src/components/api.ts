"use client";

/**
 * A request that never reached the server — no signal, DNS gone, request
 * aborted. Worth retrying later, unlike anything the server actually answered.
 */
export class NetworkError extends Error {
  constructor(message = "No connection") {
    super(message);
    this.name = "NetworkError";
  }
}

/** An answer from the server that was not a success. Retrying will not help. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Small typed fetch helper — surfaces server error messages to the UI. */
export async function api<T = unknown>(
  url: string,
  options: { method?: string; body?: unknown; formData?: FormData } = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? (options.body || options.formData ? "POST" : "GET"),
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.formData ?? (options.body ? JSON.stringify(options.body) : undefined),
      credentials: "same-origin",
    });
  } catch {
    // fetch only rejects when the request never completed.
    throw new NetworkError();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

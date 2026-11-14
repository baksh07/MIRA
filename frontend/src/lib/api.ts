/** Where the MIRA backend lives. Public by design: it is the API the browser talks to. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
export const WS_URL = API_URL.replace(/^http/, "ws");


/**
 * One simulated car per browser tab session. The id is random and only names
 * this tab's car on the backend; it carries no personal data.
 */
let pageSession: string | null = null;

/**
 * The simulated car for this visit. Every page load starts a new car session
 * (parked in the garage, no old trip, no old notices); the backend evicts idle cars.
 */
export function sessionId(): string {
  pageSession ??= crypto.randomUUID();
  return pageSession;
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(typeof detail?.detail === "string" ? detail.detail : `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

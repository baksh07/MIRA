/** Where the MIRA backend lives. Public by design: it is the API the browser talks to. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
export const WS_URL = API_URL.replace(/^http/, "ws");

const SESSION_KEY = "mira.session";

/**
 * One simulated car per browser tab session. The id is random and only names
 * this tab's car on the backend; it carries no personal data.
 */
export function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
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

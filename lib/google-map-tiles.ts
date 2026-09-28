const CREATE_SESSION = "https://tile.googleapis.com/v1/createSession";

type Session = {
  token: string;
  expirySec: number;
};

let cached: Session | null = null;
let pending: Promise<Session | null> | null = null;

function apiKey(): string | null {
  const key =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_GEOCODING_API_KEY?.trim() ||
    "";
  return key || null;
}

async function createSession(key: string): Promise<Session | null> {
  const url = new URL(CREATE_SESSION);
  url.searchParams.set("key", key);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      mapType: "satellite",
      language: "pt-BR",
      region: "BR",
      layerTypes: ["layerRoadmap"],
      overlay: false,
      imageFormat: "jpeg",
    }),
  });
  if (!res.ok) {
    console.error("[map-tiles] createSession", res.status);
    return null;
  }
  const data = (await res.json()) as { session?: string; expiry?: string };
  const expirySec = Number(data.expiry);
  if (!data.session || !Number.isFinite(expirySec)) return null;
  return { token: data.session, expirySec };
}

/** Sessão de satélite (com nomes de rua). O token fica no servidor. */
export function getSatelliteSession(): Promise<Session | null> {
  const key = apiKey();
  if (!key) return Promise.resolve(null);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expirySec - 120 > now) return Promise.resolve(cached);
  if (!pending) {
    pending = createSession(key)
      .then((session) => {
        cached = session;
        return session;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export async function fetchSatelliteTile(
  z: number,
  x: number,
  y: number,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const key = apiKey();
  const session = await getSatelliteSession();
  if (!key || !session) return null;
  const url = new URL(`https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}`);
  url.searchParams.set("session", session.token);
  url.searchParams.set("key", key);
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401 || res.status === 403) cached = null;
  if (!res.ok) return null;
  return {
    body: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") || "image/jpeg",
  };
}

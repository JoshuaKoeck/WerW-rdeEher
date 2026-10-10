const baseUrl = (process.env.POCKETBASE_URL || "http://pocketbase:8090").replace(/\/$/, "");
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL || process.env.PB_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD || process.env.PB_ADMIN_PASSWORD;

let token = "";
let authentication = null;

async function request(path, options = {}, retry = true) {
  const authPath = "/api/collections/_superusers/auth-with-password";
  if (!token && path !== authPath) await authenticate();

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: token } : {}),
        ...options.headers
      },
      signal: options.signal || AbortSignal.timeout(15_000)
    });
  } catch (error) {
    // A timed out/disconnected read is safe to retry after rebuilding auth.
    // Writes are left to the caller because the server may have completed them
    // before the connection dropped.
    const method = (options.method || "GET").toUpperCase();
    if (retry && method === "GET" && path !== authPath) {
      token = "";
      await authenticate();
      return request(path, options, false);
    }
    throw error;
  }
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  const rejectedSuperuser = response.status === 403 && /super.?user|admin|privilege/i.test(data?.message || "");
  if ((response.status === 401 || rejectedSuperuser) && retry && path !== authPath) {
    token = "";
    await authenticate();
    return request(path, options, false);
  }
  if (!response.ok) throw new Error(data?.message || `PocketBase request failed (${response.status})`);
  return data;
}

async function authenticate() {
  if (authentication) return authentication;
  authentication = authenticateOnce();
  try {
    await authentication;
  } finally {
    authentication = null;
  }
}

async function authenticateOnce() {
  if (!adminEmail || !adminPassword) {
    throw new Error("PocketBase credentials are missing. Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD.");
  }
  const response = await fetch(`${baseUrl}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
    signal: AbortSignal.timeout(15_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || `PocketBase authentication failed (${response.status})`);
  if (!data.token) throw new Error("PocketBase authentication succeeded without returning a token.");
  token = data.token;
}

const schemas = {
  players: [
    { name: "name", type: "text", required: true, options: { min: 1, max: 30, pattern: "" } },
    { name: "normalized_name", type: "text", required: true, unique: true, options: { min: 1, max: 60, pattern: "" } }
  ],
  questions: [
    { name: "text", type: "text", required: true, options: { min: 1, max: 180, pattern: "" } },
    { name: "position", type: "number", required: true, options: { min: 0, max: null, noDecimal: true } }
  ]
};

async function ensureCollections() {
  const existing = await request("/api/collections?perPage=200");
  const names = new Set(existing.items.map((item) => item.name));
  for (const [name, fields] of Object.entries(schemas)) {
    if (!names.has(name)) {
      await request("/api/collections", {
        method: "POST",
        body: JSON.stringify({ name, type: "base", fields, listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null })
      });
    }
  }
}

async function list(collection, sort = "") {
  const query = new URLSearchParams({ perPage: "500", ...(sort ? { sort } : {}) });
  return (await request(`/api/collections/${collection}/records?${query}`)).items;
}

async function add(collection, record) {
  return request(`/api/collections/${collection}/records`, { method: "POST", body: JSON.stringify(record) });
}

async function remove(collection, id) {
  return request(`/api/collections/${collection}/records/${encodeURIComponent(id)}`, { method: "DELETE" });
}

module.exports = { ensureCollections, list, add, remove };

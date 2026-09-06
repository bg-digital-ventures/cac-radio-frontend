export const API_BASE =
  localStorage.getItem("cac_api_base") ||
  "https://cac-radio-backend.onrender.com";

async function req(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;

    try {
      const data = await response.json();
      message = data?.detail || data?.message || message;
    } catch {
      try {
        message = (await response.text()) || message;
      } catch {}
    }

    throw new Error(message);
  }

  return response.json();
}

export const liveApi = {
  health: () => req("/api/health"),

  casterConfig: () => req("/api/caster/config"),

  session: (branchId) =>
    req(`/api/live/session/${encodeURIComponent(branchId)}`),

  start: (data) =>
    req("/api/live/start", {
      method: "POST",
      body: JSON.stringify(data)
    }),

  stop: (data) =>
    req("/api/live/stop", {
      method: "POST",
      body: JSON.stringify(data)
    }),

  connectHQ: (data) =>
    req("/api/live/connect-hq", {
      method: "POST",
      body: JSON.stringify(data)
    }),

  disconnectHQ: () =>
    req("/api/live/disconnect-hq", {
      method: "POST",
      body: JSON.stringify({})
    })
};

const JSON_PREFIXES = [
  "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/",
  "https://raw.githubusercontent.com/TheGiddyLimit/homebrew/master/",
  "https://raw.githubusercontent.com/TheGiddyLimit/unearthed-arcana/master/"
];

const IMAGE_PREFIXES = [
  "https://raw.githubusercontent.com/5etools-mirror-2/5etools-img/main/",
  "https://raw.githubusercontent.com/TheGiddyLimit/homebrew/master/",
  "https://raw.githubusercontent.com/TheGiddyLimit/homebrew-img/main/",
  "https://raw.githubusercontent.com/TheGiddyLimit/unearthed-arcana/master/"
];

const jsonCache = new Map();
const imageCache = new Map();

function isAllowed(url, prefixes) {
  return prefixes.some(prefix => url.startsWith(prefix));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "DDB_QOL_FETCH_JSON") {
    const url = String(message.url || "");
    if (!isAllowed(url, JSON_PREFIXES)) {
      sendResponse({ ok: false, error: "URL de dados não permitida." });
      return;
    }

    (async () => {
      try {
        if (jsonCache.has(url)) {
          sendResponse({ ok: true, data: jsonCache.get(url), cached: true });
          return;
        }
        const response = await fetch(url, { cache: "no-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        jsonCache.set(url, data);
        sendResponse({ ok: true, data });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
    })();
    return true;
  }

  if (message?.type === "DDB_QOL_FETCH_5ETOOLS_IMAGE") {
    const urls = Array.isArray(message.urls) ? message.urls.map(String).filter(Boolean) : [];
    if (!urls.length || urls.some(url => !isAllowed(url, IMAGE_PREFIXES))) {
      sendResponse({ ok: false, error: "URL de imagem não permitida." });
      return;
    }

    (async () => {
      let lastError = "Imagem não encontrada.";
      for (const url of urls) {
        try {
          if (imageCache.has(url)) {
            sendResponse({ ok: true, ...imageCache.get(url), cached: true });
            return;
          }
          const response = await fetch(url, { cache: "force-cache" });
          if (!response.ok) {
            lastError = `HTTP ${response.status}`;
            continue;
          }
          const contentType = response.headers.get("content-type") || "image/webp";
          const buffer = await response.arrayBuffer();
          const base64 = arrayBufferToBase64(buffer);
          const result = { dataUrl: `data:${contentType};base64,${base64}`, url };
          imageCache.set(url, result);
          sendResponse({ ok: true, ...result });
          return;
        } catch (error) {
          lastError = String(error?.message || error);
        }
      }
      sendResponse({ ok: false, error: lastError });
    })();
    return true;
  }
});

const DDB_API_PREFIXES = [
  "https://character-service.dndbeyond.com/",
  "https://monster-service.dndbeyond.com/",
  "https://www.dndbeyond.com/api/"
];
let cobaltCache = { token: "", expiresAt: 0 };

async function getCobaltToken() {
  if (cobaltCache.token && Date.now() < cobaltCache.expiresAt) return cobaltCache.token;
  const response = await fetch("https://auth-service.dndbeyond.com/v1/cobalt-token", {
    method: "POST",
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Cobalt HTTP ${response.status}`);
  const data = await response.json();
  if (!data?.token) throw new Error("Cobalt token ausente.");
  cobaltCache = {
    token: data.token,
    expiresAt: Date.now() + Math.max(30, Number(data.ttl || 300) - 30) * 1000
  };
  return cobaltCache.token;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "DDB_QOL_DDB_API_JSON") return;
  const url = String(message.url || "");
  if (!isAllowed(url, DDB_API_PREFIXES)) {
    sendResponse({ ok: false, error: "URL da API DDB não permitida." });
    return;
  }
  (async () => {
    try {
      const token = await getCobaltToken();
      const response = await fetch(url, {
        method: message.method || "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Authorization": `Bearer ${token}`,
          ...(message.body ? { "Content-Type": "application/json" } : {})
        },
        body: message.body ? JSON.stringify(message.body) : undefined
      });
      if (!response.ok) throw new Error(`DDB API HTTP ${response.status}`);
      const data = await response.json();
      sendResponse({ ok: true, data });
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();
  return true;
});

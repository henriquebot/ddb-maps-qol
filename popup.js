const KEY = "ddbQolSettingsV3";
const defaults = {
  hbButtons: true,
  damageApplicator: true,
  extendedBestiary: true,
  mapSearch: true,
  customStickers: true
};
const map = {
  hb: "hbButtons",
  damage: "damageApplicator",
  extended: "extendedBestiary",
  maps: "mapSearch",
  stickers: "customStickers"
};

(async () => {
  const version = chrome.runtime.getManifest().version;
  const versionEl = document.getElementById("version");
  if (versionEl) versionEl.textContent = `v${version}`;

  const stored = (await chrome.storage.local.get(KEY))[KEY] || {};
  const settings = { ...defaults, ...stored };
  await chrome.storage.local.set({ [KEY]: settings });

  for (const [id, key] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.checked = settings[key] !== false;
    el.addEventListener("change", async () => {
      settings[key] = el.checked;
      await chrome.storage.local.set({ [KEY]: settings });
      refreshStatusPanel();
    });
  }
})();

function setStatus(id, text, state = "off") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `status-value ${state}`;
}

function pageInfoFromUrl(rawUrl = "") {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname;
    if (/^\/games\/\d+/i.test(path)) return { type: "Maps", safeUrl: `${url.origin}/games/[id]` };
    if (path.includes("/homebrew/creations/create-monster/create")) return { type: "Homebrew — criar monstro", safeUrl: `${url.origin}/homebrew/creations/create-monster/create` };
    if (/\/homebrew\/creations\/monsters\/\d+-.+\/edit/i.test(path)) return { type: "Homebrew — editar monstro", safeUrl: `${url.origin}/homebrew/creations/monsters/[id]/edit` };
    if (/\/bestiary\.html$/i.test(path) && /(?:5e\.tools|5etools\.com|5etools-mirror-3\.github\.io)$/i.test(url.hostname)) {
      return { type: "5etools Bestiary", safeUrl: `${url.origin}/bestiary.html` };
    }
    return { type: url.hostname || "Página não suportada", safeUrl: url.origin || "" };
  } catch {
    return { type: "Página não suportada", safeUrl: "" };
  }
}

async function getActiveTabStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const info = pageInfoFromUrl(tab?.url || "");
  let status = null;
  let hostname = "";
  try { hostname = new URL(tab?.url || "https://invalid.invalid").hostname; } catch {}
  if (tab?.id && /dndbeyond\.com$/i.test(hostname)) {
    try { status = await chrome.tabs.sendMessage(tab.id, { type: "DDB_QOL_GET_STATUS" }); } catch {}
  }
  return { tab, info, status };
}

async function refreshStatusPanel() {
  const pageEl = document.getElementById("page-status");
  try {
    const { info, status } = await getActiveTabStatus();
    if (pageEl) pageEl.textContent = info.type;

    if (info.type === "5etools Bestiary") {
      setStatus("status-maps", "—", "off");
      setStatus("status-gamelog", "—", "off");
      setStatus("status-stickers", "—", "off");
      setStatus("status-importer", "Disponível", "ok");
      return;
    }

    if (!status?.ok) {
      setStatus("status-maps", "Não detectado", "off");
      setStatus("status-gamelog", "—", "off");
      setStatus("status-stickers", "—", "off");
      setStatus("status-importer", /Homebrew/i.test(info.type) ? "Disponível" : "—", /Homebrew/i.test(info.type) ? "ok" : "off");
      return;
    }

    setStatus("status-maps", status.mapsDetected ? "Detectado" : "—", status.mapsDetected ? "ok" : "off");
    setStatus("status-gamelog", status.gameLogReady ? "Ativo" : "—", status.gameLogReady ? "ok" : "off");
    if (status.settings?.customStickers === false) setStatus("status-stickers", "Desativados", "off");
    else if (status.page !== "maps") setStatus("status-stickers", "—", "off");
    else if (status.stickerDropReady) setStatus("status-stickers", "Pronto", "ok");
    else setStatus("status-stickers", "Faça X + Ping", "warn");
    setStatus("status-importer", status.importerAvailable ? "Disponível" : "—", status.importerAvailable ? "ok" : "off");
  } catch {
    if (pageEl) pageEl.textContent = "não disponível";
  }
}

async function buildDiagnosticText() {
  const version = chrome.runtime.getManifest().version;
  const { info, status } = await getActiveTabStatus();
  const stored = (await chrome.storage.local.get(KEY))[KEY] || {};
  const cfg = { ...defaults, ...stored };
  const yesNo = value => value ? "sim" : "não";
  const sticker = status?.settings?.customStickers === false
    ? "desativados"
    : status?.stickerDropReady
      ? "pronto"
      : status?.page === "maps"
        ? "requer X + Ping"
        : "n/a";
  return [
    "DDB Maps QoL — diagnóstico",
    `Versão: ${version}`,
    `Página: ${info.type}`,
    `URL: ${info.safeUrl || "n/a"}`,
    `Maps detectado: ${yesNo(Boolean(status?.mapsDetected))}`,
    `Game Log: ${yesNo(Boolean(status?.gameLogReady))}`,
    `Socket do Maps: ${yesNo(Boolean(status?.mapSocketReady))}`,
    `Stickers: ${sticker}`,
    `Importer disponível: ${yesNo(info.type === "5etools Bestiary" || Boolean(status?.importerAvailable))}`,
    `Config — HB:${yesNo(cfg.hbButtons !== false)} Damage:${yesNo(cfg.damageApplicator !== false)} Bestiary:${yesNo(cfg.extendedBestiary !== false)} Maps:${yesNo(cfg.mapSearch !== false)} Stickers:${yesNo(cfg.customStickers !== false)}`
  ].join("\n");
}

document.getElementById("copy-diagnostic")?.addEventListener("click", async event => {
  const button = event.currentTarget;
  const original = button.textContent;
  button.disabled = true;
  try {
    const text = await buildDiagnosticText();
    await navigator.clipboard.writeText(text);
    button.textContent = "Diagnóstico copiado";
  } catch {
    button.textContent = "Não foi possível copiar";
  } finally {
    setTimeout(() => { button.textContent = original; button.disabled = false; }, 1400);
  }
});

refreshStatusPanel();

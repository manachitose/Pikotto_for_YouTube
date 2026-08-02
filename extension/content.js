(() => {
  const BUTTON_ID = "pikkot-capture-button";
  const INCLUDE_BUTTON_ID = "pikkot-include-button";

  // タブごとの状態。ページ全体リロードでリセットされる(SPA内遷移では保持される)。
  let includeInBatch = false;

  function sanitizeFilename(name) {
    return name.replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 100);
  }

  function timestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${pad(d.getMilliseconds())}`;
  }

  function getVideoTitle() {
    const el = document.querySelector(
      "h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string, ytd-reel-video-renderer[is-active] yt-shorts-video-title-view-model h2"
    );
    return el ? el.textContent.trim() : "youtube_video";
  }

  function getActiveVideo() {
    if (isShortsPage()) {
      const activeReel = document.querySelector("ytd-reel-video-renderer[is-active] video");
      if (activeReel) return activeReel;
    }

    const candidates = Array.from(document.querySelectorAll("video"));
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const playing = candidates.find(
      (v) => !v.paused && v.readyState >= 2 && v.getClientRects().length > 0
    );
    if (playing) return playing;

    return candidates.find((v) => v.getClientRects().length > 0) || candidates[0];
  }

  function getPlayerContainer(video) {
    if (isShortsPage()) {
      return (
        video?.closest("ytd-reel-video-renderer[is-active]") ||
        document.getElementById("shorts-player") ||
        video?.closest("ytd-player") ||
        video?.parentElement ||
        null
      );
    }

    return (
      document.getElementById("movie_player") ||
      video?.closest("ytd-player") ||
      video?.parentElement ||
      null
    );
  }

  async function captureOnce() {
    const video = getActiveVideo();
    if (!video || video.readyState < 2) {
      return false;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const settings = await loadSettings();
    const format = settings.format === "jpeg" ? "jpeg" : "png";
    const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
    const extension = format === "jpeg" ? "jpg" : "png";
    const dataUrl = canvas.toDataURL(mimeType, format === "jpeg" ? 0.92 : undefined);
    const filename = `Pikotto_for_YouTube/${sanitizeFilename(getVideoTitle())}_${timestamp()}.${extension}`;

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "capture", dataUrl, filename }, (response) => {
        resolve(!!(response && response.ok));
      });
    });
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function captureBurst(burst) {
    const count = burst ? Math.max(1, burst.count) : 1;
    const intervalMs = burst ? Math.max(0, burst.intervalMs) : 0;

    let anyOk = false;
    for (let i = 0; i < count; i++) {
      const ok = await captureOnce();
      anyOk = anyOk || ok;
      if (i < count - 1) await wait(intervalMs);
    }
    return anyOk;
  }

  async function handleButtonClick() {
    const settings = await loadSettings();
    const burst = settings.burst.applyTo.shortcut ? settings.burst : null;
    const ok = await captureBurst(burst);
    flashButton(ok);
  }

  function applyIncludeButtonState(btn) {
    btn.classList.toggle("pikkot-include-on", includeInBatch);
    btn.title = chrome.i18n.getMessage(
      includeInBatch ? "includeToggleOnTitle" : "includeToggleOffTitle"
    );
  }

  function handleIncludeToggleClick() {
    includeInBatch = !includeInBatch;
    const btn = document.getElementById(INCLUDE_BUTTON_ID);
    if (btn) applyIncludeButtonState(btn);
  }

  function flashButton(success) {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;
    btn.classList.remove("pikkot-flash-ok", "pikkot-flash-error");
    void btn.offsetWidth;
    btn.classList.add(success ? "pikkot-flash-ok" : "pikkot-flash-error");
  }

  function isVideoPage() {
    return /^\/(watch|shorts\/|live\/)/.test(location.pathname);
  }

  function isShortsPage() {
    return location.pathname.startsWith("/shorts/");
  }

  function positionBesidePlayer(btn, player, topOffset) {
    const rect = player.getBoundingClientRect();
    btn.style.position = "fixed";
    btn.style.left = `${Math.round(rect.right + 12)}px`;
    btn.style.top = `${Math.round(rect.top + 12 + topOffset)}px`;
    btn.style.right = "auto";
  }

  function isExtensionContextValid() {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  function ensureButton() {
    if (!isExtensionContextValid()) {
      observer.disconnect();
      return;
    }

    if (!isVideoPage()) {
      document.getElementById(BUTTON_ID)?.remove();
      document.getElementById(INCLUDE_BUTTON_ID)?.remove();
      return;
    }

    const video = getActiveVideo();
    const player = getPlayerContainer(video);
    if (!player) return;

    const shorts = isShortsPage();

    let btn = document.getElementById(BUTTON_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BUTTON_ID;
      const icon = document.createElement("img");
      icon.src = chrome.runtime.getURL("icons/capture.svg");
      icon.alt = "";
      btn.appendChild(icon);
      btn.title = chrome.i18n.getMessage("captureButtonTitle");
      btn.addEventListener("click", handleButtonClick);
    }

    let includeBtn = document.getElementById(INCLUDE_BUTTON_ID);
    if (!includeBtn) {
      includeBtn = document.createElement("button");
      includeBtn.id = INCLUDE_BUTTON_ID;
      const icon = document.createElement("img");
      icon.src = chrome.runtime.getURL("icons/pin.svg");
      icon.alt = chrome.i18n.getMessage("includeToggleIconAlt");
      includeBtn.appendChild(icon);
      includeBtn.addEventListener("click", handleIncludeToggleClick);
      applyIncludeButtonState(includeBtn);
    }

    btn.classList.toggle("pikkot-in-shorts", shorts);
    includeBtn.classList.toggle("pikkot-in-shorts", shorts);

    if (shorts) {
      if (btn.parentElement !== document.body) document.body.appendChild(btn);
      if (includeBtn.parentElement !== document.body) document.body.appendChild(includeBtn);
      positionBesidePlayer(btn, player, 0);
      positionBesidePlayer(includeBtn, player, 52);
    } else {
      btn.style.position = "";
      btn.style.left = "";
      btn.style.top = "";
      btn.style.right = "";
      includeBtn.style.position = "";
      includeBtn.style.left = "";
      includeBtn.style.top = "";
      includeBtn.style.right = "";
      if (getComputedStyle(player).position === "static") {
        player.style.position = "relative";
      }
      if (btn.parentElement !== player) player.appendChild(btn);
      if (includeBtn.parentElement !== player) player.appendChild(includeBtn);
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "trigger-capture") return false;
    if (!includeInBatch) {
      sendResponse({ ok: false });
      return false;
    }
    captureBurst(message.burst).then((ok) => {
      flashButton(ok);
      sendResponse({ ok });
    });
    return true;
  });

  const observer = new MutationObserver(() => ensureButton());

  ensureButton();
  document.addEventListener("yt-navigate-finish", ensureButton);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["is-active"],
  });

  window.addEventListener("resize", () => {
    if (isShortsPage()) ensureButton();
  });
  document.addEventListener(
    "scroll",
    () => {
      if (isShortsPage()) ensureButton();
    },
    true
  );
})();

document.querySelectorAll("[data-i18n]").forEach((el) => {
  el.textContent = chrome.i18n.getMessage(el.dataset.i18n);
});
document.querySelectorAll("[data-i18n-alt]").forEach((el) => {
  el.alt = chrome.i18n.getMessage(el.dataset.i18nAlt);
});

// 不具合報告フォームは日本語のみ対応のため、日本語以外のUIでは非表示にする
if (!chrome.i18n.getUILanguage().startsWith("ja")) {
  document.getElementById("bugReportGroup").style.display = "none";
}

// コード変更のたびに手動で更新する(バージョンはmanifest.jsonから自動取得)
const LAST_UPDATED = "2026-08-02";

document.getElementById("appVersionInfo").textContent =
  `v${chrome.runtime.getManifest().version} (最終更新: ${LAST_UPDATED})`;

// Web Store公開後、拡張機能IDがそのままストアページのURLになる
document.getElementById("storePageLink").href =
  `https://chromewebstore.google.com/detail/${chrome.runtime.id}`;

let settings = structuredClone(DEFAULT_SETTINGS);

const els = {
  randomEnabled: document.getElementById("randomEnabled"),
  randomPerHour: document.getElementById("randomPerHour"),
  scheduleList: document.getElementById("scheduleList"),
  newScheduleTime: document.getElementById("newScheduleTime"),
  addScheduleBtn: document.getElementById("addScheduleBtn"),
  burstCount: document.getElementById("burstCount"),
  burstInterval: document.getElementById("burstInterval"),
  applyScheduled: document.getElementById("applyScheduled"),
  applyShortcut: document.getElementById("applyShortcut"),
  applyManual: document.getElementById("applyManual"),
  manualCaptureBtn: document.getElementById("manualCaptureBtn"),
  formatSelect: document.getElementById("formatSelect"),
  status: document.getElementById("status"),
};

function renderScheduleList() {
  els.scheduleList.innerHTML = "";
  settings.scheduled
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time))
    .forEach((entry) => {
      const li = document.createElement("li");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = entry.enabled;
      checkbox.addEventListener("change", () => {
        entry.enabled = checkbox.checked;
        persist();
      });

      const time = document.createElement("span");
      time.className = "time";
      time.textContent = entry.time;

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => {
        settings.scheduled = settings.scheduled.filter((e) => e.id !== entry.id);
        persist();
        renderScheduleList();
      });

      li.append(checkbox, time, removeBtn);
      els.scheduleList.appendChild(li);
    });
}

function renderForm() {
  els.formatSelect.value = settings.format;
  els.randomEnabled.checked = settings.random.enabled;
  els.randomPerHour.value = settings.random.perHour;
  els.burstCount.value = settings.burst.count;
  els.burstInterval.value = settings.burst.intervalMs;
  els.applyScheduled.checked = settings.burst.applyTo.scheduled;
  els.applyShortcut.checked = settings.burst.applyTo.shortcut;
  els.applyManual.checked = settings.burst.applyTo.manual;
  renderScheduleList();
}

function showStatus(text) {
  els.status.textContent = text;
  setTimeout(() => {
    if (els.status.textContent === text) els.status.textContent = "";
  }, 1500);
}

async function persist() {
  await saveSettings(settings);
  chrome.runtime.sendMessage({ type: "settings-updated" });
  showStatus(chrome.i18n.getMessage("statusSaved"));
}

els.formatSelect.addEventListener("change", () => {
  settings.format = els.formatSelect.value;
  persist();
});
els.randomEnabled.addEventListener("change", () => {
  settings.random.enabled = els.randomEnabled.checked;
  persist();
});
els.randomPerHour.addEventListener("change", () => {
  settings.random.perHour = Math.max(1, Number(els.randomPerHour.value) || 1);
  persist();
});
els.burstCount.addEventListener("change", () => {
  settings.burst.count = Math.max(1, Number(els.burstCount.value) || 1);
  persist();
});
els.burstInterval.addEventListener("change", () => {
  settings.burst.intervalMs = Math.max(100, Number(els.burstInterval.value) || 100);
  persist();
});
els.applyScheduled.addEventListener("change", () => {
  settings.burst.applyTo.scheduled = els.applyScheduled.checked;
  persist();
});
els.applyShortcut.addEventListener("change", () => {
  settings.burst.applyTo.shortcut = els.applyShortcut.checked;
  persist();
});
els.applyManual.addEventListener("change", () => {
  settings.burst.applyTo.manual = els.applyManual.checked;
  persist();
});

els.addScheduleBtn.addEventListener("click", () => {
  const time = els.newScheduleTime.value;
  if (!time) return;
  settings.scheduled.push({ id: crypto.randomUUID(), time, enabled: true });
  els.newScheduleTime.value = "";
  persist();
  renderScheduleList();
});

els.manualCaptureBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "manual-capture" }, (response) => {
    showStatus(
      chrome.i18n.getMessage(response && response.ok ? "statusCaptured" : "statusCaptureFailed")
    );
  });
});

(async () => {
  settings = await loadSettings();
  renderForm();
})();

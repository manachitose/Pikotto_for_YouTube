importScripts("settings.js");

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

const RANDOM_ALARM = "pikkot-random";
const SCHEDULED_ALARM_PREFIX = "pikkot-scheduled-";

chrome.runtime.onInstalled.addListener((details) => {
  rebuildAlarms();
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }
});
chrome.runtime.onStartup.addListener(rebuildAlarms);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "capture") {
    chrome.downloads.download(
      { url: message.dataUrl, filename: message.filename, saveAs: false },
      (downloadId) => {
        const ok = !chrome.runtime.lastError && !!downloadId;
        sendResponse({ ok });
      }
    );
    return true;
  }

  if (message.type === "settings-updated") {
    rebuildAlarms();
    return false;
  }

  if (message.type === "manual-capture") {
    (async () => {
      const settings = await loadSettings();
      const ok = await triggerCaptureOnYoutubeTabs(
        settings.burst.applyTo.manual ? settings.burst : null
      );
      sendResponse({ ok });
    })();
    return true;
  }

  return false;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const settings = await loadSettings();

  if (alarm.name === RANDOM_ALARM) {
    await triggerCaptureOnYoutubeTabs(null);
    scheduleNextRandomAlarm(settings);
    return;
  }

  if (alarm.name.startsWith(SCHEDULED_ALARM_PREFIX)) {
    const id = alarm.name.slice(SCHEDULED_ALARM_PREFIX.length);
    const entry = settings.scheduled.find((e) => e.id === id);
    if (entry && entry.enabled) {
      await triggerCaptureOnYoutubeTabs(
        settings.burst.applyTo.scheduled ? settings.burst : null
      );
    }
  }
});

async function triggerCaptureOnYoutubeTabs(burst) {
  const tabs = await chrome.tabs.query({
    url: ["*://*.youtube.com/watch*", "*://*.youtube.com/shorts/*"],
  });
  if (tabs.length === 0) return false;

  const results = await Promise.all(
    tabs.map(
      (tab) =>
        new Promise((resolve) => {
          chrome.tabs.sendMessage(tab.id, { type: "trigger-capture", burst }, (response) => {
            resolve(!!(response && response.ok));
          });
        })
    )
  );

  return results.some(Boolean);
}

async function rebuildAlarms() {
  const settings = await loadSettings();
  await chrome.alarms.clear(RANDOM_ALARM);

  const all = await chrome.alarms.getAll();
  await Promise.all(
    all
      .filter((a) => a.name.startsWith(SCHEDULED_ALARM_PREFIX))
      .map((a) => chrome.alarms.clear(a.name))
  );

  if (settings.random.enabled) {
    scheduleNextRandomAlarm(settings);
  }

  settings.scheduled
    .filter((entry) => entry.enabled)
    .forEach((entry) => {
      chrome.alarms.create(SCHEDULED_ALARM_PREFIX + entry.id, {
        when: nextOccurrence(entry.time),
        periodInMinutes: 24 * 60,
      });
    });
}

function scheduleNextRandomAlarm(settings) {
  const baseIntervalMin = 60 / Math.max(settings.random.perHour, 1);
  const jittered = baseIntervalMin * (0.5 + Math.random());
  chrome.alarms.create(RANDOM_ALARM, { delayInMinutes: Math.max(jittered, 1) });
}

function nextOccurrence(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

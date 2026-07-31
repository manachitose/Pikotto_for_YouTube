const DEFAULT_SETTINGS = {
  format: "png",
  random: { enabled: false, perHour: 15 },
  scheduled: [],
  burst: {
    count: 3,
    intervalMs: 400,
    applyTo: { scheduled: false, shortcut: false, manual: false },
  },
};

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ settings: DEFAULT_SETTINGS }, (result) => {
      resolve({ ...DEFAULT_SETTINGS, ...result.settings });
    });
  });
}

function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ settings }, resolve);
  });
}

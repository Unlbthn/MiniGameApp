\
/* TapToEarnTON v2 - app.js (vanilla) */

const tg = window.Telegram ? window.Telegram.WebApp : null;
if (tg) tg.expand();

// ---- Helpers ----
function webAlert(message) {
  if (tg && typeof tg.showAlert === "function") tg.showAlert(message);
  else alert(message);
}

async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.detail || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

// ---- i18n ----
const I18N = {
  en: {
    title: "TapToEarn",
    subtitle: "Tap, level up, earn TON Credits.",
    level: "Level",
    tapPower: "Tap Power",
    weeklyScore: "Weekly Score",
    totalTaps: "Total Taps",
    daily: "Daily",
    settings: "Settings",
    leaderboard: "Leaderboard",
    xp: "XP",
    adHint: "Every 100 taps, an Adsgram video can be shown automatically.",
    adWatch: "Ad Watch",
    adWatchDesc: "Watch an ad to earn TON Credits",
    dailyTasks: "Daily Tasks",
    watch: "Watch",
    open: "Open",
    check: "Check",
    claimed: "Claimed",
    wallet: "Wallet",
    walletDesc: "Connect TON wallet (TonConnect)",
    notConnected: "Not connected",
    connected: "Connected",
    walletAddress: "Wallet Address",
    walletPasteHint: "If TonConnect is not available, paste your address and Save.",
    save: "Save",
    preferences: "Preferences",
    language: "Language",
    sound: "Sound",
    vibration: "Vibration",
    notifications: "Notifications",
    botBased: "Bot-based",
    weeklyPrize: "Weekly #1 gets +0.5 TON Credit when the week resets.",
    weekly: "Weekly",
    allTime: "All-time",
    upgraded: "Tap power upgraded!",
  },
  tr: {
    title: "TapToEarn",
    subtitle: "Tapla, seviye atla, TON Credits kazan.",
    level: "Seviye",
    tapPower: "Tap Gücü",
    weeklyScore: "Haftalık Skor",
    totalTaps: "Toplam Tap",
    daily: "Günlük",
    settings: "Ayarlar",
    leaderboard: "Liderlik",
    xp: "XP",
    adHint: "Her 100 tap’te otomatik Adsgram videosu gösterilebilir.",
    adWatch: "Reklam İzle",
    adWatchDesc: "Reklam izleyerek TON Credits kazan",
    dailyTasks: "Günlük Görevler",
    watch: "İzle",
    open: "Git",
    check: "Check",
    claimed: "Alındı",
    wallet: "Cüzdan",
    walletDesc: "TON cüzdanını bağla (TonConnect)",
    notConnected: "Bağlı değil",
    connected: "Bağlandı",
    walletAddress: "Cüzdan Adresi",
    walletPasteHint: "TonConnect çalışmıyorsa adresi yapıştırıp Kaydet'e bas.",
    save: "Kaydet",
    preferences: "Tercihler",
    language: "Dil",
    sound: "Ses",
    vibration: "Titreşim",
    notifications: "Bildirimler",
    botBased: "Bot ile",
    weeklyPrize: "Haftalık 1.'ye hafta reset olunca +0.5 TON Credit verilir.",
    weekly: "Haftalık",
    allTime: "Tüm Zamanlar",
    upgraded: "Tap gücü yükseltildi!",
  }
};

let locale = "en";
function t(key) { return (I18N[locale] && I18N[locale][key]) || I18N.en[key] || key; }

// ---- User state ----
let user = null;
let taskOpenTimes = {}; // taskId -> timestamp
let isTapping = false;

// ---- Adsgram ----
// Replace with your real block ids later
const ADS_BLOCK_AUTO = "ADS_KEY_TEST_AUTO";
const ADS_BLOCK_REWARD = "ADS_KEY_TEST_REWARD";

let AdAuto = null;
let AdReward = null;
function initAds() {
  try {
    if (window.Adsgram && typeof window.Adsgram.init === "function") {
      AdAuto = window.Adsgram.init({ blockId: ADS_BLOCK_AUTO });
      AdReward = window.Adsgram.init({ blockId: ADS_BLOCK_REWARD });
    }
  } catch (e) {
    console.warn("Adsgram init error:", e);
  }
}

async function showAd(controller) {
  if (!controller || typeof controller.show !== "function") {
    webAlert("Ads not ready (replace blockId / check Adsgram).");
    return { ok: false };
  }
  try {
    await controller.show();
    return { ok: true };
  } catch (e) {
    console.warn("Adsgram show error:", e);
    return { ok: false, error: e };
  }
}

// ---- Sound + Vibration ----
const coinAudio = new Audio("/static/assets/coin.wav");
coinAudio.preload = "auto";

function playCoinSound() {
  if (!user?.sound_enabled) return;
  try {
    coinAudio.currentTime = 0;
    coinAudio.play().catch(() => {});
  } catch {}
}

function vibrate() {
  if (!user?.vibration_enabled) return;
  try {
    if (tg?.HapticFeedback?.impactOccurred) tg.HapticFeedback.impactOccurred("light");
    else if (navigator.vibrate) navigator.vibrate(15);
  } catch {}
}

// ---- TonConnect ----
let tonConnectUI = null;
function initTonConnect() {
  try {
    if (!window.TON_CONNECT_UI?.TonConnectUI) return;
    tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
      manifestUrl: `${window.location.origin}/static/tonconnect-manifest.json`,
      buttonRootId: "tonConnectButton",
    });

    tonConnectUI.onStatusChange(async (wallet) => {
      const statusEl = document.getElementById("walletStatus");
      if (wallet?.account?.address) {
        statusEl.textContent = `${t("connected")}: ${wallet.account.address.slice(0, 6)}…${wallet.account.address.slice(-4)}`;
        // persist
        await saveSettings({ wallet_address: wallet.account.address });
      } else {
        statusEl.textContent = t("notConnected");
      }
    });
  } catch (e) {
    console.warn("TonConnect init error:", e);
  }
}

// ---- Telegram user ----
const userId = tg?.initDataUnsafe?.user?.id ?? null;
const userName = tg?.initDataUnsafe?.user?.first_name ?? null;
const tgLang = (tg?.initDataUnsafe?.user?.language_code || "en").toLowerCase();

// ---- DOM ----
const el = (id) => document.getElementById(id);

function applyLocaleTexts() {
  el("title").textContent = t("title");
  el("subtitle").textContent = t("subtitle");

  el("levelLabel").textContent = t("level");
  el("tapPowerLabel").textContent = t("tapPower");
  el("weeklyScoreLabel").textContent = t("weeklyScore");
  el("totalTapsLabel").textContent = t("totalTaps");

  el("dailyText").textContent = t("daily");
  el("upgradeText").textContent = t("tapPower");
  el("adHint").textContent = t("adHint");

  el("tasksTitle").textContent = t("daily");
  el("adWatchTitle").textContent = t("adWatch");
  el("adWatchDesc").textContent = t("adWatchDesc");
  el("dailyTasksTitle").textContent = t("dailyTasks");
  el("watchAdBtn").textContent = t("watch");

  el("leaderTitle").textContent = t("leaderboard");
  el("lbWeeklyLabel").textContent = t("weekly");
  el("lbAllTimeLabel").textContent = t("allTime");

  el("settingsTitle").textContent = t("settings");
  el("walletTitle").textContent = t("wallet");
  el("walletDesc").textContent = t("walletDesc");
  el("walletAddrLabel").textContent = t("walletAddress");
  el("walletInputHint").textContent = t("walletPasteHint");
  el("saveWalletBtn").textContent = t("save");
  el("prefsTitle").textContent = t("preferences");
  el("langLabel").textContent = t("language");
  el("soundLabel").textContent = t("sound");
  el("vibrationLabel").textContent = t("vibration");
  el("notifLabel").textContent = t("notifications");
  el("notifNote").textContent = t("botBased");
  el("settingsHint").textContent = t("weeklyPrize");
}

function setLocale(next) {
  locale = next === "tr" ? "tr" : "en";
  applyLocaleTexts();
  // persist
  saveSettings({ language: locale }).catch(() => {});
}

// ---- UI update ----
function calcUpgradeCost(u) {
  const tp = u?.tap_power || 1;
  return 500 * tp;
}

function updateUI() {
  if (!user) return;

  el("coins").textContent = user.coins.toString();
  el("tonCredits").textContent = (user.ton_credits ?? 0).toFixed(4);
  el("level").textContent = user.level.toString();
  el("tapPower").textContent = user.tap_power.toString();
  el("weeklyScore").textContent = user.weekly_score.toString();
  el("totalTaps").textContent = user.total_taps.toString();

  const xpPct = user.next_level_xp > 0 ? (user.xp / user.next_level_xp) * 100 : 0;
  el("xpFill").style.width = `${clamp(xpPct, 0, 100)}%`;
  el("xpText").textContent = `${user.xp} / ${user.next_level_xp} XP`;

  el("upgradeCost").textContent = calcUpgradeCost(user).toString();

  // settings toggles
  el("soundToggle").checked = !!user.sound_enabled;
  el("vibrationToggle").checked = !!user.vibration_enabled;
  el("notifToggle").checked = !!user.notifications_enabled;
  el("langSelect").value = user.language || locale;

  if (user.wallet_address) {
    el("walletInput").value = user.wallet_address;
    el("walletStatus").textContent = `${t("connected")}: ${user.wallet_address.slice(0, 6)}…${user.wallet_address.slice(-4)}`;
  } else {
    el("walletStatus").textContent = t("notConnected");
  }
}

// ---- Modals ----
function showModal(id) { el(id).classList.remove("hidden"); }
function hideModal(id) { el(id).classList.add("hidden"); }

// ---- Tasks ----
function renderTasks(tasks) {
  const list = el("taskList");
  list.innerHTML = "";

  tasks.forEach((task) => {
    const row = document.createElement("div");
    row.className = "task-row";

    const title = document.createElement("div");
    title.style.flex = "1";
    title.textContent = (locale === "tr" ? task.title_tr : task.title_en);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const openBtn = document.createElement("button");
    openBtn.className = "btn-mini";
    openBtn.textContent = t("open");
    openBtn.addEventListener("click", () => {
      taskOpenTimes[task.id] = Date.now();
      if (tg?.openTelegramLink && task.url.startsWith("https://t.me/")) tg.openTelegramLink(task.url);
      else if (tg?.openLink) tg.openLink(task.url);
      else window.open(task.url, "_blank");
    });

    const checkBtn = document.createElement("button");
    checkBtn.className = "btn-mini primary";
    checkBtn.textContent = task.claimed ? t("claimed") : t("check");
    checkBtn.disabled = !!task.claimed;

    checkBtn.addEventListener("click", async () => {
      const openedAt = taskOpenTimes[task.id] || 0;
      const openAgeSec = openedAt ? Math.floor((Date.now() - openedAt) / 1000) : 0;

      try {
        const res = await apiFetch("/api/task/check", {
          method: "POST",
          body: JSON.stringify({ telegram_id: userId, task_id: task.id, open_age_sec: openAgeSec }),
        });

        if (res?.user) user = res.user;
        updateUI();

        if (res.success) {
          checkBtn.textContent = t("claimed");
          checkBtn.disabled = true;
          playCoinSound();
          vibrate();
        } else {
          webAlert(res.message || "Task not completed yet");
        }

        // refresh tasks view
        await loadTasks();
      } catch (e) {
        webAlert(e.message || "Task check failed");
      }
    });

    actions.appendChild(openBtn);
    actions.appendChild(checkBtn);

    row.appendChild(title);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

async function loadTasks() {
  const data = await apiFetch(`/api/tasks?telegram_id=${encodeURIComponent(userId)}`);
  const tasks = data.tasks || [];
  renderTasks(tasks);

  const watched = data?.ad_watch?.watched ?? 0;
  el("adWatchStatus").textContent = watched.toString();
  el("watchAdBtn").disabled = watched >= 10;
}

// ---- Settings save ----
async function saveSettings(partial) {
  if (!userId) return;
  const data = await apiFetch("/api/settings", {
    method: "POST",
    body: JSON.stringify({ telegram_id: userId, ...partial }),
  });
  if (data?.user) user = data.user;
  updateUI();
}

// ---- Load user ----
async function loadUser() {
  const langGuess = (tgLang === "tr" ? "tr" : "en");
  const data = await apiFetch("/api/me", {
    method: "POST",
    body: JSON.stringify({ telegram_id: userId, name: userName, language: langGuess }),
  });
  user = data.user;
  locale = user.language || langGuess;
  applyLocaleTexts();
  updateUI();
}

// ---- Tap handler ----
async function handleTap() {
  if (!userId || isTapping) return;
  isTapping = true;

  playCoinSound();
  vibrate();

  try {
    const data = await apiFetch("/api/tap", {
      method: "POST",
      body: JSON.stringify({ telegram_id: userId, name: userName, language: locale }),
    });
    if (data?.user) user = data.user;
    updateUI();

    // Auto ad each 100 taps (client-side trigger)
    if (user?.total_taps && user.total_taps % 100 === 0) {
      // don't block tapping too long; fire and forget
      showAd(AdAuto).catch(() => {});
    }
  } catch (e) {
    webAlert(e.message || "Tap failed");
  } finally {
    isTapping = false;
  }
}

// ---- Upgrade ----
async function handleUpgrade() {
  if (!userId) return;
  try {
    const data = await apiFetch("/api/upgrade_tap_power", {
      method: "POST",
      body: JSON.stringify({ telegram_id: userId }),
    });
    if (data?.user) user = data.user;
    updateUI();
    webAlert(t("upgraded"));
  } catch (e) {
    webAlert(e.message || "Upgrade failed");
  }
}

// ---- Watch ad ----
async function handleWatchAd() {
  if (!userId) return;

  // show ad first (rewarded)
  const r = await showAd(AdReward);
  if (!r.ok) return;

  // then credit
  try {
    const data = await apiFetch("/api/adwatched", {
      method: "POST",
      body: JSON.stringify({ telegram_id: userId }),
    });
    if (data?.user) user = data.user;
    updateUI();
    await loadTasks();
    playCoinSound();
    vibrate();
  } catch (e) {
    webAlert(e.message || "Ad reward failed");
  }
}

// ---- Leaderboard ----
async function loadLeaderboard(scope) {
  const data = await apiFetch(`/api/leaderboard?scope=${encodeURIComponent(scope)}&telegram_id=${encodeURIComponent(userId)}`);
  const list = el("leaderList");
  list.innerHTML = "";

  (data.leaderboard || []).forEach((row, idx) => {
    const div = document.createElement("div");
    div.className = "task-row";
    div.innerHTML = `<div style="flex:1; font-weight:900;">#${idx + 1} ${row.name}</div>
                     <div class="badge">${row.score}</div>`;
    list.appendChild(div);
  });

  el("yourRank").textContent = data.your_rank ? `Your rank: #${data.your_rank}` : "";
}

// ---- Bindings ----
function bindUI() {
  el("tapBtn").addEventListener("click", handleTap);
  el("upgradeBtn").addEventListener("click", handleUpgrade);

  el("tasksBtn").addEventListener("click", async () => {
    showModal("tasksModal");
    await loadTasks();
  });
  el("closeTasks").addEventListener("click", () => hideModal("tasksModal"));

  el("btnLeaderboard").addEventListener("click", async () => {
    showModal("leaderModal");
    await loadLeaderboard("weekly");
  });
  el("closeLeader").addEventListener("click", () => hideModal("leaderModal"));

  el("lbWeekly").addEventListener("change", () => loadLeaderboard("weekly"));
  el("lbAllTime").addEventListener("change", () => loadLeaderboard("all_time"));

  el("btnSettings").addEventListener("click", () => showModal("settingsModal"));
  el("closeSettings").addEventListener("click", () => hideModal("settingsModal"));

  el("langSelect").addEventListener("change", (e) => setLocale(e.target.value));

  el("soundToggle").addEventListener("change", (e) => saveSettings({ sound_enabled: e.target.checked }));
  el("vibrationToggle").addEventListener("change", (e) => saveSettings({ vibration_enabled: e.target.checked }));
  el("notifToggle").addEventListener("change", (e) => saveSettings({ notifications_enabled: e.target.checked }));

  el("saveWalletBtn").addEventListener("click", () => {
    const val = el("walletInput").value.trim();
    saveSettings({ wallet_address: val || null });
  });

  el("watchAdBtn").addEventListener("click", handleWatchAd);
}

// ---- Boot ----
(async function boot() {
  initAds();
  initTonConnect();
  bindUI();

  if (!userId) {
    webAlert("Telegram user id not found. Open inside Telegram Mini App.");
    return;
  }

  try {
    await loadUser();
  } catch (e) {
    console.error(e);
    webAlert(e.message || "Failed to load user");
  }
})();

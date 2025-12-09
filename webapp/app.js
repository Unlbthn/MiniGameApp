// ===============================
// Telegram WebApp objesi
// ===============================
const tg = window.Telegram ? window.Telegram.WebApp : null;

// ===============================
// Dil metinleri
// ===============================
const LANG = {
  en: {
    tap: "TAP",
    level: "Level",
    coins: "Coins",
    tap_power: "Tap Power",
    ton_credits: "TON Credits",
    daily_tasks: "Daily Tasks",
    open_tasks: "Daily Tasks",
    wallet_connect: "Connect TON Wallet",
    leaderboard_title: "Top 10 Players",
    leaderboard_you: "Your rank",
    no_rank: "Not ranked yet",
    chest_title: "Daily TON Chest",
    chest_desc: "Watch an ad and get TON bonus.",
    invite_title: "Invite Friends",
    invite_desc: "Invite your friends and earn TON when they play.",
    invite_go: "INVITE",
    invite_check: "CHECK",
    invite_claim: "CLAIM",
    watch_ad: "WATCH AD",
    close: "Close",
    tap_failed: "Tap failed, please try again.",
    not_enough_coins: "Not enough coins!",
    task_not_ready: "You must CHECK before CLAIM.",
    chest_limit_reached: "Daily chest limit reached.",
  },
  tr: {
    tap: "TIKLA",
    level: "Seviye",
    coins: "Coin",
    tap_power: "Vuruş Gücü",
    ton_credits: "TON Kredisi",
    daily_tasks: "Günlük Görevler",
    open_tasks: "Günlük Görevler",
    wallet_connect: "TON Cüzdan Bağla",
    leaderboard_title: "En İyi 10 Oyuncu",
    leaderboard_you: "Senin sıran",
    no_rank: "Henüz sıralamada değilsin",
    chest_title: "Günlük TON Sandığı",
    chest_desc: "Reklam izle, TON bonusu kazan.",
    invite_title: "Arkadaş Davet Et",
    invite_desc: "Arkadaşlarını davet et, oynadıkça TON kazan.",
    invite_go: "DAVET ET",
    invite_check: "KONTROL",
    invite_claim: "AL",
    watch_ad: "REKLAM İZLE",
    close: "Kapat",
    tap_failed: "Tıklama başarısız, tekrar dene.",
    not_enough_coins: "Yetersiz coin!",
    task_not_ready: "Önce KONTROL etmelisin.",
    chest_limit_reached: "Günlük sandık limitine ulaştın.",
  },
};

let currentLang = localStorage.getItem("tap_lang") || "en";

// ===============================
// Global durum
// ===============================
const API_BASE = window.location.origin;

let userId = null;
let userState = null; // backend /api/me sonucu
let tapCounter = 0;
const TAPS_PER_AD = 100; // her 100 tap'te 1 interstitial
let lastAdTime = 0;
const AD_INTERVAL_MS = 60_000;

// AdsGram
let AdController = null;
const ADSGRAM_BLOCK_ID_REWARDED = "17996";
const ADSGRAM_BLOCK_ID_INTERSTITIAL = "int-17995";

// TonConnect
let tonConnectUI = null;
let connectedWalletAddress = null;
const TONCONNECT_MANIFEST_URL =
  "https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json";

// Görevler / Task durumu
// task_status_map: { task_id: "pending" | "checked" | "claimed" | ... }
const taskStatusMap = {};

// Görev tanımları (id'ler backend ile uyumlu olmalı)
const TASKS = [
  {
    id: "daily_ton_chest",
    kind: "reward_ad", // AdsGram rewarded
    icon: "💰",
    titleKey: "chest_title",
    descKey: "chest_desc",
    rewardText: "+0.1 TON / day",
  },
  {
    id: "invite_friends",
    kind: "invite",
    icon: "👥",
    titleKey: "invite_title",
    descKey: "invite_desc",
    rewardText: "+0.02 TON per active friend",
  },
  // buraya zamanla affiliate / diğer görevleri ekleyebilirsin
];

// ===============================
// AdsGram init ve kullanımı
// ===============================
function initAdsgram() {
  if (!window.Adsgram) {
    console.log("AdsGram SDK bulunamadı (sad.min.js yüklenmemiş olabilir).");
    return;
  }

  try {
    // Rewarded için controller
    window.AdsgramReward = window.Adsgram.init({
      blockId: ADSGRAM_BLOCK_ID_REWARDED,
    });

    // Interstitial için ayrı controller
    window.AdsgramInterstitial = window.Adsgram.init({
      blockId: ADSGRAM_BLOCK_ID_INTERSTITIAL,
    });

    console.log("AdsGram init OK");
  } catch (err) {
    console.error("AdsGram init error:", err);
  }
}

// Tap sonrası araya interstitial reklam
function maybeShowInterstitial() {
  if (!window.AdsgramInterstitial) return;

  const now = Date.now();
  if (now - lastAdTime < AD_INTERVAL_MS) return;

  lastAdTime = now;
  window.AdsgramInterstitial.show().catch((err) => {
    console.error("Interstitial error:", err);
  });
}

// Rewarded reklam (Daily TON Chest + Turbo vb. için temel fonksiyon)
function showRewardedAdForTask(taskId) {
  if (!window.AdsgramReward) {
    alert("Reklam şu anda hazır değil.");
    return;
  }

  window.AdsgramReward
    .show()
    .then(async (result) => {
      console.log("Rewarded result:", result);
      if (!result || !result.done || result.error) {
        alert("Ödül için reklamı tam izlemelisin.");
        return;
      }

      // Reklam başarıyla tamamlanınca backend'e haber ver
      await notifyBackendRewardAd(taskId);
    })
    .catch((err) => {
      console.error("Reward ad error:", err);
      alert("Reklam oynatılırken bir hata oluştu.");
    });
}

// Daily TON Chest vs. için backend'e kayıt
async function notifyBackendRewardAd(taskId) {
  if (!userId) return;

  try {
    const res = await fetch(API_BASE + "/api/reward/ad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegram_id: userId,
        task_id: taskId, // örn: "daily_ton_chest"
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("reward/ad failed:", data);
      if (data.detail === "DAILY_LIMIT_REACHED") {
        alert(tr("chest_limit_reached"));
      }
      return;
    }

    if (data.user) {
      userState = data.user;
      renderUser();
    }

    if (data.task_status) {
      taskStatusMap[taskId] = data.task_status;
      renderTasks();
    }

    alert("+0.1 TON yüklendi!");
  } catch (err) {
    console.error("notifyBackendRewardAd error:", err);
  }
}

// ===============================
// Dil yardımcıları
// ===============================
function tr(key) {
  const dict = LANG[currentLang] || LANG.en;
  return dict[key] ?? key;
}

function initLanguageSelector() {
  const chips = document.querySelectorAll(".lang-chip");
  chips.forEach((chip) => {
    const lang = chip.dataset.lang;
    if (lang === currentLang) chip.classList.add("active");

    chip.addEventListener("click", () => {
      currentLang = lang;
      localStorage.setItem("tap_lang", currentLang);
      chips.forEach((c) =>
        c.classList.toggle("active", c.dataset.lang === currentLang)
      );
      updateLangTexts();
      renderTasks();
    });
  });
}

function updateLangTexts() {
  const levelLabel = document.querySelector('[data-i18n="level-label"]');
  const coinsLabel = document.querySelector('[data-i18n="coins-label"]');
  const powerLabel = document.querySelector('[data-i18n="power-label"]');
  const tonLabel = document.querySelector('[data-i18n="ton-label"]');
  const tasksTitle = document.querySelector('[data-i18n="tasks-title"]');
  const tasksButton = document.getElementById("open-tasks-btn");
  const tapBtn = document.getElementById("tap-btn");
  const leaderboardTitle = document.querySelector(
    '[data-i18n="leaderboard-title"]'
  );
  const leaderboardYou = document.querySelector(
    '[data-i18n="leaderboard-you"]'
  );
  const tasksCloseBtn = document.querySelector(
    "#tasks-modal .modal-footer button"
  );
  const leaderboardCloseBtn = document.querySelector(
    "#leaderboard-modal .modal-footer button"
  );

  if (levelLabel) levelLabel.textContent = tr("level");
  if (coinsLabel) coinsLabel.textContent = tr("coins");
  if (powerLabel) powerLabel.textContent = tr("tap_power");
  if (tonLabel) tonLabel.textContent = tr("ton_credits");
  if (tasksTitle) tasksTitle.textContent = tr("daily_tasks");
  if (tasksButton) tasksButton.textContent = tr("open_tasks");
  if (tapBtn) tapBtn.textContent = tr("tap");
  if (leaderboardTitle) leaderboardTitle.textContent = tr("leaderboard_title");
  if (leaderboardYou) leaderboardYou.textContent = tr("leaderboard_you");
  if (tasksCloseBtn) tasksCloseBtn.textContent = tr("close");
  if (leaderboardCloseBtn) leaderboardCloseBtn.textContent = tr("close");
}

// ===============================
// User init & API çağrıları
// ===============================
async function initUser() {
  try {
    if (tg?.initDataUnsafe?.user?.id) {
      userId = tg.initDataUnsafe.user.id;
    } else {
      const saved = localStorage.getItem("tap_user_id");
      if (saved) {
        userId = parseInt(saved, 10);
      } else {
        userId = Math.floor(Math.random() * 1_000_000_000);
        localStorage.setItem("tap_user_id", String(userId));
      }
    }

    await fetchUser();
    await fetchTaskStatuses();
    await fetchLeaderboard();
  } catch (err) {
    console.error("initUser error:", err);
  }
}

async function fetchUser() {
  if (!userId) return;
  try {
    const res = await fetch(API_BASE + "/api/me?telegram_id=" + userId);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("/api/me error:", data);
      return;
    }
    userState = data;
    renderUser();
  } catch (err) {
    console.error("fetchUser error:", err);
  }
}

async function tapOnce() {
  if (!userId) return;
  try {
    const res = await fetch(API_BASE + "/api/tap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, taps: 1 }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("/api/tap error:", data);
      alert(tr("tap_failed"));
      return;
    }

    if (data.user) {
      userState = data.user;
      renderUser();
    }

    tapCounter += 1;
    if (tapCounter >= TAPS_PER_AD) {
      tapCounter = 0;
      maybeShowInterstitial();
    }
  } catch (err) {
    console.error("tapOnce error:", err);
    alert(tr("tap_failed"));
  }
}

// Level atlama için backend tarafında /api/upgrade/tap_power da var; istersen kullanırsın.
async function upgradeTapPower() {
  if (!userId) return;
  try {
    const res = await fetch(API_BASE + "/api/upgrade/tap_power", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("upgrade error:", data);
      if (data.detail === "NOT_ENOUGH_COINS") {
        alert(tr("not_enough_coins"));
      }
      return;
    }
    if (data.user) {
      userState = data.user;
      renderUser();
    }
  } catch (err) {
    console.error("upgradeTapPower error:", err);
  }
}

// Görev statüleri
async function fetchTaskStatuses() {
  if (!userId) return;
  try {
    const res = await fetch(
      API_BASE + "/api/tasks/status?telegram_id=" + userId
    );
    const data = await res.json().catch(() => []);
    if (!res.ok) {
      console.error("/api/tasks/status error:", data);
      return;
    }

    data.forEach((row) => {
      taskStatusMap[row.task_id] = row.status;
    });

    renderTasks();
  } catch (err) {
    console.error("fetchTaskStatuses error:", err);
  }
}

async function checkTask(taskId) {
  if (!userId) return;
  try {
    const res = await fetch(API_BASE + "/api/tasks/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, task_id: taskId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("checkTask error:", data);
      return;
    }
    if (data.task_status) {
      taskStatusMap[taskId] = data.task_status;
      renderTasks();
    }
  } catch (err) {
    console.error("checkTask error:", err);
  }
}

async function claimTask(taskId) {
  if (!userId) return;
  try {
    const res = await fetch(API_BASE + "/api/tasks/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, task_id: taskId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("claimTask error:", data);
      if (data.detail === "TASK_NOT_READY") {
        alert(tr("task_not_ready"));
      }
      return;
    }
    if (data.user) {
      userState = data.user;
      renderUser();
    }
    if (data.task_status) {
      taskStatusMap[taskId] = data.task_status;
      renderTasks();
    }
  } catch (err) {
    console.error("claimTask error:", err);
  }
}

// Leaderboard
async function fetchLeaderboard() {
  try {
    const res = await fetch(API_BASE + "/api/leaderboard");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("/api/leaderboard error:", data);
      return;
    }
    renderLeaderboard(data);
  } catch (err) {
    console.error("fetchLeaderboard error:", err);
  }
}

// ===============================
// TonConnect init
// ===============================
function initTonConnect() {
  try {
    const container = document.getElementById("ton-connect-button");
    if (!container || !window.TON_CONNECT_UI) {
      console.log("TonConnectUI veya container yok.");
      return;
    }

    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: TONCONNECT_MANIFEST_URL,
      buttonRootId: "ton-connect-button",
    });

    tonConnectUI.onStatusChange((wallet) => {
      if (wallet) {
        connectedWalletAddress = wallet.account.address;
        console.log("Connected wallet:", connectedWalletAddress);
      } else {
        connectedWalletAddress = null;
      }
    });
  } catch (err) {
    console.error("TonConnect init error:", err);
  }
}

// ===============================
// Daily Tasks UI
// ===============================
function renderTasks() {
  const list = document.getElementById("tasks-list");
  if (!list) return;
  list.innerHTML = "";

  TASKS.forEach((task) => {
    const status = taskStatusMap[task.id] || "pending";

    const card = document.createElement("div");
    card.className = "task-card";

    const icon = document.createElement("div");
    icon.className = "task-icon";
    icon.textContent = task.icon;

    const main = document.createElement("div");
    main.className = "task-main";

    const titleEl = document.createElement("p");
    titleEl.className = "task-title";
    titleEl.textContent = tr(task.titleKey);

    const descRow = document.createElement("div");
    descRow.className = "task-desc-row";

    const descEl = document.createElement("span");
    descEl.className = "task-desc";
    descEl.textContent = tr(task.descKey);

    const infoIcon = document.createElement("span");
    infoIcon.className = "task-info-icon";
    infoIcon.textContent = "ⓘ";
    infoIcon.title = task.rewardText;

    descRow.appendChild(descEl);
    descRow.appendChild(infoIcon);

    const rewardEl = document.createElement("div");
    rewardEl.className = "task-reward";
    rewardEl.textContent = task.rewardText;

    main.appendChild(titleEl);
    main.appendChild(descRow);
    main.appendChild(rewardEl);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    if (task.kind === "reward_ad") {
      const btn = document.createElement("button");
      btn.className = "task-btn primary";
      btn.textContent = tr("watch_ad");
      btn.addEventListener("click", () => showRewardedAdForTask(task.id));
      actions.appendChild(btn);
    } else if (task.kind === "invite") {
      const goBtn = document.createElement("button");
      goBtn.className = "task-btn primary";
      goBtn.textContent = tr("invite_go");
      goBtn.addEventListener("click", () => openInviteShare());
      actions.appendChild(goBtn);

      const checkBtn = document.createElement("button");
      checkBtn.className = "task-btn";
      checkBtn.textContent = tr("invite_check");
      checkBtn.disabled = status === "claimed";
      checkBtn.addEventListener("click", () => checkTask(task.id));
      actions.appendChild(checkBtn);

      const claimBtn = document.createElement("button");
      claimBtn.className = "task-btn";
      claimBtn.textContent = tr("invite_claim");
      claimBtn.disabled = status !== "checked";
      claimBtn.addEventListener("click", () => claimTask(task.id));
      actions.appendChild(claimBtn);
    }

    card.appendChild(icon);
    card.appendChild(main);
    card.appendChild(actions);
    list.appendChild(card);
  });
}

function openInviteShare() {
  if (!userId) return;
  const refLink =
    "https://t.me/TaptoEarnTonBot?start=ref_" + encodeURIComponent(userId);

  const msg =
    currentLang === "tr"
      ? `Tap to Earn TON oyununa katıl! Benim referansımla başla: ${refLink}`
      : `Join Tap to Earn TON! Start with my referral link: ${refLink}`;

  if (tg && tg.shareUrl) {
    tg.shareUrl(refLink, msg);
  } else if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(
      "https://t.me/share/url?url=" +
        encodeURIComponent(refLink) +
        "&text=" +
        encodeURIComponent(msg)
    );
  } else {
    window.open(refLink, "_blank");
  }
}

// ===============================
// Leaderboard UI
// ===============================
function renderLeaderboard(payload) {
  const list = document.getElementById("leaderboard-list");
  const youLine = document.getElementById("leaderboard-you-line");
  if (!list || !youLine) return;

  const top = payload.top || [];
  const rank = payload.rank; // kendi sıran (int veya null)

  list.innerHTML = "";

  top.forEach((row, idx) => {
    const item = document.createElement("div");
    item.className = "leaderboard-item";

    const left = document.createElement("span");
    left.className = "leaderboard-rank";
    left.textContent = `${idx + 1}.`;

    const mid = document.createElement("span");
    mid.className = "leaderboard-name";
    mid.textContent = row.display_name || `User ${row.telegram_id}`;

    const right = document.createElement("span");
    right.className = "leaderboard-coins";
    right.textContent = `${row.coins} 🪙`;

    item.appendChild(left);
    item.appendChild(mid);
    item.appendChild(right);

    list.appendChild(item);
  });

  if (rank && rank > 0) {
    youLine.textContent = `${tr("leaderboard_you")}: #${rank}`;
  } else {
    youLine.textContent = tr("no_rank");
  }
}

// ===============================
// User render
// ===============================
function renderUser() {
  if (!userState) return;

  const levelEl = document.getElementById("level");
  const coinsEl = document.getElementById("coins");
  const powerEl = document.getElementById("tap_power");
  const tonEl = document.getElementById("ton_credits");
  const tonPillEl = document.getElementById("ton-pill-amount");
  const levelProgress = document.getElementById("level-progress-bar");

  if (levelEl) levelEl.textContent = userState.level ?? 1;
  if (coinsEl) coinsEl.textContent = userState.coins ?? 0;
  if (powerEl) powerEl.textContent = userState.tap_power ?? 1;

  const tonVal = userState.ton_credits ?? 0;
  if (tonEl) tonEl.textContent = tonVal.toFixed(2);
  if (tonPillEl) tonPillEl.textContent = tonVal.toFixed(2) + " TON";

  // Level progress (örnek: level başına 1000 * level coin hedefi)
  if (levelProgress) {
    const level = userState.level ?? 1;
    const coins = userState.coins ?? 0;
    const currentLevelCost = level * 1000;
    const nextLevelCost = (level + 1) * 1000;
    const span = nextLevelCost - currentLevelCost || 1;
    const progressRaw = ((coins - currentLevelCost) / span) * 100;
    const progress = Math.max(0, Math.min(100, progressRaw));
    levelProgress.style.width = progress + "%";
  }

  updateLangTexts();
}

// ===============================
// Modal helpers
// ===============================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("open");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("open");
}

// ===============================
// DOMContentLoaded
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  if (tg) {
    try {
      tg.expand();
    } catch (e) {
      console.log("Telegram expand error:", e);
    }
  }

  // butonlar
  const tapBtn = document.getElementById("tap-btn");
  const upgradeBtn = document.getElementById("upgrade-btn");
  const openTasksBtn = document.getElementById("open-tasks-btn");
  const walletIconBtn = document.getElementById("wallet-icon-btn");
  const openLeaderboardBtn = document.getElementById("open-leaderboard-btn");

  const modals = document.querySelectorAll(".modal");
  const closeButtons = document.querySelectorAll("[data-close-modal]");

  if (tapBtn) tapBtn.addEventListener("click", tapOnce);
  if (upgradeBtn) upgradeBtn.addEventListener("click", upgradeTapPower);
  if (openTasksBtn)
    openTasksBtn.addEventListener("click", () => openModal("tasks-modal"));
  if (walletIconBtn)
    walletIconBtn.addEventListener("click", () => openModal("wallet-modal"));
  if (openLeaderboardBtn)
    openLeaderboardBtn.addEventListener("click", () =>
      openModal("leaderboard-modal")
    );

  closeButtons.forEach((btn) => {
    const target = btn.getAttribute("data-close-modal");
    btn.addEventListener("click", () => closeModal(target));
  });

  modals.forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal")) {
        m.classList.remove("open");
      }
    });
  });

  initLanguageSelector();
  updateLangTexts();
  initUser();
  initTonConnect();
  initAdsgram();
});

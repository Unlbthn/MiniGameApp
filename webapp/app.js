"use strict";

// Telegram WebApp
const tg = window.Telegram ? window.Telegram.WebApp : null;

// Backend origin
const API_BASE = window.location.origin;

// Multilingual texts
const LANG = {
  en: {
    tap: "TAP",
    label_level: "Level",
    label_coins: "Coins",
    label_tap_power: "Tap Power",
    label_ton_credits: "TON Credits",

    upgrade_title: "Upgrade",
    upgrade_btn_prefix: "Increase Tap Power (cost: ",
    upgrade_btn_suffix: " coins)",

    turbo_btn: "Activate Turbo x2 (5 min)",
    turbo_inactive: "Turbo: inactive",
    turbo_active: "Turbo: active",
    turbo_limited: "Daily turbo limit reached",

    wallet_title: "TON Wallet",
    wallet_buy: "Buy coins with TON",

    tasks_title: "Daily Tasks",
    tasks_subtitle: "Complete tasks to earn extra coins and TON.",
    tasks_button: "📝 Daily Tasks",

    daily_ton_chest_title: "Daily TON Chest",
    daily_ton_chest_desc: "Watch a rewarded ad to earn TON credits.",
    daily_ton_chest_reward: "+0.01 TON",

    turbo_task_title: "Turbo Boost",
    turbo_task_desc: "Use turbo x2 for 5 minutes (3 times/day).",
    turbo_task_label: "Turbo x2 (5 min)",

    invite_title: "Invite Friends",
    invite_desc: "Share your link. When they reach 200 coins, you earn TON.",
    invite_reward: "+0.02 TON per active friend",

    affiliate_boinker_title: "Open Boinker",
    affiliate_boinker_desc: "Open Boinker and explore.",
    affiliate_dotcoin_title: "Visit DotCoin",
    affiliate_dotcoin_desc: "Open DotCoin mini app.",
    affiliate_bbq_title: "Visit BBQCoin",
    affiliate_bbq_desc: "Check BBQCoin mini app.",

    btn_watch_ad: "WATCH AD",
    btn_go: "GO",
    btn_check: "CHECK",
    btn_claim: "CLAIM",

    msg_not_enough_coins: "Not enough coins.",
    msg_turbo_started: "Turbo activated!",
    msg_turbo_limit: "You reached today's turbo limit.",
    msg_task_checked: "Task checked. If requirements are met, you can CLAIM.",
    msg_task_need_check: "You need to CHECK before CLAIM.",
    msg_task_claimed: "Task completed, reward added.",
    msg_ad_not_ready: "Ad is not available yet.",
    msg_ad_watch_full: "You must watch the full ad to get reward.",
    msg_ad_error: "Error while playing the ad.",
    msg_ad_limit: "You reached your daily video reward limit.",
    msg_ad_reward_ok: "+0.01 TON added to your balance!",
  },
  tr: {
    tap: "TIKLA",
    label_level: "Seviye",
    label_coins: "Coin",
    label_tap_power: "Vuruş Gücü",
    label_ton_credits: "TON Kredisi",

    upgrade_title: "Yükselt",
    upgrade_btn_prefix: "Vuruş Gücünü Artır (maliyet: ",
    upgrade_btn_suffix: " coin)",

    turbo_btn: "Turbo x2 (5 dk)",
    turbo_inactive: "Turbo: pasif",
    turbo_active: "Turbo: aktif",
    turbo_limited: "Günlük turbo hakkın doldu",

    wallet_title: "TON Cüzdan",
    wallet_buy: "TON ile coin satın al",

    tasks_title: "Günlük Görevler",
    tasks_subtitle: "Ek coin ve TON kazanmak için görevleri tamamla.",
    tasks_button: "📝 Günlük Görevler",

    daily_ton_chest_title: "Günlük TON Sandığı",
    daily_ton_chest_desc: "Reklam izleyerek TON kredisi kazan.",
    daily_ton_chest_reward: "+0.01 TON",

    turbo_task_title: "Turbo Güç",
    turbo_task_desc: "5 dakikalık turbo x2 kullan (günlük 3 defa).",
    turbo_task_label: "Turbo x2 (5 dk)",

    invite_title: "Arkadaşlarını Davet Et",
    invite_desc:
      "Linkini paylaş. Arkadaşların 200 coin kazandığında TON kazanırsın.",
    invite_reward: "Aktif arkadaş başına +0.02 TON",

    affiliate_boinker_title: "Boinker'ı Aç",
    affiliate_boinker_desc: "Boinker mini app'i aç ve incele.",
    affiliate_dotcoin_title: "DotCoin'e Git",
    affiliate_dotcoin_desc: "DotCoin mini app'ine göz at.",
    affiliate_bbq_title: "BBQCoin'e Git",
    affiliate_bbq_desc: "BBQCoin mini app'ine katıl.",

    btn_watch_ad: "REKLAM İZLE",
    btn_go: "GİT",
    btn_check: "KONTROL",
    btn_claim: "AL",

    msg_not_enough_coins: "Yetersiz coin.",
    msg_turbo_started: "Turbo aktif!",
    msg_turbo_limit: "Günlük turbo hakkına ulaştın.",
    msg_task_checked:
      "Görev kontrol edildi. Şartlar sağlandıysa şimdi CLAIM deneyebilirsin.",
    msg_task_need_check: "Önce KONTROL yapmalısın.",
    msg_task_claimed: "Görev tamamlandı, ödül hesabına eklendi.",
    msg_ad_not_ready: "Reklam şu an hazır değil.",
    msg_ad_watch_full: "Ödül için reklamı sonuna kadar izlemen gerekiyor.",
    msg_ad_error: "Reklam oynatılırken bir hata oluştu.",
    msg_ad_limit: "Günlük video ödül limitine ulaştın.",
    msg_ad_reward_ok: "+0.01 TON bakiyene eklendi!",
  },
};

let currentLang = localStorage.getItem("tap_lang") || "en";

// User state
let userId = null;
let userState = null;

// AdsGram
let RewardAdController = null;
let InterstitialAdController = null;
const REWARD_BLOCK_ID = "17996"; // Rewarded video block
const INTERSTITIAL_BLOCK_ID = "int-17995"; // Interstitial block

// Ad metrics
let tapCounter = 0;
const TAPS_PER_AD = 50;
let lastAdTime = 0;
const AD_INTERVAL_MS = 60_000;

// Turbo countdown
let turboTimer = null;

// Referral task status
const taskStatusMap = {};

// Telegram WebApp helper
if (tg) {
  try {
    tg.expand();
  } catch (e) {
    console.log("Telegram expand error:", e);
  }
}

/* ---------------------------
   LANGUAGE
---------------------------- */

function getDict() {
  return LANG[currentLang] || LANG.en;
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
      updateLangUI();
      renderTasksBoard();
    });
  });
}

function updateLangUI() {
  const dict = getDict();

  const tapBtn = document.getElementById("tap-btn");
  const labelLevel = document.getElementById("label-level");
  const labelCoins = document.getElementById("label-coins");
  const labelTapPower = document.getElementById("label-tap-power");
  const labelTonCredits = document.getElementById("label-ton-credits");
  const upgradeTitle = document.getElementById("upgrade-title");
  const upgradeBtn = document.getElementById("upgrade-tap-power-btn");
  const turboBtn = document.getElementById("turbo-btn");
  const walletTitle = document.getElementById("wallet-title");
  const walletBuyBtn = document.getElementById("buy-coins-ton-btn");
  const tasksTitle = document.querySelector(".tasks-title");
  const tasksSubtitle = document.querySelector(".tasks-subtitle");
  const openTasksBtn = document.getElementById("open-tasks-btn");
  const turboStatus = document.getElementById("turbo-status");

  if (tapBtn) tapBtn.textContent = dict.tap;
  if (labelLevel) labelLevel.textContent = dict.label_level;
  if (labelCoins) labelCoins.textContent = dict.label_coins;
  if (labelTapPower) labelTapPower.textContent = dict.label_tap_power;
  if (labelTonCredits) labelTonCredits.textContent = dict.label_ton_credits;

  if (upgradeTitle) upgradeTitle.textContent = dict.upgrade_title;
  if (upgradeBtn && userState) {
    const cost = getUpgradeCost();
    upgradeBtn.textContent =
      dict.upgrade_btn_prefix + cost + dict.upgrade_btn_suffix;
  }

  if (turboBtn) turboBtn.textContent = dict.turbo_btn;
  if (turboStatus) {
    turboStatus.textContent = isTurboActive()
      ? dict.turbo_active
      : dict.turbo_inactive;
  }

  if (walletTitle) walletTitle.textContent = dict.wallet_title;
  if (walletBuyBtn) walletBuyBtn.textContent = dict.wallet_buy;
  if (tasksTitle) tasksTitle.textContent = dict.tasks_title;
  if (tasksSubtitle) tasksSubtitle.textContent = dict.tasks_subtitle;
  if (openTasksBtn) openTasksBtn.textContent = dict.tasks_button;
}

/* ---------------------------
   ADSGRAM
---------------------------- */

function initAdsgram() {
  if (!window.Adsgram) {
    console.log("AdsGram SDK not found.");
    return;
  }

  try {
    RewardAdController = window.Adsgram.init({
      blockId: REWARD_BLOCK_ID,
    });
    InterstitialAdController = window.Adsgram.init({
      blockId: INTERSTITIAL_BLOCK_ID,
    });
    console.log("AdsGram init OK", REWARD_BLOCK_ID, INTERSTITIAL_BLOCK_ID);
  } catch (err) {
    console.error("AdsGram init error:", err);
  }
}

function maybeShowInterstitial() {
  if (!InterstitialAdController) return;
  const now = Date.now();
  if (now - lastAdTime < AD_INTERVAL_MS) return;

  lastAdTime = now;
  InterstitialAdController.show().catch((err) => {
    console.error("Interstitial ad error:", err);
  });
}

function showRewardAd() {
  const dict = getDict();
  if (!RewardAdController) {
    alert(dict.msg_ad_not_ready);
    return;
  }

  RewardAdController.show()
    .then((result) => {
      console.log("Reward ad result:", result);
      if (result && result.done && !result.error) {
        claimAdRewardFromBackend();
      } else {
        alert(dict.msg_ad_watch_full);
      }
    })
    .catch((err) => {
      console.error("Reward ad error:", err);
      alert(dict.msg_ad_error);
    });
}

async function claimAdRewardFromBackend() {
  const dict = getDict();
  if (!userId) return;

  try {
    const res = await fetch(API_BASE + "/api/reward/ad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data && data.detail === "DAILY_LIMIT_REACHED") {
        alert(dict.msg_ad_limit);
        return;
      }
      throw new Error("Reward request failed");
    }

    const data = await res.json();
    if (data.user) {
      userState = data.user;
      renderUser();
    }
    alert(dict.msg_ad_reward_ok);
  } catch (err) {
    console.error("claimAdRewardFromBackend error:", err);
  }
}

/* ---------------------------
   TON CONNECT
---------------------------- */

let tonConnectUI = null;
let connectedWalletAddress = null;

// Demo manifest (ileride kendi manifest'ini ekleyebilirsin)
const TONCONNECT_MANIFEST_URL =
  "https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json";

function initTonConnect() {
  try {
    const container = document.getElementById("ton-connect-button");
    if (!container || !window.TON_CONNECT_UI) {
      console.log("TonConnect UI yok veya container bulunamadı.");
      return;
    }

    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: TONCONNECT_MANIFEST_URL,
      buttonRootId: "ton-connect-button",
    });

    tonConnectUI.onStatusChange((wallet) => {
      const addrEl = document.getElementById("wallet-address");
      if (wallet) {
        connectedWalletAddress = wallet.account.address;
        if (addrEl) {
          addrEl.textContent = "Wallet: " + connectedWalletAddress;
        }
      } else {
        connectedWalletAddress = null;
        if (addrEl) addrEl.textContent = "";
      }
    });
  } catch (err) {
    console.error("TonConnect init error:", err);
  }
}

async function buyCoinsWithTon() {
  const dict = getDict();
  if (!tonConnectUI || !connectedWalletAddress) {
    alert("Önce TON cüzdanını bağlamalısın.");
    return;
  }

  try {
    await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [
        {
          // Senin TON adresin:
          address: "UQBMjI5CjFPMy7ouPUvpD0hZMdxOvaoROuzcUFxRkkL4TP3f",
          amount: "100000000", // 0.1 TON (nanoTON cinsinden)
        },
      ],
    });
  } catch (err) {
    console.error("TON transaction error:", err);
  }
}

/* ---------------------------
   USER INIT / FETCH
---------------------------- */

async function initUser() {
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
}

async function fetchUser() {
  if (!userId) return;
  try {
    const res = await fetch(API_BASE + "/api/me?telegram_id=" + userId);
    if (!res.ok) throw new Error("get /api/me failed");
    userState = await res.json();
    renderUser();
  } catch (err) {
    console.error("fetchUser error:", err);
  }
}

/* ---------------------------
   TAP / UPGRADE / TURBO
---------------------------- */

function getUpgradeCost() {
  if (!userState || typeof userState.tap_power !== "number") return 100;
  return userState.tap_power * 100;
}

async function tapOnce() {
  if (!userId) return;

  try {
    const res = await fetch(API_BASE + "/api/tap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, taps: 1 }),
    });
    if (!res.ok) throw new Error("tap failed");
    const data = await res.json();
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
  }
}

async function upgradeTapPower() {
  const dict = getDict();
  if (!userId) return;

  try {
    const res = await fetch(API_BASE + "/api/upgrade/tap_power", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      if (errData.detail === "NOT_ENOUGH_COINS") {
        alert(dict.msg_not_enough_coins);
        return;
      }
      throw new Error("upgrade failed");
    }

    const data = await res.json();
    if (data.user) {
      userState = data.user;
      renderUser();
    }
  } catch (err) {
    console.error("upgradeTapPower error:", err);
  }
}

function isTurboActive() {
  if (!userState || !userState.turbo_end) return false;
  const end = new Date(userState.turbo_end).getTime();
  return Date.now() < end;
}

function startTurboCountdown() {
  const turboStatus = document.getElementById("turbo-status");
  const dict = getDict();

  if (turboTimer) {
    clearInterval(turboTimer);
    turboTimer = null;
  }

  if (!userState || !userState.turbo_end) {
    if (turboStatus) turboStatus.textContent = dict.turbo_inactive;
    return;
  }

  const endTime = new Date(userState.turbo_end).getTime();
  turboTimer = setInterval(() => {
    const now = Date.now();
    const diff = endTime - now;
    if (diff <= 0) {
      clearInterval(turboTimer);
      turboTimer = null;
      if (turboStatus) turboStatus.textContent = dict.turbo_inactive;
      return;
    }
    const secs = Math.floor(diff / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (turboStatus) {
      turboStatus.textContent =
        dict.turbo_active +
        " (" +
        String(m).padStart(2, "0") +
        ":" +
        String(s).padStart(2, "0") +
        ")";
    }
  }, 1000);
}

async function startTurbo() {
  const dict = getDict();
  if (!userId) return;

  try {
    const res = await fetch(API_BASE + "/api/turbo/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.detail === "DAILY_TURBO_LIMIT") {
        alert(dict.msg_turbo_limit);
        return;
      }
      throw new Error("turbo failed");
    }

    const data = await res.json();
    if (data.user) {
      userState = data.user;
      renderUser();
      alert(dict.msg_turbo_started);
    }
  } catch (err) {
    console.error("startTurbo error:", err);
  }
}

/* ---------------------------
   RENDER USER
---------------------------- */

function renderUser() {
  if (!userState) return;

  const levelEl = document.getElementById("level");
  const coinsEl = document.getElementById("coins");
  const powerEl = document.getElementById("tap_power");
  const tonCreditsEl = document.getElementById("ton_credits");
  const tonBalanceText = document.getElementById("ton-balance-text");

  if (levelEl) levelEl.textContent = userState.level;
  if (coinsEl) coinsEl.textContent = userState.coins;
  if (powerEl) powerEl.textContent = userState.tap_power;
  const tonVal = userState.ton_credits ?? 0;
  if (tonCreditsEl) tonCreditsEl.textContent = tonVal.toFixed(2);
  if (tonBalanceText) tonBalanceText.textContent = tonVal.toFixed(2);

  updateLangUI();
  startTurboCountdown();
}

/* ---------------------------
   TASKS
---------------------------- */

const TASKS = [
  {
    id: "daily_ton_chest",
    type: "reward",
    iconType: "reward",
    iconEmoji: "🎁",
    titleKey: "daily_ton_chest_title",
    descKey: "daily_ton_chest_desc",
    rewardKey: "daily_ton_chest_reward",
  },
  {
    id: "turbo_task",
    type: "turbo",
    iconType: "turbo",
    iconEmoji: "⚡",
    titleKey: "turbo_task_title",
    descKey: "turbo_task_desc",
    rewardKey: "turbo_task_label",
  },
  {
    id: "invite_friends",
    type: "referral",
    iconType: "referral",
    iconEmoji: "👥",
    titleKey: "invite_title",
    descKey: "invite_desc",
    rewardKey: "invite_reward",
  },
  {
    id: "affiliate_boinker",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🧠",
    titleKey: "affiliate_boinker_title",
    descKey: "affiliate_boinker_desc",
    rewardKey: "affiliate_boinker_desc",
    url: "https://t.me/boinker_bot?start=_tgr_TiWlA9A5YWY8",
  },
  {
    id: "affiliate_dotcoin",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🟡",
    titleKey: "affiliate_dotcoin_title",
    descKey: "affiliate_dotcoin_desc",
    rewardKey: "affiliate_dotcoin_desc",
    url: "https://t.me/dotcoin_bot",
  },
  {
    id: "affiliate_bbqcoin",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🍖",
    titleKey: "affiliate_bbq_title",
    descKey: "affiliate_bbq_desc",
    rewardKey: "affiliate_bbq_desc",
    url: "https://t.me/BBQCoin_bot",
  },
];

async function fetchTaskStatuses() {
  if (!userId) return;
  try {
    const res = await fetch(API_BASE + "/api/tasks/status?telegram_id=" + userId);
    if (!res.ok) throw new Error("tasks/status failed");
    const data = await res.json();
    data.forEach((t) => {
      taskStatusMap[t.task_id] = t.status;
    });
    renderTasksBoard();
  } catch (err) {
    console.error("fetchTaskStatuses error:", err);
  }
}

function renderTasksBoard() {
  const container = document.getElementById("tasks-list");
  if (!container) return;
  container.innerHTML = "";

  const dict = getDict();

  TASKS.forEach((task) => {
    const status = taskStatusMap[task.id] || "pending";

    const card = document.createElement("div");
    card.className = "task-card";

    const icon = document.createElement("div");
    icon.className = "task-icon " + task.iconType;
    icon.textContent = task.iconEmoji || "⭐";

    const main = document.createElement("div");
    main.className = "task-main";

    const titleRow = document.createElement("div");
    titleRow.className = "task-title-row";

    const titleEl = document.createElement("p");
    titleEl.className = "task-title";
    titleEl.textContent = dict[task.titleKey] || "";

    const infoEl = document.createElement("span");
    infoEl.className = "task-info-icon";
    infoEl.textContent = "•";

    titleRow.appendChild(titleEl);
    titleRow.appendChild(infoEl);

    const descEl = document.createElement("p");
    descEl.className = "task-desc";
    descEl.textContent = dict[task.descKey] || "";

    const rewardEl = document.createElement("div");
    rewardEl.className = "task-reward";
    rewardEl.textContent = dict[task.rewardKey] || "";

    main.appendChild(titleRow);
    main.appendChild(descEl);
    main.appendChild(rewardEl);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    if (task.type === "reward") {
      const btn = document.createElement("button");
      btn.className = "task-cta-btn primary";
      btn.textContent = dict.btn_watch_ad;
      btn.addEventListener("click", () => showRewardAd());
      actions.appendChild(btn);
    } else if (task.type === "turbo") {
      const btn = document.createElement("button");
      btn.className = "task-cta-btn primary";
      btn.textContent = dict.btn_go;
      btn.addEventListener("click", () => startTurbo());
      actions.appendChild(btn);
    } else if (task.type === "affiliate" || task.type === "referral") {
      const goBtn = document.createElement("button");
      goBtn.className = "task-cta-btn";
      goBtn.textContent = dict.btn_go;
      goBtn.disabled = status === "claimed";
      goBtn.addEventListener("click", () => handleTaskClick(task, "go"));
      actions.appendChild(goBtn);

      const checkBtn = document.createElement("button");
      checkBtn.className = "task-cta-btn";
      checkBtn.textContent = dict.btn_check;
      checkBtn.disabled = status === "claimed";
      checkBtn.addEventListener("click", () => handleTaskClick(task, "check"));
      actions.appendChild(checkBtn);

      const claimBtn = document.createElement("button");
      claimBtn.className = "task-cta-btn primary";
      claimBtn.textContent = dict.btn_claim;
      claimBtn.disabled = status !== "checked";
      claimBtn.addEventListener("click", () => handleTaskClick(task, "claim"));
      actions.appendChild(claimBtn);
    }

    card.appendChild(icon);
    card.appendChild(main);
    card.appendChild(actions);
    container.appendChild(card);
  });
}

function handleTaskClick(task, action) {
  if (task.type === "affiliate") {
    if (action === "go") openAffiliate(task.url);
    else if (action === "check") checkTask(task.id);
    else if (action === "claim") claimTask(task.id);
  } else if (task.type === "referral") {
    const inviteUrl = buildInviteUrl();
    if (action === "go") {
      openAffiliate(inviteUrl);
    } else if (action === "check") {
      checkTask(task.id);
    } else if (action === "claim") {
      claimTask(task.id);
    }
  }
}

function buildInviteUrl() {
  // Telegram bot kullanıcı adı – güncel bot adın buysa bırak, değilse değiştir:
  const base = "https://t.me/TaptoEarnTonBot";
  if (!userId) return base;
  return `${base}?start=ref_${userId}`;
}

function openAffiliate(url) {
  if (!url) return;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank");
}

async function checkTask(taskId) {
  const dict = getDict();
  if (!userId) return;

  try {
    const res = await fetch(API_BASE + "/api/tasks/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, task_id: taskId }),
    });

    if (!res.ok) throw new Error("checkTask failed");
    const data = await res.json();
    taskStatusMap[taskId] = data.task_status;
    renderTasksBoard();
    alert(dict.msg_task_checked);
  } catch (err) {
    console.error("checkTask error:", err);
  }
}

async function claimTask(taskId) {
  const dict = getDict();
  if (!userId) return;

  try {
    const res = await fetch(API_BASE + "/api/tasks/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, task_id: taskId }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.detail === "TASK_NOT_READY") {
        alert(dict.msg_task_need_check);
        return;
      }
      throw new Error("claimTask failed");
    }

    const data = await res.json();
    taskStatusMap[taskId] = data.task_status;
    if (data.user) {
      userState = data.user;
      renderUser();
    }
    renderTasksBoard();
    alert(dict.msg_task_claimed);
  } catch (err) {
    console.error("claimTask error:", err);
  }
}

/* ---------------------------
   MODAL HELPERS
---------------------------- */

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

/* ---------------------------
   DOMContentLoaded
---------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  const tapBtn = document.getElementById("tap-btn");
  const upgradeBtn = document.getElementById("upgrade-tap-power-btn");
  const turboBtn = document.getElementById("turbo-btn");
  const openTasksBtn = document.getElementById("open-tasks-btn");
  const walletOpenBtn = document.getElementById("wallet-open-btn");
  const walletBuyBtn = document.getElementById("buy-coins-ton-btn");
  const closeButtons = document.querySelectorAll("[data-close]");

  if (tapBtn) {
    tapBtn.addEventListener("click", (e) => {
      e.preventDefault();
      tapOnce();
    });
  }

  if (upgradeBtn) {
    upgradeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      upgradeTapPower();
    });
  }

  if (turboBtn) {
    turboBtn.addEventListener("click", (e) => {
      e.preventDefault();
      startTurbo();
    });
  }

  if (openTasksBtn) {
    openTasksBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openModal("tasks-modal");
      renderTasksBoard();
    });
  }

  if (walletOpenBtn) {
    walletOpenBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openModal("wallet-modal");
    });
  }

  if (walletBuyBtn) {
    walletBuyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      buyCoinsWithTon();
    });
  }

  closeButtons.forEach((btn) => {
    const target = btn.getAttribute("data-close");
    btn.addEventListener("click", () => closeModal(target));
  });

  initLanguageSelector();
  updateLangUI();
  initAdsgram();
  initTonConnect();
  initUser();
});

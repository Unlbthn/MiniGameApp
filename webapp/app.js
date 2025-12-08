// ---------------------------
// Telegram WebApp
// ---------------------------
const tg = window.Telegram ? window.Telegram.WebApp : null;

// ---------------------------
// Lang
// ---------------------------
const LANG = {
  en: {
    tap: "TAP",
    upgrade_title: "Upgrade",
    upgrade_btn_prefix: "Increase Tap Power (cost: ",
    wallet_title: "TON Wallet",
    buy_ton: "Buy coins with TON (beta)",
    daily_tasks: "Daily Tasks",
    daily_sub: "Complete tasks to earn extra coins and TON credits.",
    tasks_button: "Daily Tasks",
    ton_credits_label: "TON Credits",
  },
  tr: {
    tap: "TIKLA",
    upgrade_title: "Yükselt",
    upgrade_btn_prefix: "Vuruş Gücünü Artır (maliyet: ",
    wallet_title: "TON Cüzdan",
    buy_ton: "TON ile coin satın al (beta)",
    daily_tasks: "Günlük Görevler",
    daily_sub: "Ek coin ve TON kredisi için görevleri tamamla.",
    tasks_button: "Günlük Görevler",
    ton_credits_label: "TON Kredileri",
  },
};

let currentLang = localStorage.getItem("tap_lang") || "en";

let userId = null;
let userState = null;

// Backend origin (Railway domain)
const API_BASE = window.location.origin;

// ---------------------------
// AdsGram
// ---------------------------
let tapCounter = 0;
const TAPS_PER_AD = 100;
let lastAdTime = 0;
const AD_INTERVAL_MS = 60_000;

// AdsGram block IDs
const ADSGRAM_REWARD_BLOCK_ID = "17996";
const ADSGRAM_INTERSTITIAL_BLOCK_ID = "int-17995";

let RewardController = null;
let InterstitialController = null;

function initAdsgram() {
  if (!window.Adsgram) {
    console.log("AdsGram SDK yok (sad.min.js yüklenemedi).");
    return;
  }

  try {
    RewardController = window.Adsgram.init({
      blockId: ADSGRAM_REWARD_BLOCK_ID,
    });
    InterstitialController = window.Adsgram.init({
      blockId: ADSGRAM_INTERSTITIAL_BLOCK_ID,
    });
    console.log("AdsGram init OK");
  } catch (err) {
    console.error("AdsGram init error:", err);
  }
}

function maybeShowInterstitial() {
  if (!InterstitialController) return;
  const now = Date.now();
  if (now - lastAdTime < AD_INTERVAL_MS) return;

  lastAdTime = now;
  InterstitialController.show().catch((err) =>
    console.error("Interstitial error:", err)
  );
}

function showRewardAd() {
  if (!RewardController) {
    alert("Reklam şu anda hazır değil.");
    return;
  }

  RewardController.show()
    .then((result) => {
      console.log("Reward ad result:", result);
      // AdsGram result.done → kullanıcı videoyu tamamladı
      if (result && result.done && !result.error) {
        return claimAdRewardFromBackend();
      } else {
        alert("Ödül için reklamı tamamen izlemelisin.");
      }
    })
    .catch((err) => {
      console.error("Reward ad error:", err);
      alert("Reklam oynatılamadı, lütfen tekrar dene.");
    });
}

async function claimAdRewardFromBackend() {
  if (!userId) return;

  try {
    const res = await fetch(API_BASE + "/api/reward/ad?telegram_id=" + userId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Hem query hem JSON gönderiyoruz → backend ikisinden birini okuyabiliyor.
      body: JSON.stringify({ telegram_id: userId }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (data.detail === "DAILY_LIMIT_REACHED") {
        alert("Günlük video ödül limitine ulaştın (10/10).");
        return;
      }
      throw new Error(data.detail || "Reward request failed");
    }

    if (data.user) {
      userState = data.user;
      renderUser();
    }

    const remaining = data.remaining ?? "?";
    alert(`+${data.reward_ton.toFixed(2)} TON kazandın! Kalan hak: ${remaining}`);
  } catch (err) {
    console.error("claimAdRewardFromBackend error:", err);
    alert("Ödül alınırken hata oluştu.");
  }
}

// ---------------------------
// Tasks config (Boinker tarzı, sade)
// ---------------------------
const TASKS = [
  {
    id: "reward_video",
    type: "reward",
    iconType: "reward",
    iconEmoji: "🎬",
    title: "Daily TON Chest",
    description: "Watch a video ad and earn extra TON credits.",
    badge: "Daily",
    rewardText: "+0.10 TON per ad (max 10/day)",
  },
  {
    id: "turbo_task",
    type: "turbo",
    iconType: "affiliate",
    iconEmoji: "⚡",
    title: "Turbo x2 (10 min)",
    description: "Activate 2x tap power for 10 minutes.",
    badge: "x2 Boost",
    rewardText: "2x Tap Power for 10 min",
  },
  {
    id: "affiliate_boinker",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🧠",
    title: "Open Boinker",
    description: "Open Boinker mini-app and explore.",
    badge: "Partner",
    rewardText: "+1000 coins",
    url: "https://t.me/boinker_bot?start=_tgr_TiWlA9A5YWY8",
  },
  {
    id: "invite_friends",
    type: "invite",
    iconType: "affiliate",
    iconEmoji: "👥",
    title: "Invite Friends",
    description: "Share your link. When friend reaches 200 coins, claim TON.",
    badge: "Referral",
    rewardText: "+0.02 TON",
  },
];

const taskStatusMap = {};
const taskUnlockTimers = {}; // id -> true: CHECK/CLAIM aktif

// ---------------------------
// TonConnect (şimdilik sadece UI),
// gerçek on-chain ödemeyi sonra kuracağız.
// ---------------------------
let tonConnectUI = null;
let connectedWalletAddress = null;

const TONCONNECT_MANIFEST_URL =
  "https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json";

function initTonConnect() {
  try {
    const container = document.getElementById("ton-connect-button");
    if (!container || !window.TON_CONNECT_UI) {
      console.log("TonConnect UI veya container yok.");
      return;
    }

    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: TONCONNECT_MANIFEST_URL,
      buttonRootId: "ton-connect-button",
    });

    tonConnectUI.onStatusChange((wallet) => {
      if (wallet) {
        connectedWalletAddress = wallet.account.address;
        const addrEl = document.getElementById("wallet-address");
        if (addrEl) addrEl.textContent = "Wallet: " + connectedWalletAddress;
      } else {
        connectedWalletAddress = null;
        const addrEl = document.getElementById("wallet-address");
        if (addrEl) addrEl.textContent = "";
      }
    });
  } catch (err) {
    console.error("TonConnect init error:", err);
  }
}

// ---------------------------
// Upgrade cost + language UI
// ---------------------------
function getUpgradeCost() {
  if (!userState || typeof userState.tap_power !== "number") return 100;
  return userState.tap_power * 100;
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
    });
  });
}

function updateLangUI() {
  const dict = LANG[currentLang] || LANG.en;
  const tapBtn = document.getElementById("tap-btn");
  const upgradeTitle = document.querySelector(".upgrade-section h2");
  const upgradeBtn = document.getElementById("upgrade-tap-power-btn");

  const cost = getUpgradeCost();

  if (tapBtn) tapBtn.textContent = dict.tap;
  if (upgradeTitle) upgradeTitle.textContent = dict.upgrade_title;
  if (upgradeBtn)
    upgradeBtn.textContent = `${dict.upgrade_btn_prefix}${cost} coins)`;
}

// ---------------------------
// User init + fetch
// ---------------------------
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
  initInviteLink();
}

async function fetchUser() {
  if (!userId) return;
  try {
    const res = await fetch(API_BASE + "/api/me?telegram_id=" + userId);
    if (!res.ok) throw new Error("get /api/me failed");
    const data = await res.json();
    userState = data;
    renderUser();
  } catch (err) {
    console.error("fetchUser error:", err);
  }
}

// ---------------------------
// Tap / Upgrade
// ---------------------------
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
  if (!userId) return;

  try {
    const res = await fetch(API_BASE + "/api/upgrade/tap_power", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.detail === "NOT_ENOUGH_COINS") {
        alert("Yetersiz coin!");
        return;
      }
      throw new Error("upgrade failed");
    }
    if (data.user) {
      userState = data.user;
      renderUser();
    }
  } catch (err) {
    console.error("upgradeTapPower error:", err);
  }
}

// ---------------------------
// User render
// ---------------------------
function renderUser() {
  if (!userState) return;

  const levelEl = document.getElementById("level-value");
  const coinsEl = document.getElementById("coins");
  const powerEl = document.getElementById("tap_power");
  const tonCreditsEl = document.getElementById("ton_credits");
  const tonBalanceEl = document.getElementById("ton-balance");
  const progressEl = document.getElementById("level-progress");

  if (levelEl) levelEl.textContent = userState.level;
  if (coinsEl) coinsEl.textContent = userState.coins;
  if (powerEl) powerEl.textContent = userState.tap_power;
  const ton = (userState.ton_credits ?? 0).toFixed(2);
  if (tonCreditsEl) tonCreditsEl.textContent = ton;
  if (tonBalanceEl) tonBalanceEl.textContent = ton;

  // basit level progress: current / required (level*1000)
  if (progressEl) {
    const level = userState.level || 1;
    const required = level * 1000;
    const coins = userState.coins || 0;
    const prevThreshold = (level - 1) * 1000;
    const inLevel = Math.max(0, coins - prevThreshold);
    const span = required - prevThreshold;
    const pct = Math.max(0, Math.min(100, (inLevel / span) * 100));
    progressEl.style.width = pct + "%";
  }

  updateLangUI();
}

// ---------------------------
// Tasks & status
// ---------------------------
async function fetchTaskStatuses() {
  if (!userId) return;
  try {
    const res = await fetch(
      API_BASE + "/api/tasks/status?telegram_id=" + userId
    );
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
    titleEl.textContent = task.title;

    const infoBadge = document.createElement("span");
    infoBadge.className = "task-info-badge";
    infoBadge.textContent = task.badge || "!";

    titleRow.appendChild(titleEl);
    titleRow.appendChild(infoBadge);

    const descEl = document.createElement("p");
    descEl.className = "task-desc";
    descEl.textContent = task.description;

    const rewardEl = document.createElement("div");
    rewardEl.className = "task-reward";
    rewardEl.textContent = task.rewardText;

    main.appendChild(titleRow);
    main.appendChild(descEl);
    main.appendChild(rewardEl);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    if (task.id === "reward_video") {
      const btn = document.createElement("button");
      btn.className = "task-cta-btn";
      btn.textContent = "WATCH AD";
      btn.addEventListener("click", () => showRewardAd());
      actions.appendChild(btn);
    } else {
      const goBtn = document.createElement("button");
      goBtn.className = "task-cta-btn";
      goBtn.textContent = "GO";
      goBtn.disabled = status === "claimed";
      goBtn.addEventListener("click", () => handleTaskClick(task, "go"));
      actions.appendChild(goBtn);

      const checkBtn = document.createElement("button");
      checkBtn.className = "task-cta-btn";
      checkBtn.textContent = "CHECK";
      // GO'ya basılıp birkaç saniye geçmeden CHECK aktif olmasın
      const locked = !taskUnlockTimers[task.id];
      checkBtn.disabled = locked || status === "claimed";
      checkBtn.addEventListener("click", () => handleTaskClick(task, "check"));
      actions.appendChild(checkBtn);

      const claimBtn = document.createElement("button");
      claimBtn.className = "task-cta-btn";
      claimBtn.textContent = "CLAIM";
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
  if (task.id === "reward_video") {
    if (action === "go") showRewardAd();
    return;
  }

  if (task.type === "affiliate") {
    if (action === "go") openAffiliate(task.url, task.id);
    else if (action === "check") checkTask(task.id);
    else if (action === "claim") claimTask(task.id);
  } else if (task.type === "turbo") {
    if (action === "go") startTurboTask(task.id);
    else if (action === "check") checkTask(task.id);
    else if (action === "claim") claimTask(task.id);
  } else if (task.type === "invite") {
    if (action === "go") openInviteModal();
    else if (action === "check") checkTask(task.id);
    else if (action === "claim") claimTask(task.id);
  }
}

function openAffiliate(url, taskId) {
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank");

  // 5 saniye sonra CHECK aktif olsun
  taskUnlockTimers[taskId] = false;
  setTimeout(() => {
    taskUnlockTimers[taskId] = true;
    renderTasksBoard();
  }, 5000);
}

async function checkTask(taskId) {
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
    alert("Görev kontrol edildi, şimdi CLAIM deneyebilirsin.");
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
    const data = await res.json();
    if (!res.ok) {
      if (data.detail === "TASK_NOT_READY") {
        alert("Önce CHECK yapmalısın.");
        return;
      }
      throw new Error("claimTask failed");
    }
    taskStatusMap[taskId] = data.task_status;
    if (data.user) {
      userState = data.user;
      renderUser();
    }
    renderTasksBoard();
    if (data.reward_coins) {
      alert(`Görev tamamlandı, +${data.reward_coins} coin kazandın!`);
    } else if (data.reward_ton) {
      alert(`Görev tamamlandı, +${data.reward_ton.toFixed(2)} TON kazandın!`);
    } else {
      alert("Görev tamamlandı!");
    }
  } catch (err) {
    console.error("claimTask error:", err);
  }
}

// Turbo sadece görevden gelsin
async function startTurboTask(taskId) {
  if (!userId) return;
  try {
    const res = await fetch(API_BASE + "/api/turbo/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.detail === "DAILY_TURBO_LIMIT") {
        alert("Günlük Turbo limitine ulaştın.");
        return;
      }
      throw new Error("turbo failed");
    }
    if (data.user) {
      userState = data.user;
      renderUser();
    }
    alert("Turbo x2 etkin! 10 dakika boyunca tap gücün 2x.");
  } catch (err) {
    console.error("startTurboTask error:", err);
  }
}

// ---------------------------
// Invite friends
// ---------------------------
function initInviteLink() {
  const input = document.getElementById("invite-link-input");
  if (!input || !userId) return;

  // Basit referans linki
  const url = `https://t.me/TaptoEarnTonBot/TapToEarnTonBot?start=ref_${userId}`;
  input.value = url;
}

function openInviteModal() {
  openModal("invite-modal");
}

function setupInviteHandlers() {
  const copyBtn = document.getElementById("invite-copy-btn");
  const shareBtn = document.getElementById("invite-share-btn");
  const input = document.getElementById("invite-link-input");

  if (copyBtn && input) {
    copyBtn.addEventListener("click", () => {
      input.select();
      document.execCommand("copy");
      alert("Link kopyalandı!");
    });
  }

  if (shareBtn && input) {
    shareBtn.addEventListener("click", () => {
      const text = "Tap to Earn TON oyununa katıl! " + input.value;
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(
          "https://t.me/share/url?url=" +
            encodeURIComponent(input.value) +
            "&text=" +
            encodeURIComponent(text)
        );
      } else if (navigator.share) {
        navigator.share({ text, url: input.value }).catch(() => {});
      } else {
        window.open(
          "https://t.me/share/url?url=" +
            encodeURIComponent(input.value) +
            "&text=" +
            encodeURIComponent(text),
          "_blank"
        );
      }
    });
  }
}

// ---------------------------
// Modal helpers
// ---------------------------
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

// ---------------------------
// DOMContentLoaded
// ---------------------------
document.addEventListener("DOMContentLoaded", () => {
  if (tg) {
    try {
      tg.expand();
    } catch (e) {
      console.log("Telegram expand error:", e);
    }
  }

  const tapBtn = document.getElementById("tap-btn");
  const upgradeBtn = document.getElementById("upgrade-tap-power-btn");
  const dailyChestBtn = document.getElementById("daily-chest-btn");
  const openTasksBtn = document.getElementById("open-tasks-btn");
  const inviteOpenBtn = document.getElementById("invite-open-btn");
  const leaderboardBtn = document.getElementById("leaderboard-btn");
  const closeButtons = document.querySelectorAll(".overlay-close");

  if (tapBtn) tapBtn.addEventListener("click", tapOnce);
  if (upgradeBtn) upgradeBtn.addEventListener("click", upgradeTapPower);
  if (dailyChestBtn) dailyChestBtn.addEventListener("click", showRewardAd);
  if (openTasksBtn)
    openTasksBtn.addEventListener("click", () => {
      openModal("tasks-modal");
      renderTasksBoard();
    });
  if (inviteOpenBtn)
    inviteOpenBtn.addEventListener("click", () => openInviteModal());
  if (leaderboardBtn)
    leaderboardBtn.addEventListener("click", () =>
      alert("Leaderboard çok yakında.")
    );

  closeButtons.forEach((btn) => {
    const target = btn.getAttribute("data-close");
    btn.addEventListener("click", () => closeModal(target));
  });

  initLanguageSelector();
  updateLangUI();
  initUser();
  initTonConnect();
  initAdsgram();
  setupInviteHandlers();
});

// Telegram WebApp objesi
const tg = window.Telegram ? window.Telegram.WebApp : null;

// ---------------------------
// Dil metinleri
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

// Backend origin
const API_BASE = window.location.origin;

// ---------------------------
// Double-tap zoom engelleme
// ---------------------------
let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  function (event) {
    const now = new Date().getTime();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  },
  { passive: false }
);

// ---------------------------
// AdsGram
// ---------------------------
let AdInter = null;
let AdReward = null;

// AdsGram block ID'leri
const ADSGRAM_BLOCK_ID_INTER = "int-17995"; // Interstitial
const ADSGRAM_BLOCK_ID_REWARD = "17996"; // Rewarded

function initAdsgram() {
  if (!window.Adsgram) {
    console.log("AdsGram SDK yok (sad.min.js yüklü mü?)");
    return;
  }

  try {
    if (!AdInter) {
      AdInter = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID_INTER });
      console.log("AdsGram Interstitial init:", ADSGRAM_BLOCK_ID_INTER);
    }
  } catch (e) {
    console.error("AdsGram interstitial init error:", e);
  }

  try {
    if (!AdReward) {
      AdReward = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID_REWARD });
      console.log("AdsGram Reward init:", ADSGRAM_BLOCK_ID_REWARD);
    }
  } catch (e) {
    console.error("AdsGram reward init error:", e);
  }
}

let tapCounter = 0;
const TAPS_PER_AD = 50;
let lastAdTime = 0;
const AD_INTERVAL_MS = 60_000;

// Araya interstitial reklam koy
function maybeShowInterstitial() {
  if (!AdInter) return;
  const now = Date.now();
  if (now - lastAdTime < AD_INTERVAL_MS) return;
  lastAdTime = now;

  AdInter.show()
    .then((res) => console.log("Interstitial OK:", res))
    .catch((err) => console.error("Interstitial error:", err));
}

// Rewarded video (Daily TON Chest + diğer reward görevler)
function showRewardAd(onSuccess) {
  if (!AdReward) {
    alert("Reklam şu anda hazır değil.");
    return;
  }

  AdReward.show()
    .then((result) => {
      console.log("Reward ad result:", result);
      if (result && result.done && !result.error) {
        // Reklam sonuna kadar izlendi → callback varsa çağır
        if (typeof onSuccess === "function") {
          onSuccess();
        } else {
          // Default davranış: backend'ten 0.01 TON iste
          claimAdRewardFromBackend();
        }
      } else {
        alert("Ödül için reklamı tamamen izlemen gerekiyor.");
      }
    })
    .catch((err) => {
      console.error("Reward ad error:", err);
      alert("Reklam oynatılırken bir hata oluştu.");
    });
}

async function claimAdRewardFromBackend() {
  if (!userId) return;

  try {
    const res = await fetch(API_BASE + "/api/reward/ad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.detail === "DAILY_LIMIT_REACHED") {
        alert("Günlük video izleme ödül limitine ulaştın (10/10).");
        return;
      }
      throw new Error("Reward request failed");
    }

    const data = await res.json();
    if (data.user) {
      userState = data.user;
    }
    renderUser();
    alert(`+0.01 TON kazandın! Kalan hak: ${data.remaining}/10`);
  } catch (err) {
    console.error("claimAdRewardFromBackend error:", err);
  }
}

// ---------------------------
// Tap Turbo Boost (front-end only)
// ---------------------------
let tapBoostMultiplier = 1;
let tapBoostExpiresAt = 0; // timestamp (ms)
const BOOST_DURATION_MS = 5 * 60_000; // 5 dakika

function loadBoostFromStorage() {
  try {
    const raw = localStorage.getItem("tap_boost_state");
    if (!raw) return;
    const obj = JSON.parse(raw);
    tapBoostMultiplier = obj.multiplier || 1;
    tapBoostExpiresAt = obj.expiresAt || 0;
  } catch (e) {
    console.error("loadBoostFromStorage error:", e);
  }
}

function saveBoostToStorage() {
  try {
    localStorage.setItem(
      "tap_boost_state",
      JSON.stringify({
        multiplier: tapBoostMultiplier,
        expiresAt: tapBoostExpiresAt,
      })
    );
  } catch (e) {
    console.error("saveBoostToStorage error:", e);
  }
}

function isBoostActive() {
  const now = Date.now();
  return tapBoostMultiplier > 1 && tapBoostExpiresAt > now;
}

function deactivateBoost() {
  tapBoostMultiplier = 1;
  tapBoostExpiresAt = 0;
  saveBoostToStorage();
  updateBoostUI();
}

function activateBoost(multiplier = 2, durationMs = BOOST_DURATION_MS) {
  const now = Date.now();
  tapBoostMultiplier = multiplier;
  tapBoostExpiresAt = now + durationMs;
  saveBoostToStorage();
  updateBoostUI();
  alert(`⚡ ${multiplier}x Tap Boost aktif! ${Math.floor(
    durationMs / 60000
  )} dakika boyunca geçerli.`);
}

function formatBoostRemaining() {
  if (!isBoostActive()) return "";
  const diff = tapBoostExpiresAt - Date.now();
  const totalSec = Math.max(0, Math.floor(diff / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function updateBoostUI() {
  const boostBadge = document.getElementById("boost-badge");
  const tapBtn = document.getElementById("tap-btn");

  if (!boostBadge && !tapBtn) return;

  if (isBoostActive()) {
    const remaining = formatBoostRemaining();
    if (boostBadge) {
      boostBadge.classList.remove("hidden");
      boostBadge.textContent = `⚡ x${tapBoostMultiplier} • ${remaining}`;
    }
    if (tapBtn) {
      tapBtn.textContent =
        (LANG[currentLang] || LANG.en).tap + ` (x${tapBoostMultiplier})`;
    }
  } else {
    if (boostBadge) {
      boostBadge.classList.add("hidden");
      boostBadge.textContent = "";
    }
    if (tapBtn) {
      tapBtn.textContent = (LANG[currentLang] || LANG.en).tap;
    }
  }
}

// Tasks içinden çağrılacak Tap Turbo Boost
function showBoostAd() {
  showRewardAd(() => {
    // Reklam başarıyla izlenince boost aktif et
    activateBoost(2, BOOST_DURATION_MS);
  });
}

// Her saniye kalan süreyi güncelle
setInterval(() => {
  if (isBoostActive()) {
    updateBoostUI();
  } else if (tapBoostMultiplier > 1) {
    // Süre bittiyse
    deactivateBoost();
  }
}, 1000);

// ---------------------------
// Tasks config
// ---------------------------

/*
 Task type'ları:
 - "reward_chest"   : Daily TON Chest (reward video + 0.01 TON, backend kontrol)
 - "boost"          : Tap Turbo Boost (frontend multiplier, reward video ile açılıyor)
 - "affiliate"      : Diğer mini-app / bot linkleri (GO / CHECK / CLAIM)
 - "invite"         : Referral link paylaşma (SHARE FRIENDS)
*/

const TASKS = [
  {
    id: "daily_ton_chest",
    type: "reward_chest",
    iconEmoji: "🎁",
    title: "Daily TON Chest",
    description: "Watch a rewarded ad to earn 0.01 TON. (Max 10/day)",
    rewardText: "+0.01 TON (up to 10/day)",
  },
  {
    id: "tap_turbo_boost",
    type: "boost",
    iconEmoji: "⚡",
    title: "Tap Turbo Boost",
    description: "Watch an ad to activate 2x tap power for 5 minutes.",
    rewardText: "2x Tap Power • 5 min",
  },
  {
    id: "invite_friends",
    type: "invite",
    iconEmoji: "👥",
    title: "Invite Friends",
    description: "Share your personal referral link with your friends.",
    rewardText: "More users → more ad revenue",
  },
  {
    id: "affiliate_boinker",
    type: "affiliate",
    iconEmoji: "🧠",
    title: "Open Boinker Mini-App",
    description: "Open Boinker and explore the game.",
    rewardText: "+1000 coins (claim after check)",
    url: "https://t.me/boinker_bot?start=_tgr_TiWlA9A5YWY8",
  },
  {
    id: "affiliate_dotcoin",
    type: "affiliate",
    iconEmoji: "🟡",
    title: "Visit DotCoin Bot",
    description: "Open DotCoin from Telegram.",
    rewardText: "+1000 coins",
    url: "https://t.me/dotcoin_bot",
  },
  {
    id: "affiliate_bbqcoin",
    type: "affiliate",
    iconEmoji: "🍖",
    title: "Visit BBQCoin",
    description: "Join BBQCoin and check the game.",
    rewardText: "+1000 coins",
    url: "https://t.me/BBQCoin_bot",
  },
];

// task_id -> status ("pending", "checked", "claimed")
const taskStatusMap = {};

// ---------------------------
// TON wallet (TonConnect) – iskelet
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
        if (addrEl) {
          addrEl.textContent = "Wallet: " + connectedWalletAddress;
        }
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

async function buyCoinsWithTon() {
  if (!tonConnectUI || !connectedWalletAddress) {
    alert("Önce TON cüzdanını bağlamalısın.");
    return;
  }

  try {
    await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [
        {
          address: "YOUR_TON_WALLET_ADDRESS",
          amount: "100000000", // 0.1 TON
        },
      ],
    });
  } catch (err) {
    console.error("TON transaction error:", err);
  }
}

// ---------------------------
// Upgrade cost
// ---------------------------
function getUpgradeCost() {
  if (!userState || typeof userState.tap_power !== "number") return 100;
  return userState.tap_power * 100;
}

// ---------------------------
// Dil seçici
// ---------------------------
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
  const walletTitle = document.querySelector(".wallet-title");
  const buyTonBtn = document.getElementById("buy-coins-ton-btn");
  const tasksTitle = document.querySelector(".tasks-title");
  const tasksSubtitle = document.querySelector(".tasks-subtitle");
  const tasksOpenBtn = document.getElementById("open-tasks-btn");
  const tonCreditsLabel = document.querySelector(
    "#user-info p:nth-of-type(4)"
  );

  const cost = getUpgradeCost();

  if (tapBtn) {
    // Boost aktifse boost UI fonksiyonu override edecek
    tapBtn.textContent = dict.tap;
  }
  if (upgradeTitle) upgradeTitle.textContent = dict.upgrade_title;
  if (upgradeBtn)
    upgradeBtn.textContent = `${dict.upgrade_btn_prefix}${cost} coins)`;
  if (walletTitle) walletTitle.textContent = dict.wallet_title;
  if (buyTonBtn) buyTonBtn.textContent = dict.buy_ton;
  if (tasksTitle) tasksTitle.textContent = dict.daily_tasks;
  if (tasksSubtitle) tasksSubtitle.textContent = dict.daily_sub;
  if (tasksOpenBtn) tasksOpenBtn.textContent = dict.tasks_button;
  if (tonCreditsLabel)
    tonCreditsLabel.firstChild.textContent = dict.ton_credits_label + ": ";

  // Dil değiştikten sonra boost label'ını da güncelle
  updateBoostUI();
}

// ---------------------------
// User init
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

  // Boost süresi bittiyse temizle
  if (!isBoostActive() && tapBoostMultiplier > 1) {
    deactivateBoost();
  }

  const effectiveTaps = isBoostActive() ? tapBoostMultiplier : 1;

  try {
    const res = await fetch(API_BASE + "/api/tap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, taps: effectiveTaps }),
    });
    if (!res.ok) throw new Error("tap failed");
    const data = await res.json();
    if (data.user) {
      userState = data.user;
      renderUser();
    }

    tapCounter += effectiveTaps;
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
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      if (errData.detail === "NOT_ENOUGH_COINS") {
        alert("Yetersiz coin!");
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

// ---------------------------
// User render
// ---------------------------
function renderUser() {
  if (!userState) return;

  const levelEl = document.getElementById("level");
  const coinsEl = document.getElementById("coins");
  const powerEl = document.getElementById("tap_power");
  const tonCreditsEl = document.getElementById("ton_credits");
  const tonBalanceTop = document.getElementById("ton_balance_top");

  if (levelEl) levelEl.textContent = userState.level;
  if (coinsEl) coinsEl.textContent = userState.coins;
  if (powerEl) powerEl.textContent = userState.tap_power;
  if (tonCreditsEl)
    tonCreditsEl.textContent = (userState.ton_credits ?? 0).toFixed(2);
  if (tonBalanceTop)
    tonBalanceTop.textContent = (userState.ton_credits ?? 0).toFixed(2);

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

function getReferralLink() {
  if (!userId) return "https://t.me/TaptoEarnTonBot";
  return `https://t.me/TaptoEarnTonBot?start=ref_${userId}`;
}

function shareReferral() {
  const link = getReferralLink();
  if (tg?.openTelegramLink) tg.openTelegramLink(link);
  else window.open(link, "_blank");
}

function renderTasksBoard() {
  const container = document.getElementById("tasks-grid");
  if (!container) return;
  container.innerHTML = "";

  TASKS.forEach((task) => {
    const status = taskStatusMap[task.id] || "pending";

    const card = document.createElement("div");
    card.className = "task-card";

    const icon = document.createElement("div");
    icon.className = "task-icon";
    icon.textContent = task.iconEmoji || "⭐";

    const main = document.createElement("div");
    main.className = "task-main";

    const titleEl = document.createElement("p");
    titleEl.className = "task-title";
    titleEl.textContent = task.title;

    const descEl = document.createElement("p");
    descEl.className = "task-desc";
    descEl.textContent = task.description;

    const rewardEl = document.createElement("div");
    rewardEl.className = "task-reward";
    rewardEl.textContent = task.rewardText;

    main.appendChild(titleEl);
    main.appendChild(descEl);
    main.appendChild(rewardEl);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    if (task.type === "reward_chest") {
      // Daily TON Chest
      const btn = document.createElement("button");
      btn.className = "task-cta-btn";
      btn.textContent = "OPEN CHEST";
      btn.addEventListener("click", () => {
        showRewardAd(() => {
          // Reklam sonuna kadar izlendi → backend ödülü
          claimAdRewardFromBackend();
        });
      });
      actions.appendChild(btn);
    } else if (task.type === "boost") {
      // Tap Turbo Boost
      const btn = document.createElement("button");
      btn.className = "task-cta-btn";
      btn.textContent = "ACTIVATE BOOST";
      btn.addEventListener("click", () => showBoostAd());
      actions.appendChild(btn);
    } else if (task.type === "invite") {
      // Referral
      const linkPreview = document.createElement("p");
      linkPreview.className = "task-ref-link";
      linkPreview.textContent = getReferralLink();
      main.appendChild(linkPreview);

      const btn = document.createElement("button");
      btn.className = "task-cta-btn";
      btn.textContent = "SHARE LINK";
      btn.addEventListener("click", () => shareReferral());
      actions.appendChild(btn);
    } else if (task.type === "affiliate") {
      // GO / CHECK / CLAIM
      const go = document.createElement("button");
      go.className = "task-cta-btn";
      go.textContent = "GO";
      go.disabled = status === "claimed";
      go.addEventListener("click", () => handleTaskClick(task, "go"));
      actions.appendChild(go);

      const check = document.createElement("button");
      check.className = "task-cta-btn";
      check.textContent = "CHECK";
      check.disabled = status === "claimed";
      check.addEventListener("click", () => handleTaskClick(task, "check"));
      actions.appendChild(check);

      const claim = document.createElement("button");
      claim.className = "task-cta-btn";
      claim.textContent = "CLAIM";
      claim.disabled = status !== "checked";
      claim.addEventListener("click", () => handleTaskClick(task, "claim"));
      actions.appendChild(claim);
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
  }
}

function openAffiliate(url) {
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank");
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
    alert("Görev kontrol edildi, şimdi Claim deneyebilirsin.");
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
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.detail === "TASK_NOT_READY") {
        alert("Önce CHECK yapmalısın.");
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
    alert(`Görev tamamlandı, +${data.reward_coins} coin kazandın!`);
  } catch (err) {
    console.error("claimTask error:", err);
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

  loadBoostFromStorage();

  const tapBtn = document.getElementById("tap-btn");
  const upgradeBtn = document.getElementById("upgrade-tap-power-btn");
  const walletOpenBtn = document.getElementById("wallet-open-btn");
  const openTasksBtn = document.getElementById("open-tasks-btn");
  const tonBuyBtn = document.getElementById("buy-coins-ton-btn");
  const closeButtons = document.querySelectorAll(".overlay-close");

  if (tapBtn) tapBtn.addEventListener("click", tapOnce);
  if (upgradeBtn) upgradeBtn.addEventListener("click", upgradeTapPower);
  if (walletOpenBtn)
    walletOpenBtn.addEventListener("click", () => openModal("wallet-modal"));
  if (openTasksBtn)
    openTasksBtn.addEventListener("click", () => {
      openModal("tasks-modal");
      renderTasksBoard();
    });
  if (tonBuyBtn) tonBuyBtn.addEventListener("click", buyCoinsWithTon);

  closeButtons.forEach((btn) => {
    const target = btn.getAttribute("data-close");
    btn.addEventListener("click", () => closeModal(target));
  });

  initLanguageSelector();
  updateLangUI();
  initUser();
  initTonConnect();
  initAdsgram();
  updateBoostUI();
});

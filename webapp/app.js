// Telegram WebApp objesi
const tg = window.Telegram ? window.Telegram.WebApp : null;

// Backend origin
const API_BASE = window.location.origin;

// TON ödemelerinin gideceği senin cüzdan adresin
const OWNER_TON_ADDRESS =
  "UQBMjI5CjFPMy7ouPUvpD0hZMdxOvaoROuzcUFxRkkL4TP3f";

// Dil metinleri
const LANG = {
  en: {
    tap: "TAP",
    upgrade_title: "Upgrade",
    upgrade_desc:
      "Spend your coins to increase tap power and earn more with each tap.",
    upgrade_btn_prefix: "Increase Tap Power (cost: ",
    wallet_title: "TON Wallet",
    buy_ton: "Buy coins with TON",
    daily_tasks: "Daily Tasks & Offers",
    daily_sub:
      "Watch rewarded ads, activate turbo, complete affiliate tasks and invite friends to earn more.",
    tasks_button: "Daily Tasks & Offers",
    ton_credits_label: "TON Credits",
    boost_off: "No turbo boost active",
    boost_on_prefix: "Turbo x",
  },
  tr: {
    tap: "TIKLA",
    upgrade_title: "Yükselt",
    upgrade_desc:
      "Coin harcayarak vuruş gücünü artır, her dokunuşta daha çok kazan.",
    upgrade_btn_prefix: "Vuruş Gücünü Artır (maliyet: ",
    wallet_title: "TON Cüzdan",
    buy_ton: "TON ile coin satın al",
    daily_tasks: "Günlük Görevler & Teklifler",
    daily_sub:
      "Ödüllü reklam izle, turbo aç, affiliate görevleri yap ve arkadaş davet ederek daha fazla kazan.",
    tasks_button: "Günlük Görevler & Teklifler",
    ton_credits_label: "TON Kredileri",
    boost_off: "Aktif turbo gücü yok",
    boost_on_prefix: "Turbo x",
  },
};

let currentLang = localStorage.getItem("tap_lang") || "en";

let userId = null;
let userState = null;

// Double-tap zoom engelleme (özellikle iOS için)
let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  function (event) {
    const now = Date.now();
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
let tapCounter = 0;
const TAPS_PER_AD = 50;
let lastAdTime = 0;
const AD_INTERVAL_MS = 60_000;

let RewardAdController = null;
let InterstitialAdController = null;

// AdsGram blockId'ler
const ADSGRAM_REWARD_BLOCK_ID = "17996"; // Rewarded video
const ADSGRAM_INTERSTITIAL_BLOCK_ID = "int-17995"; // Interstitial

function initAdsgram() {
  if (!window.Adsgram) {
    console.log("AdsGram SDK yok (sad.min.js yüklü mü?)");
    return;
  }
  try {
    RewardAdController = window.Adsgram.init({
      blockId: ADSGRAM_REWARD_BLOCK_ID,
    });
    InterstitialAdController = window.Adsgram.init({
      blockId: ADSGRAM_INTERSTITIAL_BLOCK_ID,
    });
    console.log(
      "AdsGram init OK:",
      ADSGRAM_REWARD_BLOCK_ID,
      ADSGRAM_INTERSTITIAL_BLOCK_ID
    );
  } catch (err) {
    console.error("AdsGram init error:", err);
  }
}

function maybeShowInterstitial() {
  if (!InterstitialAdController) return;
  const now = Date.now();
  if (now - lastAdTime < AD_INTERVAL_MS) return;

  lastAdTime = now;
  InterstitialAdController.show()
    .then((res) => console.log("Interstitial OK:", res))
    .catch((err) => console.error("Interstitial error:", err));
}

function showRewardAd(forWhat = "chest") {
  if (!RewardAdController) {
    alert("Ad is not ready yet, please try again later.");
    return;
  }

  RewardAdController.show()
    .then((result) => {
      console.log("Reward ad result:", result);
      if (result && result.done && !result.error) {
        if (forWhat === "chest") {
          claimAdRewardFromBackend();
        } else if (forWhat === "turbo") {
          activateTurboBoost();
        }
      } else {
        alert("To get the reward you must watch the full ad.");
      }
    })
    .catch((err) => {
      console.error("Reward ad error:", err);
      alert(
        "No ad available or an error occurred. Please try again again in a while."
      );
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
        alert("You reached your daily video reward limit for today.");
        return;
      }
      throw new Error("Reward request failed");
    }

    const data = await res.json();
    if (data.user) {
      userState.ton_credits = data.user.ton_credits;
    }
    renderUser();
    alert(`+0.01 TON earned!`);
  } catch (err) {
    console.error("claimAdRewardFromBackend error:", err);
  }
}

// ---------------------------
// Turbo Boost (client-side)
// ---------------------------
let turboMultiplier = 1;
let turboExpiresAt = 0;
let turboTimerInterval = null;

function isTurboActive() {
  return turboMultiplier > 1 && Date.now() < turboExpiresAt;
}

function updateTurboIndicator() {
  const el = document.getElementById("boost-indicator");
  const dict = LANG[currentLang] || LANG.en;
  if (!el) return;

  if (!isTurboActive()) {
    turboMultiplier = 1;
    if (turboTimerInterval) {
      clearInterval(turboTimerInterval);
      turboTimerInterval = null;
    }
    el.textContent = dict.boost_off;
    el.classList.remove("active");
    return;
  }

  const msLeft = turboExpiresAt - Date.now();
  const totalSec = Math.max(0, Math.floor(msLeft / 1000));
  const min = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const sec = String(totalSec % 60).padStart(2, "0");

  el.textContent = `${dict.boost_on_prefix}${turboMultiplier} · ${min}:${sec} left`;
  el.classList.add("active");
}

function activateTurboBoost() {
  // 5 dakika x2 turbo
  const BOOST_DURATION_MS = 5 * 60 * 1000;
  turboMultiplier = 2;
  turboExpiresAt = Date.now() + BOOST_DURATION_MS;

  if (turboTimerInterval) clearInterval(turboTimerInterval);
  turboTimerInterval = setInterval(updateTurboIndicator, 1000);
  updateTurboIndicator();

  alert("Turbo x2 activated for 5 minutes! Each tap now counts as 2.");
}

// ---------------------------
// Tasks config (UI)
// ---------------------------
const TASKS = [
  // 1) Daily TON Chest – özel banner + yine listede gösteriyoruz
  {
    id: "daily_ton_chest",
    type: "reward_chest",
    iconType: "reward",
    iconEmoji: "🎁",
    title: "Daily TON Chest",
    description: "Watch a rewarded ad to get 0.01 TON.",
    rewardText: "+0.01 TON reward",
  },
  // 2) Turbo Boost
  {
    id: "turbo_boost",
    type: "turbo",
    iconType: "turbo",
    iconEmoji: "⚡",
    title: "Turbo x2 (5 min)",
    description: "Activate turbo x2 for 5 minutes using a rewarded ad.",
    rewardText: "2x coins per tap · 5 min",
  },
  // 3) Affiliate tasks (örnekler)
  {
    id: "affiliate_boinker",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🧠",
    title: "Open Boinker Mini-App",
    description: "Open Boinker and explore the game.",
    rewardText: "+1000 coins (after check)",
    url: "https://t.me/boinker_bot?start=_tgr_TiWlA9A5YWY8",
  },
  {
    id: "affiliate_dotcoin",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🟡",
    title: "Visit DotCoin Bot",
    description: "Open DotCoin from Telegram.",
    rewardText: "+1000 coins",
    url: "https://t.me/dotcoin_bot",
  },
  {
    id: "affiliate_bbqcoin",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🍖",
    title: "Visit BBQCoin",
    description: "Join BBQCoin and check the game.",
    rewardText: "+1000 coins",
    url: "https://t.me/BBQCoin_bot",
  },
  // 4) Referral – şimdilik sadece link gösteriyoruz (backend “coming soon”)
  {
    id: "referral_invite",
    type: "referral",
    iconType: "referral",
    iconEmoji: "🤝",
    title: "Invite Friends",
    description: "Share your invite link. Referral rewards will be enabled soon.",
    rewardText: "Future: coins + TON credits",
  },
  // Mock ekstra görevler (şimdilik görsel doluluk için, ileride gerçek linkler eklenebilir)
  {
    id: "affiliate_1",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🎯",
    title: "Check another mini-app",
    description: "Open a partner mini-app and explore it.",
    rewardText: "Coming soon",
    url: "https://t.me",
  },
  {
    id: "affiliate_2",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🎮",
    title: "Try a game partner",
    description: "Play any partner mini-app for a while.",
    rewardText: "Coming soon",
    url: "https://t.me",
  },
  {
    id: "affiliate_3",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "💰",
    title: "Visit a rewards bot",
    description: "Open a rewards mini-app and check offers.",
    rewardText: "Coming soon",
    url: "https://t.me",
  },
];

// task state – şimdilik sadece UI tarafında yönetiyoruz
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
    // Ana sayfadaki buton
    if (window.TON_CONNECT_UI) {
      tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
        manifestUrl: TONCONNECT_MANIFEST_URL,
        buttonRootId: "ton-connect-button",
      });

      tonConnectUI.onStatusChange((wallet) => {
        handleWalletStatusChange(wallet, "wallet-address");
      });
    } else {
      console.log("TonConnect UI yok.");
    }

    // Modal içindeki buton (ayrı bir instance)
    if (window.TON_CONNECT_UI) {
      const modalButtonRoot = document.getElementById(
        "ton-connect-button-modal"
      );
      if (modalButtonRoot) {
        const modalUI = new TON_CONNECT_UI.TonConnectUI({
          manifestUrl: TONCONNECT_MANIFEST_URL,
          buttonRootId: "ton-connect-button-modal",
        });

        modalUI.onStatusChange((wallet) => {
          handleWalletStatusChange(wallet, "wallet-address-modal");
        });
      }
    }
  } catch (err) {
    console.error("TonConnect init error:", err);
  }
}

function handleWalletStatusChange(wallet, addressElementId) {
  const addrEl = document.getElementById(addressElementId);
  if (!addrEl) return;

  if (wallet) {
    connectedWalletAddress = wallet.account.address;
    addrEl.textContent = "Wallet: " + connectedWalletAddress;
  } else {
    if (addressElementId === "wallet-address") {
      connectedWalletAddress = null;
    }
    addrEl.textContent = "";
  }
}

async function buyCoinsWithTon() {
  if (!tonConnectUI || !connectedWalletAddress) {
    alert("First connect your TON wallet.");
    return;
  }

  try {
    await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [
        {
          address: OWNER_TON_ADDRESS,
          amount: "100000000", // 0.1 TON
        },
      ],
    });
    alert("TON payment request sent. After confirmation, coins will be credited soon.");
  } catch (err) {
    console.error("TON transaction error:", err);
  }
}

// ---------------------------
// Upgrade cost
// ---------------------------
function getUpgradeCost() {
  if (!userState || typeof userState.tap_power !== "number") return 100;
  // tap_power = 1 → 100, 2 → 200, ...
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
  const upgradeTitle = document.getElementById("upgrade-title");
  const upgradeDesc = document.getElementById("upgrade-desc");
  const upgradeBtn = document.getElementById("upgrade-tap-power-btn");
  const walletTitle = document.querySelector(".wallet-title");
  const buyTonBtn = document.getElementById("buy-coins-ton-btn");
  const tasksTitle = document.querySelector(".tasks-title");
  const tasksSubtitle = document.querySelector(".tasks-subtitle");
  const tasksOpenBtn = document.getElementById("open-tasks-btn");
  const tonCreditsLabel = document.getElementById("ton-credits-label");
  const boostIndicator = document.getElementById("boost-indicator");

  const cost = getUpgradeCost();

  if (tapBtn) tapBtn.textContent = dict.tap;
  if (upgradeTitle) upgradeTitle.textContent = dict.upgrade_title;
  if (upgradeDesc) upgradeDesc.textContent = dict.upgrade_desc;
  if (upgradeBtn)
    upgradeBtn.textContent = `${dict.upgrade_btn_prefix}${cost} coins)`;
  if (walletTitle) walletTitle.textContent = dict.wallet_title;
  if (buyTonBtn) buyTonBtn.textContent = dict.buy_ton;
  if (tasksTitle) tasksTitle.textContent = dict.daily_tasks;
  if (tasksSubtitle) tasksSubtitle.textContent = dict.daily_sub;
  if (tasksOpenBtn) tasksOpenBtn.textContent = dict.tasks_button;
  if (tonCreditsLabel) tonCreditsLabel.textContent = dict.ton_credits_label;
  if (boostIndicator) {
    // aktif / pasif turboya göre metin güncellensin
    updateTurboIndicator();
  }
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

  try {
    const tapsToSend = isTurboActive() ? turboMultiplier : 1;

    const res = await fetch(API_BASE + "/api/tap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, taps: tapsToSend }),
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
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      if (errData.detail === "NOT_ENOUGH_COINS") {
        alert("Not enough coins!");
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

  if (levelEl) levelEl.textContent = userState.level;
  if (coinsEl) coinsEl.textContent = userState.coins;
  if (powerEl) powerEl.textContent = userState.tap_power;
  if (tonCreditsEl)
    tonCreditsEl.textContent = (userState.ton_credits ?? 0).toFixed(2);

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
    if (!res.ok) {
      console.warn("tasks/status not configured on backend, using defaults.");
      return;
    }
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

    const titleEl = document.createElement("p");
    titleEl.className = "task-title";
    titleEl.textContent = task.title;

    // Daily TON Chest için ünlemli info badge
    if (task.id === "daily_ton_chest") {
      const info = document.createElement("span");
      info.className = "task-info-badge";
      info.textContent = "!";
      titleEl.appendChild(info);
    }

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
      const btn = document.createElement("button");
      btn.className = "task-cta-btn primary";
      btn.textContent = "OPEN CHEST";
      btn.addEventListener("click", () => showRewardAd("chest"));
      actions.appendChild(btn);
    } else if (task.type === "turbo") {
      const btn = document.createElement("button");
      btn.className = "task-cta-btn";
      btn.textContent = "ACTIVATE";
      btn.addEventListener("click", () => showRewardAd("turbo"));
      actions.appendChild(btn);
    } else if (task.type === "affiliate") {
      const goBtn = document.createElement("button");
      goBtn.className = "task-cta-btn";
      goBtn.textContent = "GO";
      goBtn.addEventListener("click", () => openAffiliate(task.url));
      actions.appendChild(goBtn);
    } else if (task.type === "referral") {
      const refBtn = document.createElement("button");
      refBtn.className = "task-cta-btn";
      refBtn.textContent = "INVITE";
      refBtn.addEventListener("click", () => openReferralInfo());
      actions.appendChild(refBtn);
    }

    card.appendChild(icon);
    card.appendChild(main);
    card.appendChild(actions);
    container.appendChild(card);
  });
}

function openAffiliate(url) {
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank");
}

function openReferralInfo() {
  let baseLink = "https://t.me/TaptoEarnTonBot";
  if (userId) {
    baseLink += "?start=" + encodeURIComponent("ref_" + userId);
  }
  alert(
    "Invite link (future feature):\n\n" +
      baseLink +
      "\n\nReferral tracking & rewards will be enabled soon."
  );
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
  updateTurboIndicator();
});

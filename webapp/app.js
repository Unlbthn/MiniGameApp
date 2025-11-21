// Telegram WebApp objesi
const tg = window.Telegram ? window.Telegram.WebApp : null;

// Dil metinleri
const LANG = {
  en: {
    title: "Tap to Earn TON",
    upgradeTitle: "Upgrade",
    upgradeDesc:
      "Spend your coins to increase tap power and earn more with each tap.",
    upgradeBtn: (cost) => `Increase Tap Power (cost: ${cost} coins)`,
    walletModalTitle: "TON Wallet",
    walletModalDesc:
      "Connect your TON wallet to enable on-chain rewards and purchases.",
    dailyTasksTitle: "Daily Tasks",
    dailyTasksSubtitle:
      "Complete tasks and earn extra coins & TON rewards.",
    dailyTasksBtn: "Daily Tasks",
    tapLabel: "TAP",
  },
  tr: {
    title: "TON Kazanmak için Tıkla",
    upgradeTitle: "Yükselt",
    upgradeDesc:
      "Coinlerini kullanarak vuruş gücünü artır ve her dokunuşta daha fazla kazan.",
    upgradeBtn: (cost) => `Vuruş Gücünü Artır (maliyet: ${cost} coin)`,
    walletModalTitle: "TON Cüzdan",
    walletModalDesc:
      "On-chain ödüller ve satın almalar için TON cüzdanını bağla.",
    dailyTasksTitle: "Günlük Görevler",
    dailyTasksSubtitle:
      "Görevleri tamamla, ekstra coin ve TON ödülü kazan.",
    dailyTasksBtn: "Günlük Görevler",
    tapLabel: "TIKLA",
  },
};

let currentLang = localStorage.getItem("tap_lang") || "en";

// Kullanıcı & state
let userId = null;
let userState = null;

// Backend origin
const API_BASE = window.location.origin;

// AdsGram
let AdReward = null; // Reward block (video + TON ödülü)
let AdInter = null; // Interstitial (boost vs.)
const ADSGRAM_REWARD_BLOCK_ID = "17996";
const ADSGRAM_INTERSTITIAL_BLOCK_ID = "int-17995";

let tapCounter = 0;
const TAPS_PER_INTER_AD = 60;
let lastInterAdTime = 0;
const INTER_AD_INTERVAL_MS = 90_000;

// Turbo boost
let tapMultiplier = 1;
let boostExpiresAt = 0;

// TON wallet (TonConnect)
let tonConnectUI = null;
let connectedWalletAddress = null;
const TONCONNECT_MANIFEST_URL =
  "https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json";

// Görevler (Boinker tarzı)
const TASKS = [
  {
    id: "daily_ton_chest",
    type: "local_reward",
    iconType: "reward",
    iconEmoji: "🎁",
    title: "Daily TON Chest",
    description: "Watch a rewarded video and get +0.01 TON (up to 10/day).",
    rewardText: "+0.01 TON",
  },
  {
    id: "turbo_boost_x2",
    type: "local_boost",
    iconType: "boost",
    iconEmoji: "⚡",
    title: "Tap Turbo Boost x2",
    description: "Watch a short ad to activate 2x tap power for 10 minutes.",
    rewardText: "2x tap power (10 min)",
  },
  {
    id: "affiliate_boinker",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🧠",
    title: "Open Boinker Mini-App",
    description: "Open Boinker and explore the game.",
    rewardText: "+1000 coins (Check & Claim)",
    url: "https://t.me/boinker_bot?start=_tgr_TiWlA9A5YWY8",
  },
  {
    id: "affiliate_dotcoin",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🟡",
    title: "Visit DotCoin Bot",
    description: "Open DotCoin from Telegram.",
    rewardText: "+1000 coins (Check & Claim)",
    url: "https://t.me/dotcoin_bot",
  },
  {
    id: "affiliate_bbqcoin",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🍖",
    title: "Visit BBQCoin",
    description: "Join BBQCoin and check the game.",
    rewardText: "+1000 coins (Check & Claim)",
    url: "https://t.me/BBQCoin_bot",
  },
];

// Sadece affiliate görevler backend ile takip ediliyor
const taskStatusMap = {};

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

  const titleEl = document.getElementById("game-title");
  const tapBtn = document.getElementById("tap-btn");
  const upgradeTitle = document.getElementById("upgrade-title");
  const upgradeDesc = document.getElementById("upgrade-desc");
  const upgradeBtn = document.getElementById("upgrade-tap-power-btn");
  const tasksTitle = document.getElementById("tasks-title");
  const tasksSubtitle = document.getElementById("tasks-subtitle");
  const tasksOpenBtn = document.getElementById("open-tasks-btn");
  const walletModalTitle = document.getElementById("wallet-modal-title");
  const walletModalDesc = document.getElementById("wallet-modal-desc");

  if (titleEl) titleEl.textContent = dict.title;
  if (tapBtn) tapBtn.textContent = dict.tapLabel;
  if (upgradeTitle) upgradeTitle.textContent = dict.upgradeTitle;
  if (upgradeDesc) upgradeDesc.textContent = dict.upgradeDesc;
  if (upgradeBtn) upgradeBtn.textContent = dict.upgradeBtn(getUpgradeCost());
  if (tasksTitle) tasksTitle.textContent = dict.dailyTasksTitle;
  if (tasksSubtitle) tasksSubtitle.textContent = dict.dailyTasksSubtitle;
  if (tasksOpenBtn) tasksOpenBtn.textContent = dict.dailyTasksBtn;
  if (walletModalTitle) walletModalTitle.textContent = dict.walletModalTitle;
  if (walletModalDesc) walletModalDesc.textContent = dict.walletModalDesc;
}

// ---------------------------
// User & backend
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
// Upgrade cost
// ---------------------------
function getUpgradeCost() {
  if (!userState || typeof userState.tap_power !== "number") return 100;
  return userState.tap_power * 100;
}

// ---------------------------
// Tap & Upgrade
// ---------------------------
async function tapOnce() {
  if (!userId) return;

  // Boost süresi kontrolü
  const now = Date.now();
  if (now > boostExpiresAt) {
    tapMultiplier = 1;
    updateBoostIndicator();
  }

  const tapsToSend = tapMultiplier;

  try {
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
    maybeShowInterstitialAd();
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
        alert(
          currentLang === "tr" ? "Yetersiz coin!" : "Not enough coins!"
        );
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
// Render user
// ---------------------------
function renderUser() {
  if (!userState) return;

  const levelEl = document.getElementById("level");
  const coinsEl = document.getElementById("coins");
  const powerEl = document.getElementById("tap_power");
  const tonBalanceEl = document.getElementById("ton-balance");

  if (levelEl) levelEl.textContent = userState.level;
  if (coinsEl) coinsEl.textContent = userState.coins;
  if (powerEl) powerEl.textContent = userState.tap_power;
  if (tonBalanceEl)
    tonBalanceEl.textContent = (userState.ton_credits ?? 0).toFixed(2);

  updateLangUI();
}

// ---------------------------
// AdsGram
// ---------------------------
function initAdsgram() {
  if (!window.Adsgram) {
    console.log("AdsGram SDK yok (sad.min.js yüklü mü?)");
    return;
  }

  try {
    if (!AdReward) {
      AdReward = window.Adsgram.init({
        blockId: ADSGRAM_REWARD_BLOCK_ID,
      });
    }
    if (!AdInter) {
      AdInter = window.Adsgram.init({
        blockId: ADSGRAM_INTERSTITIAL_BLOCK_ID,
      });
    }
    console.log("AdsGram init OK");
  } catch (err) {
    console.error("AdsGram init error:", err);
  }
}

// Rewarded video for TON Chest
function showRewardAd() {
  if (!AdReward) {
    alert(
      currentLang === "tr"
        ? "Reklam şu anda hazır değil."
        : "Ad is not ready yet."
    );
    return;
  }
  if (!userId) {
    alert("User not initialized.");
    return;
  }

  AdReward.show({ userId: String(userId) })
    .then((result) => {
      console.log("Reward ad result:", result);
      if (result && result.done && !result.error) {
        // Backend ödülü AdsGram reward_url üzerinden veriyor → sadece state yenile
        fetchUser();
        alert(
          currentLang === "tr"
            ? "Ödül hesabına işlendi! (limit: günde 10)"
            : "Reward applied to your account! (limit: 10 per day)"
        );
      } else {
        alert(
          currentLang === "tr"
            ? "Ödül için videoyu sonuna kadar izlemelisin."
            : "You must watch the full video to get the reward."
        );
      }
    })
    .catch((err) => {
      console.error("Reward ad error:", err);
      alert("Ad error");
    });
}

// Interstitial ad for turbo boost
function maybeShowInterstitialAd() {
  if (!AdInter) return;

  tapCounter += 1;
  if (tapCounter < TAPS_PER_INTER_AD) return;

  const now = Date.now();
  if (now - lastInterAdTime < INTER_AD_INTERVAL_MS) return;

  tapCounter = 0;
  lastInterAdTime = now;

  AdInter.show({ userId: String(userId || "") }).catch((err) =>
    console.error("Interstitial error:", err)
  );
}

// Turbo Boost özel reklam
function showBoostAd() {
  if (!AdInter) {
    alert(
      currentLang === "tr"
        ? "Reklam şu anda hazır değil."
        : "Ad is not ready yet."
    );
    return;
  }

  AdInter.show({ userId: String(userId || "") })
    .then((res) => {
      console.log("Boost ad result:", res);
      if (res && !res.error) {
        activateBoost(2, 10); // 2x, 10 dakika
      }
    })
    .catch((err) => console.error("Boost ad error:", err));
}

function activateBoost(multiplier, minutes) {
  tapMultiplier = multiplier;
  boostExpiresAt = Date.now() + minutes * 60 * 1000;
  updateBoostIndicator();
}

function updateBoostIndicator() {
  const el = document.getElementById("boost-indicator");
  if (!el) return;

  const now = Date.now();
  if (tapMultiplier > 1 && boostExpiresAt > now) {
    const minsLeft = Math.ceil((boostExpiresAt - now) / 60000);
    el.textContent = `⚡ Turbo x${tapMultiplier} active (${minsLeft} min)`;
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

// ---------------------------
// Tasks (affiliate + local)
// ---------------------------
async function fetchTaskStatuses() {
  if (!userId) return;
  try {
    const res = await fetch(
      API_BASE + "/api/tasks/status?telegram_id=" + userId
    );
    if (!res.ok) {
      console.warn("tasks/status not ok");
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

    if (task.type === "local_reward") {
      const btn = document.createElement("button");
      btn.className = "task-cta-btn";
      btn.textContent = "WATCH";
      btn.addEventListener("click", () => showRewardAd());
      actions.appendChild(btn);
    } else if (task.type === "local_boost") {
      const btn = document.createElement("button");
      btn.className = "task-cta-btn";
      btn.textContent = "ACTIVATE";
      btn.addEventListener("click", () => showBoostAd());
      actions.appendChild(btn);
    } else if (task.type === "affiliate") {
      const goBtn = document.createElement("button");
      goBtn.className = "task-cta-btn";
      goBtn.textContent = "GO";
      goBtn.disabled = status === "claimed";
      goBtn.addEventListener("click", () => handleTaskClick(task, "go"));
      actions.appendChild(goBtn);

      const checkBtn = document.createElement("button");
      checkBtn.className = "task-cta-btn";
      checkBtn.textContent = "CHECK";
      checkBtn.disabled = status === "claimed";
      checkBtn.addEventListener("click", () =>
        handleTaskClick(task, "check")
      );
      actions.appendChild(checkBtn);

      const claimBtn = document.createElement("button");
      claimBtn.className = "task-cta-btn";
      claimBtn.textContent = "CLAIM";
      claimBtn.disabled = status !== "checked";
      claimBtn.addEventListener("click", () =>
        handleTaskClick(task, "claim")
      );
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
    alert(
      currentLang === "tr"
        ? "Görev kontrol edildi, şimdi CLAIM deneyebilirsin."
        : "Task checked, now you can CLAIM."
    );
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
        alert(
          currentLang === "tr"
            ? "Önce CHECK yapmalısın."
            : "You must CHECK first."
        );
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
    alert(
      currentLang === "tr"
        ? `Görev tamamlandı, +${data.reward_coins} coin kazandın!`
        : `Task completed, you earned +${data.reward_coins} coins!`
    );
  } catch (err) {
    console.error("claimTask error:", err);
  }
}

// ---------------------------
// TonConnect
// ---------------------------
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
      const addrEl = document.getElementById("wallet-address");
      if (wallet) {
        connectedWalletAddress = wallet.account.address;
        if (addrEl)
          addrEl.textContent = "Wallet: " + connectedWalletAddress;
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
  if (!tonConnectUI || !connectedWalletAddress) {
    alert(
      currentLang === "tr"
        ? "Önce TON cüzdanını bağlamalısın."
        : "You need to connect your TON wallet first."
    );
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
// Modals
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
  const closeButtons = document.querySelectorAll("[data-close]");

  if (tapBtn) {
    tapBtn.addEventListener("click", tapOnce);
    tapBtn.addEventListener("dblclick", (e) => e.preventDefault()); // double-tap zoom önle
  }
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
});

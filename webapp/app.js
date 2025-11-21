// Telegram WebApp objesi
const tg = window.Telegram ? window.Telegram.WebApp : null;

// Dil metinleri
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
// AdsGram
// ---------------------------
// ---------------------------
// AdsGram
// ---------------------------

// Rewarded Ad Block
const ADSGRAM_REWARD_BLOCK_ID = "17996";

// Interstitial Ad Block
const ADSGRAM_INTERSTITIAL_BLOCK_ID = "int-17995";

let AdReward = null;
let AdInter = null;

function initAdsgram() {
  if (window.Adsgram) {
    try {
      // Rewarded
      AdReward = window.Adsgram.init({
        blockId: ADSGRAM_REWARD_BLOCK_ID,
      });

      // Interstitial
      AdInter = window.Adsgram.init({
        blockId: ADSGRAM_INTERSTITIAL_BLOCK_ID,
      });

      console.log("AdsGram initialized:", {
        reward: ADSGRAM_REWARD_BLOCK_ID,
        interstitial: ADSGRAM_INTERSTITIAL_BLOCK_ID,
      });

    } catch (err) {
      console.error("AdsGram init error:", err);
    }
  } else {
    console.log("AdsGram SDK not loaded!");
  }
}

// ---------------------------
// Interstitial Logic
// ---------------------------
let tapCounter = 0;
const TAPS_PER_AD = 50;
let lastAdTime = 0;
const AD_INTERVAL_MS = 60_000;

function maybeShowInterstitial() {
  if (!AdInter) return;

  const now = Date.now();
  if (now - lastAdTime < AD_INTERVAL_MS) return;

  lastAdTime = now;

  AdInter.show()
    .then((res) => console.log("Interstitial shown:", res))
    .catch((err) => console.error("Interstitial failed:", err));
}

// ---------------------------
// Rewarded Logic
// ---------------------------
function showRewardAd() {
  if (!AdReward) {
    alert("Reklam şu anda hazır değil.");
    return;
  }

  AdReward.show()
    .then((result) => {
      if (result && result.done && !result.error) {
        claimAdRewardFromBackend();
      } else {
        alert("Ödül için reklamı tamamen izlemen gerekiyor.");
      }
    })
    .catch((err) => {
      console.error("Reward error:", err);
      alert("Reklam açılırken bir hata oluştu.");
    });
}



let tapCounter = 0;
const TAPS_PER_AD = 50;
let lastAdTime = 0;
const AD_INTERVAL_MS = 60_000;

let AdController = null;
// Yeni PlatformID
const ADSGRAM_BLOCK_ID = "16529";

function initAdsgram() {
  if (window.Adsgram && !AdController) {
    try {
      AdController = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
      console.log("AdsGram init OK:", ADSGRAM_BLOCK_ID);
    } catch (err) {
      console.error("AdsGram init error:", err);
    }
  } else if (!window.Adsgram) {
    console.log("AdsGram SDK yok (sad.min.js yüklü mü?)");
  }
}

function maybeShowInterstitial() {
  if (!AdController) return;
  const now = Date.now();
  if (now - lastAdTime < AD_INTERVAL_MS) return;

  lastAdTime = now;
  AdController.show()
    .then((res) => console.log("Interstitial OK:", res))
    .catch((err) => console.error("Interstitial error:", err));
}

function showRewardAd() {
  if (!AdController) {
    alert("Reklam şu anda hazır değil.");
    return;
  }

  AdController.show()
    .then((result) => {
      console.log("Reward ad result:", result);
      if (result && result.done && !result.error) {
        claimAdRewardFromBackend();
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
      userState.ton_credits = data.user.ton_credits;
    }
    renderUser();
    alert(`+0.01 TON kazandın! Kalan hak: ${data.remaining}/10`);
  } catch (err) {
    console.error("claimAdRewardFromBackend error:", err);
  }
}

// Placeholder: AdsGram Task format için
function showAdsgramTask() {
  alert(
    "AdsGram Task entegrasyonu için özel kod eklenmeli. Şu an placeholder durumda."
  );
}

// ---------------------------
// Tasks config
// ---------------------------
const TASKS = [
  {
    id: "reward_video",
    type: "reward",
    iconType: "reward",
    iconEmoji: "🎬",
    title: "Watch a Reward Ad",
    description: "Watch a full video ad to earn 0.01 TON.",
    rewardText: "+0.01 TON (max 10/day)",
  },
  {
    id: "affiliate_boinker",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🧠",
    title: "Open Boinker Mini-App",
    description: "Open Boinker and explore the game.",
    rewardText: "+1000 coins (claim after check)",
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
];

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
  const tasksTitle = document.querySelector(".tasks-title");
  const tasksSubtitle = document.querySelector(".tasks-subtitle");
  const tasksOpenBtn = document.getElementById("open-tasks-btn");
  const tonCreditsLabel = document.querySelector("#user-info p:nth-of-type(4)");

  const cost = getUpgradeCost();

  if (tapBtn) tapBtn.textContent = dict.tap;
  if (upgradeTitle) upgradeTitle.textContent = dict.upgrade_title;
  if (upgradeBtn)
    upgradeBtn.textContent = `${dict.upgrade_btn_prefix}${cost} coins)`;
  if (tasksTitle) tasksTitle.textContent = dict.daily_tasks;
  if (tasksSubtitle) tasksSubtitle.textContent = dict.daily_sub;
  if (tasksOpenBtn) tasksOpenBtn.textContent = dict.tasks_button;
  if (tonCreditsLabel)
    tonCreditsLabel.firstChild.textContent = dict.ton_credits_label + ": ";
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

    const row = document.createElement("div");
    row.className = "task-row";

    const left = document.createElement("div");
    left.className = "task-left";
    const icon = document.createElement("div");
    icon.className = "task-icon";
    icon.textContent = task.iconEmoji || "⭐";
    left.appendChild(icon);

    const main = document.createElement("div");
    main.className = "task-main";

    const titleEl = document.createElement("div");
    titleEl.className = "task-title";
    titleEl.textContent = task.title;

    const descEl = document.createElement("div");
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

    if (task.type === "reward") {
      const btn = document.createElement("button");
      btn.className = "task-cta-btn";
      btn.textContent = "WATCH";
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
      checkBtn.disabled = status === "claimed";
      checkBtn.addEventListener("click", () => handleTaskClick(task, "check"));
      actions.appendChild(checkBtn);

      const claimBtn = document.createElement("button");
      claimBtn.className = "task-cta-btn";
      claimBtn.textContent = "CLAIM";
      claimBtn.disabled = status !== "checked";
      claimBtn.addEventListener("click", () => handleTaskClick(task, "claim"));
      actions.appendChild(claimBtn);
    }

    row.appendChild(left);
    row.appendChild(main);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

function handleTaskClick(task, action) {
  if (task.type === "affiliate") {
    if (action === "go") openAffiliate(task.url);
    else if (action === "check") checkTask(task.id);
    else if (action === "claim") claimTask(task.id);
  } else if (task.type === "adsgram_task") {
    if (action === "go") showAdsgramTask();
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
});

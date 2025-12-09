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
    leaderboard_title: "Top 10 Players",
    leaderboard_me: "Your Rank",
    chest_btn: "OPEN",
    watch_ad_btn: "WATCH AD",
    go_btn: "GO",
    check_btn: "CHECK",
    claim_btn: "CLAIM",
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
    leaderboard_title: "İlk 10 Oyuncu",
    leaderboard_me: "Senin Sıran",
    chest_btn: "AÇ",
    watch_ad_btn: "REKLAM İZLE",
    go_btn: "GİT",
    check_btn: "KONTROL",
    claim_btn: "AL",
  },
};

let currentLang = localStorage.getItem("tap_lang") || "en";

// Backend origin
const API_BASE = window.location.origin;

// Kullanıcı durumu
let userId = null;
let userState = null;

// AdsGram
let AdController = null;
// Yeni blockId'yi buraya yazmıştık (örnek: "17996")
const ADSGRAM_REWARD_BLOCK_ID = "17996";
const ADSGRAM_INTERSTITIAL_BLOCK_ID = "int-17995";

let tapCounter = 0;
const TAPS_PER_AD = 100;
let lastInterstitialTime = 0;
const INTERSTITIAL_INTERVAL_MS = 60_000;

// Tasks
const taskStatusMap = {};

// Günlük görevler (sadeleştirilmiş ama gelir odaklı)
const TASKS = [
  {
    id: "daily_ton_chest",
    type: "chest",
    iconEmoji: "🎁",
    title: "Daily TON Chest",
    description: "Watch an ad & get 0.01 TON.",
    rewardText: "+0.01 TON",
  },
  {
    id: "reward_video_extra",
    type: "reward",
    iconEmoji: "🎬",
    title: "Watch a Reward Ad",
    description: "Watch a full ad and earn bonus.",
    rewardText: "+TON Credits",
  },
  {
    id: "invite_friends",
    type: "invite",
    iconEmoji: "👥",
    title: "Invite Friends",
    description: "Invite friends via Telegram and earn when they play.",
    rewardText: "+0.02 TON per active friend",
  },
  {
    id: "affiliate_boinker",
    type: "affiliate",
    iconEmoji: "🧠",
    title: "Visit Boinker",
    description: "Open Boinker and explore the game.",
    rewardText: "+1000 coins",
    url: "https://t.me/boinker_bot?start=_tgr_TiWlA9A5YWY8",
  },
  {
    id: "affiliate_dotcoin",
    type: "affiliate",
    iconEmoji: "🟡",
    title: "Visit DotCoin",
    description: "Open DotCoin from Telegram.",
    rewardText: "+1000 coins",
    url: "https://t.me/dotcoin_bot",
  },
];

// --------- Yardımcı: Dil UI ---------
function getDict() {
  return LANG[currentLang] || LANG.en;
}

function updateLangUI() {
  const dict = getDict();

  const tapBtn = document.getElementById("tap-btn");
  const upgradeTitle = document.querySelector(".upgrade-section h2");
  const upgradeBtn = document.getElementById("upgrade-tap-power-btn");
  const walletTitle = document.querySelector(".wallet-title");
  const buyTonBtn = document.getElementById("buy-coins-ton-btn");
  const tasksTitle = document.querySelector(".tasks-title");
  const tasksSubtitle = document.querySelector(".tasks-subtitle");
  const tasksOpenBtn = document.getElementById("open-tasks-btn");
  const tonCreditsLabel = document.querySelector("#user-info .ton-credits-label");
  const leaderboardTitle = document.querySelector(".leaderboard-title");

  const cost = getUpgradeCost();

  if (tapBtn) tapBtn.textContent = dict.tap;
  if (upgradeTitle) upgradeTitle.textContent = dict.upgrade_title;
  if (upgradeBtn)
    upgradeBtn.textContent = `${dict.upgrade_btn_prefix}${cost} coins)`;
  if (walletTitle) walletTitle.textContent = dict.wallet_title;
  if (buyTonBtn) buyTonBtn.textContent = dict.buy_ton;
  if (tasksTitle) tasksTitle.textContent = dict.daily_tasks;
  if (tasksSubtitle) tasksSubtitle.textContent = dict.daily_sub;
  if (tasksOpenBtn) tasksOpenBtn.textContent = dict.tasks_button;
  if (tonCreditsLabel) tonCreditsLabel.textContent = dict.ton_credits_label + ":";
  if (leaderboardTitle) leaderboardTitle.textContent = dict.leaderboard_title;

  // Task kart metinleri (buton etiketleri)
  const tasksList = document.getElementById("tasks-list");
  if (tasksList && tasksList.children.length > 0) {
    // renderTasksBoard zaten butonları set ediyor, burada ekstra bir şey yapmaya gerek yok
  }
}

function initLanguageSelector() {
  const chips = document.querySelectorAll(".lang-chip");
  chips.forEach((chip) => {
    const lang = chip.dataset.lang;
    chip.classList.toggle("active", lang === currentLang);
    chip.onclick = () => {
      currentLang = lang;
      localStorage.setItem("tap_lang", currentLang);
      chips.forEach((c) =>
        c.classList.toggle("active", c.dataset.lang === currentLang)
      );
      updateLangUI();
    };
  });
}

// --------- AdsGram Başlat ---------
function initAdsgram() {
  if (!window.Adsgram) {
    console.log("AdsGram SDK yok (sad.min.js yüklü mü?)");
    return;
  }
  try {
    // Reward block
    AdController = window.Adsgram.init({ blockId: ADSGRAM_REWARD_BLOCK_ID });
    console.log("AdsGram init OK:", ADSGRAM_REWARD_BLOCK_ID);
  } catch (err) {
    console.error("AdsGram init error:", err);
  }
}

function maybeShowInterstitial() {
  if (!window.Adsgram) return;
  const now = Date.now();
  if (now - lastInterstitialTime < INTERSTITIAL_INTERVAL_MS) return;

  lastInterstitialTime = now;
  try {
    const interstitialController = window.Adsgram.init({
      blockId: ADSGRAM_INTERSTITIAL_BLOCK_ID,
    });
    interstitialController
      .show()
      .then((res) => console.log("Interstitial OK:", res))
      .catch((err) => console.error("Interstitial error:", err));
  } catch (err) {
    console.error("Interstitial init error:", err);
  }
}

function showRewardAd(onDone) {
  if (!AdController) {
    alert("Ad is not ready yet. Please try again later.");
    return;
  }
  AdController.show()
    .then((result) => {
      console.log("Reward ad result:", result);
      if (result && result.done && !result.error) {
        if (typeof onDone === "function") onDone();
      } else {
        alert("You need to watch the ad completely to get a reward.");
      }
    })
    .catch((err) => {
      console.error("Reward ad error:", err);
      alert("An error occurred while playing the ad.");
    });
}

// --------- TON Wallet (frontend iskelet) ---------
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
      const addrEl = document.getElementById("wallet-address");
      if (wallet) {
        connectedWalletAddress = wallet.account.address;
        if (addrEl) addrEl.textContent = "Wallet: " + connectedWalletAddress;
      } else {
        connectedWalletAddress = null;
        if (addrEl) addrEl.textContent = "";
      }
    });
  } catch (err) {
    console.error("TonConnect init error:", err);
  }
}

// --------- Kullanıcı / Seviye / Tap ---------
function getUpgradeCost() {
  if (!userState || typeof userState.tap_power !== "number") return 1000;
  const level = userState.level || 1;
  // Önerdiğin gibi: 0→1:1000, 1→2:2000, 2→3:3000...
  return (level + 1) * 1000;
}

async function initUser() {
  // Telegram içinden geldiyse
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
}

async function fetchUser() {
  if (!userId) return;
  try {
    const res = await fetch(`${API_BASE}/api/me?telegram_id=${userId}`);
    if (!res.ok) throw new Error("get /api/me failed");
    const data = await res.json();
    userState = data;
    renderUser();
  } catch (err) {
    console.error("fetchUser error:", err);
  }
}

async function tapOnce() {
  if (!userId) return;
  try {
    const res = await fetch(`${API_BASE}/api/tap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, taps: 1 }),
    });
    if (!res.ok) {
      alert("Tap failed, please try again.");
      return;
    }
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
    const res = await fetch(`${API_BASE}/api/upgrade/tap_power`, {
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
      alert("Upgrade failed.");
      return;
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

function renderUser() {
  if (!userState) return;

  const levelEl = document.getElementById("level");
  const coinsEl = document.getElementById("coins");
  const powerEl = document.getElementById("tap_power");
  const tonCreditsEl = document.getElementById("ton_credits");
  const tonPillEl = document.getElementById("ton-pill-value");
  const levelBarFill = document.getElementById("level-bar-fill");

  if (levelEl) levelEl.textContent = userState.level ?? 1;
  if (coinsEl) coinsEl.textContent = userState.coins ?? 0;
  if (powerEl) powerEl.textContent = userState.tap_power ?? 1;

  const tonCredits = userState.ton_credits ?? 0;
  if (tonCreditsEl) tonCreditsEl.textContent = tonCredits.toFixed(2);
  if (tonPillEl) tonPillEl.textContent = tonCredits.toFixed(2);

  // Level progress bar (coins / next level cost)
  if (levelBarFill) {
    const cost = getUpgradeCost();
    const currentCoins = userState.coins ?? 0;
    let ratio = Math.min(currentCoins / cost, 1);
    levelBarFill.style.width = `${(ratio * 100).toFixed(0)}%`;
  }

  updateLangUI();
}

// --------- Günlük Görevler ---------
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

    if (task.type === "chest") {
      const btn = document.createElement("button");
      btn.className = "task-cta-btn";
      btn.textContent = dict.chest_btn;
      btn.onclick = () => handleDailyChest();
      actions.appendChild(btn);
    } else if (task.type === "reward") {
      const btn = document.createElement("button");
      btn.className = "task-cta-btn";
      btn.textContent = dict.watch_ad_btn;
      btn.onclick = () => handleRewardAdTask();
      actions.appendChild(btn);
    } else if (task.type === "invite") {
      const goBtn = document.createElement("button");
      goBtn.className = "task-cta-btn";
      goBtn.textContent = dict.go_btn;
      goBtn.onclick = () => handleInviteGo();

      const checkBtn = document.createElement("button");
      checkBtn.className = "task-cta-btn";
      checkBtn.textContent = dict.check_btn;
      checkBtn.onclick = () => handleCheckTask(task.id);

      const claimBtn = document.createElement("button");
      claimBtn.className = "task-cta-btn";
      claimBtn.textContent = dict.claim_btn;
      claimBtn.disabled = status !== "checked";
      claimBtn.onclick = () => handleClaimTask(task.id);

      actions.appendChild(goBtn);
      actions.appendChild(checkBtn);
      actions.appendChild(claimBtn);
    } else if (task.type === "affiliate") {
      const goBtn = document.createElement("button");
      goBtn.className = "task-cta-btn";
      goBtn.textContent = dict.go_btn;
      goBtn.onclick = () => openAffiliate(task.url);

      const checkBtn = document.createElement("button");
      checkBtn.className = "task-cta-btn";
      checkBtn.textContent = dict.check_btn;
      checkBtn.onclick = () => handleCheckTask(task.id);

      const claimBtn = document.createElement("button");
      claimBtn.className = "task-cta-btn";
      claimBtn.textContent = dict.claim_btn;
      claimBtn.disabled = status !== "checked";
      claimBtn.onclick = () => handleClaimTask(task.id);

      actions.appendChild(goBtn);
      actions.appendChild(checkBtn);
      actions.appendChild(claimBtn);
    }

    card.appendChild(icon);
    card.appendChild(main);
    card.appendChild(actions);
    container.appendChild(card);
  });
}

function handleDailyChest() {
  if (!userId) return;

  // Önce reklam → sonra backend'ten 0.01 TON iste
  showRewardAd(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/daily_ton_chest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_id: userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.detail === "DAILY_LIMIT_REACHED") {
          alert("Daily TON Chest limit reached for today.");
          return;
        }
        alert("Chest failed.");
        return;
      }
      const data = await res.json();
      if (data.user) {
        userState = data.user;
        renderUser();
      }
      alert("You received +0.01 TON!");
    } catch (err) {
      console.error("daily chest error:", err);
    }
  });
}

function handleRewardAdTask() {
  if (!userId) return;
  showRewardAd(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/reward/ad`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_id: userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.detail === "DAILY_LIMIT_REACHED") {
          alert("Daily video ad limit reached.");
          return;
        }
        alert("Reward failed.");
        return;
      }
      const data = await res.json();
      if (data.user) {
        userState = data.user;
        renderUser();
      }
      alert("Reward added!");
    } catch (err) {
      console.error("reward/ad error:", err);
    }
  });
}

function openAffiliate(url) {
  if (!url) return;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank");
}

function handleInviteGo() {
  if (!userId) return;
  const baseBot = "https://t.me/TaptoEarnTonBot";
  const refLink = `${baseBot}?start=${userId}`;
  const shareLink = `https://t.me/share/url?url=${encodeURIComponent(
    refLink
  )}&text=${encodeURIComponent(
    "Join Tap to Earn TON and start earning by tapping!"
  )}`;

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(shareLink);
  } else if (navigator.share) {
    navigator
      .share({ title: "Tap to Earn TON", text: "Join the game!", url: refLink })
      .catch(() => {});
  } else {
    window.open(shareLink, "_blank");
  }
}

async function handleCheckTask(taskId) {
  if (!userId) return;
  try {
    const res = await fetch(`${API_BASE}/api/tasks/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, task_id: taskId }),
    });
    if (!res.ok) {
      alert("Task check failed.");
      return;
    }
    const data = await res.json();
    taskStatusMap[taskId] = data.task_status || "checked";
    renderTasksBoard();
    alert("Task checked. If everything is OK, now you can claim.");
  } catch (err) {
    console.error("checkTask error:", err);
  }
}

async function handleClaimTask(taskId) {
  if (!userId) return;

  // UI seviyesinde de zorunlu: önce "checked" olmalı
  if (taskStatusMap[taskId] !== "checked") {
    alert("You must CHECK the task before claiming.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/tasks/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, task_id: taskId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.detail === "TASK_NOT_READY") {
        alert("Task is not ready. Please CHECK first.");
        return;
      }
      alert("Task claim failed.");
      return;
    }
    const data = await res.json();
    taskStatusMap[taskId] = data.task_status || "claimed";
    if (data.user) {
      userState = data.user;
      renderUser();
    }
    renderTasksBoard();
    alert(`Task completed! +${data.reward_coins || 0} coins added.`);
  } catch (err) {
    console.error("claimTask error:", err);
  }
}

// --------- Leaderboard ---------
async function openLeaderboard() {
  const modal = document.getElementById("leaderboard-modal");
  if (!modal) return;
  modal.classList.remove("hidden");

  const listEl = document.getElementById("leaderboard-list");
  const meRowEl = document.getElementById("leaderboard-me-row");
  if (listEl) listEl.innerHTML = "";
  if (meRowEl) meRowEl.innerHTML = "";

  try {
    const url = userId
      ? `${API_BASE}/api/leaderboard?telegram_id=${userId}`
      : `${API_BASE}/api/leaderboard`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("leaderboard failed");
    const data = await res.json();

    const top = data.top || [];
    const me = data.me || null;

    if (listEl) {
      top.forEach((entry, idx) => {
        const row = document.createElement("div");
        row.className = "leaderboard-row";

        const rank = document.createElement("span");
        rank.className = "lb-rank";
        rank.textContent = entry.rank ?? idx + 1;

        const name = document.createElement("span");
        name.className = "lb-name";
        name.textContent = entry.username || `User ${entry.telegram_id}`;

        const coins = document.createElement("span");
        coins.className = "lb-coins";
        coins.textContent = (entry.coins ?? 0) + " coins";

        row.appendChild(rank);
        row.appendChild(name);
        row.appendChild(coins);

        listEl.appendChild(row);
      });
    }

    if (me && meRowEl) {
      const row = document.createElement("div");
      row.className = "leaderboard-row me-row";

      const rank = document.createElement("span");
      rank.className = "lb-rank";
      rank.textContent = me.rank ?? "-";

      const name = document.createElement("span");
      name.className = "lb-name";
      name.textContent = me.username || `You (${me.telegram_id})`;

      const coins = document.createElement("span");
      coins.className = "lb-coins";
      coins.textContent = (me.coins ?? 0) + " coins";

      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(coins);

      meRowEl.appendChild(row);
    }
  } catch (err) {
    console.error("leaderboard error:", err);
  }
}

// --------- Modal helpers ---------
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

// --------- DOMContentLoaded ---------
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
  const tasksBtn = document.getElementById("open-tasks-btn");
  const walletBtn = document.getElementById("wallet-open-btn");
  const leaderboardBtn = document.getElementById("open-leaderboard-btn");
  const closeButtons = document.querySelectorAll(".overlay-close");

  if (tapBtn) tapBtn.addEventListener("click", tapOnce);
  if (upgradeBtn) upgradeBtn.addEventListener("click", upgradeTapPower);
  if (tasksBtn)
    tasksBtn.addEventListener("click", () => {
      openModal("tasks-modal");
      renderTasksBoard();
    });
  if (walletBtn)
    walletBtn.addEventListener("click", () => openModal("wallet-modal"));
  if (leaderboardBtn)
    leaderboardBtn.addEventListener("click", () => openLeaderboard());

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

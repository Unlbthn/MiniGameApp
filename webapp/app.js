// Telegram WebApp
const tg = window.Telegram ? window.Telegram.WebApp : null;

// Languages
const LANG = {
  en: {
    tap: "TAP",
    upgrade_title: "Upgrade",
    upgrade_btn_prefix: "Increase Tap Power (cost: ",
    wallet_title: "TON Wallet",
    buy_ton: "Buy coins with TON (soon)",
    daily_tasks: "Daily Tasks",
    daily_sub: "Complete tasks to earn extra coins and TON credits.",
    tasks_button: "Daily Tasks",
    ton_credits_label: "TON Credits",
    daily_ton_chest_title: "Daily TON Chest",
    daily_ton_chest_desc: "Watch a short ad and get 0.1 TON credits.",
    watch_ad: "WATCH AD",
    go: "GO",
    check: "CHECK",
    claim: "CLAIM",
    invite_title: "Invite Friends",
    invite_desc: "Invite a friend. When they reach 200 coins, you get +0.02 TON.",
    invite_reward: "+0.02 TON",
    lb_me_prefix: "Your rank:",
    lb_coming_soon: "Leaderboard data is not ready yet.",
  },
  tr: {
    tap: "TIKLA",
    upgrade_title: "Yükselt",
    upgrade_btn_prefix: "Vuruş Gücünü Artır (maliyet: ",
    wallet_title: "TON Cüzdan",
    buy_ton: "TON ile coin satın al (yakında)",
    daily_tasks: "Günlük Görevler",
    daily_sub: "Ek coin ve TON kredisi için görevleri tamamla.",
    tasks_button: "Günlük Görevler",
    ton_credits_label: "TON Kredileri",
    daily_ton_chest_title: "Günlük TON Sandığı",
    daily_ton_chest_desc: "Kısa bir reklam izle, 0.1 TON kredisi kazan.",
    watch_ad: "REKLAM İZLE",
    go: "GİT",
    check: "KONTROL",
    claim: "AL",
    invite_title: "Arkadaş Davet Et",
    invite_desc:
      "Bir arkadaşını davet et. 200 coine ulaştığında sen +0.02 TON alırsın.",
    invite_reward: "+0.02 TON",
    lb_me_prefix: "Sıralaman:",
    lb_coming_soon: "Liderlik tablosu verisi henüz hazır değil.",
  },
};

let currentLang = localStorage.getItem("tap_lang") || "en";

// User state
let userId = null;
let userState = null;

// Backend origin
const API_BASE = window.location.origin;

// AdsGram
let tapCounter = 0;
const TAPS_PER_AD = 100;
let lastAdTime = 0;
const AD_INTERVAL_MS = 60_000;

let RewardAdController = null;
let InterstitialAdController = null;
const ADSGRAM_REWARD_BLOCK_ID = "17996";
const ADSGRAM_INTERSTITIAL_BLOCK_ID = "int-17995";

// Task state
const TASKS = [
  {
    id: "daily_ton_chest",
    type: "reward",
    iconType: "reward",
    iconEmoji: "🎁",
    titleKey: "daily_ton_chest_title",
    descKey: "daily_ton_chest_desc",
    rewardText: "+0.1 TON credits",
  },
  {
    id: "invite_friends",
    type: "invite",
    iconType: "affiliate",
    iconEmoji: "👥",
    titleKey: "invite_title",
    descKey: "invite_desc",
    rewardTextKey: "invite_reward",
  },
  {
    id: "affiliate_boinker",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🧠",
    title: "Open Boinker",
    description: "Open Boinker mini-app and explore.",
    rewardText: "+1000 coins",
    url: "https://t.me/boinker_bot?start=_tgr_TiWlA9A5YWY8",
  },
  {
    id: "affiliate_dotcoin",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🟡",
    title: "Visit DotCoin",
    description: "Open DotCoin bot in Telegram.",
    rewardText: "+1000 coins",
    url: "https://t.me/dotcoin_bot",
  },
  {
    id: "affiliate_bbqcoin",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🍖",
    title: "Visit BBQCoin",
    description: "Check out BBQCoin game.",
    rewardText: "+1000 coins",
    url: "https://t.me/BBQCoin_bot",
  },
];

// client-side helper: taskId -> {went: bool}
const localTaskState = {};

// TON wallet (TonConnect)
let tonConnectUI = null;
let connectedWalletAddress = null;
const TONCONNECT_MANIFEST_URL =
  "https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json";

// ---------------------------
// AdsGram init & helpers
// ---------------------------
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
    console.log("AdsGram init OK");
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

function showRewardAd() {
  if (!RewardAdController) {
    alert("Ad not ready yet, please try again.");
    return;
  }

  RewardAdController.show()
    .then((result) => {
      console.log("Reward ad result:", result);
      if (result && result.done && !result.error) {
        claimAdRewardFromBackend();
      } else {
        alert("To get reward, you need to watch the ad completely.");
      }
    })
    .catch((err) => {
      console.error("Reward ad error:", err);
      alert("Error while playing ad.");
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
        alert("You reached the daily ad limit.");
        return;
      }
      throw new Error("Reward request failed");
    }

    const data = await res.json();
    if (data.user) {
      userState = data.user;
      renderUser();
    }

    alert("+0.1 TON credited!");
  } catch (err) {
    console.error("claimAdRewardFromBackend error:", err);
  }
}

// ---------------------------
// TON wallet (TonConnect)
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

// ---------------------------
// Language
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
        c.classList.toggle("active", c.dataset.lang === currentLang),
      );
      updateLangUI();
    });
  });
}

function getUpgradeCost() {
  if (!userState || typeof userState.tap_power !== "number") return 100;
  return (userState.tap_power || 1) * 100;
}

function updateLangUI() {
  const dict = LANG[currentLang] || LANG.en;

  const tapBtn = document.getElementById("tap-btn");
  const upgradeTitle = document.querySelector(".upgrade-section h2");
  const upgradeBtn = document.getElementById("upgrade-tap-power-btn");
  const tasksTitle = document.querySelector(".tasks-title");
  const tasksSubtitle = document.querySelector(".tasks-subtitle");
  const tasksOpenBtn = document.getElementById("open-tasks-btn");
  const tonCreditsLabel = document.querySelector(
    "#user-info p:nth-of-type(4)",
  );

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

  renderTasksBoard();
}

// ---------------------------
// User init & fetch
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
// Tap & upgrade
// ---------------------------
async function tapOnce() {
  if (!userId) return;

  try {
    const res = await fetch(API_BASE + "/api/tap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, taps: 1 }),
    });

    if (!res.ok) {
      console.error("tap failed", res.status);
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
// User render & level bar
// ---------------------------
function renderUser() {
  if (!userState) return;

  const levelEl = document.getElementById("level");
  const coinsEl = document.getElementById("coins");
  const powerEl = document.getElementById("tap_power");
  const tonCreditsEl = document.getElementById("ton_credits");

  if (levelEl) levelEl.textContent = userState.level ?? 1;
  if (coinsEl) coinsEl.textContent = userState.coins ?? 0;
  if (powerEl) powerEl.textContent = userState.tap_power ?? 1;
  if (tonCreditsEl) {
    const val = userState.ton_credits ?? 0;
    tonCreditsEl.textContent = Number(val).toFixed(2);
  }

  renderLevelProgress();
  updateLangUI();
}

function renderLevelProgress() {
  const fillEl = document.getElementById("level-progress-fill");
  const labelEl = document.getElementById("level-progress-label");
  if (!fillEl || !labelEl || !userState) return;

  const level = userState.level ?? 1;
  const totalCoins = userState.total_coins ?? userState.coins ?? 0;

  const currentLevelThreshold = level * 1000;
  const nextLevelThreshold = (level + 1) * 1000;
  let progress = 0;
  if (totalCoins >= currentLevelThreshold) {
    progress =
      Math.min(
        (totalCoins - currentLevelThreshold) /
          (nextLevelThreshold - currentLevelThreshold || 1),
        1,
      ) * 100;
  }

  fillEl.style.width = `${progress}%`;
  labelEl.textContent = `Next level: ${Math.max(
    0,
    nextLevelThreshold - totalCoins,
  )} coins`;
}

// ---------------------------
// Tasks & status
// ---------------------------
async function fetchTaskStatuses() {
  if (!userId) return;
  try {
    const res = await fetch(
      API_BASE + "/api/tasks/status?telegram_id=" + userId,
    );
    if (!res.ok) throw new Error("tasks/status failed");
    const data = await res.json();
    data.forEach((t) => {
      localTaskState[t.task_id] = localTaskState[t.task_id] || {};
      localTaskState[t.task_id].status = t.status;
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

  const dict = LANG[currentLang] || LANG.en;

  TASKS.forEach((task) => {
    const state = localTaskState[task.id] || {};
    const status = state.status || "pending";

    const card = document.createElement("div");
    card.className = "task-card";

    const icon = document.createElement("div");
    icon.className = "task-icon " + task.iconType;
    icon.textContent = task.iconEmoji || "⭐";

    const main = document.createElement("div");
    main.className = "task-main";

    const titleRow = document.createElement("div");
    titleRow.className = "task-title-row";

    const titleEl = document.createElement("div");
    titleEl.className = "task-title";
    if (task.titleKey) {
      titleEl.textContent = dict[task.titleKey];
    } else {
      titleEl.textContent = task.title;
    }

    const infoBadge = document.createElement("div");
    infoBadge.className = "task-info-badge";
    infoBadge.textContent = "!";
    titleRow.appendChild(titleEl);
    titleRow.appendChild(infoBadge);

    const descEl = document.createElement("p");
    descEl.className = "task-desc";
    if (task.descKey) {
      descEl.textContent = dict[task.descKey];
    } else {
      descEl.textContent = task.description;
    }

    const rewardEl = document.createElement("div");
    rewardEl.className = "task-reward";
    if (task.rewardTextKey) {
      rewardEl.textContent = dict[task.rewardTextKey];
    } else {
      rewardEl.textContent = task.rewardText;
    }

    main.appendChild(titleRow);
    main.appendChild(descEl);
    main.appendChild(rewardEl);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    if (task.type === "reward") {
      const btn = document.createElement("button");
      btn.className = "task-cta-btn";
      btn.textContent = dict.watch_ad;
      btn.addEventListener("click", () => showRewardAd());
      actions.appendChild(btn);
    } else if (task.type === "invite") {
      const goBtn = document.createElement("button");
      goBtn.className = "task-cta-btn";
      goBtn.textContent = dict.go;
      goBtn.disabled = status === "claimed";
      goBtn.addEventListener("click", () => handleTaskClick(task, "go"));

      const checkBtn = document.createElement("button");
      checkBtn.className = "task-cta-btn";
      checkBtn.textContent = dict.check;
      checkBtn.disabled = status === "claimed";
      checkBtn.addEventListener("click", () => handleTaskClick(task, "check"));

      const claimBtn = document.createElement("button");
      claimBtn.className = "task-cta-btn";
      claimBtn.textContent = dict.claim;
      claimBtn.disabled = status !== "checked";
      claimBtn.addEventListener("click", () =>
        handleTaskClick(task, "claim"),
      );

      actions.appendChild(goBtn);
      actions.appendChild(checkBtn);
      actions.appendChild(claimBtn);
    } else {
      const goBtn = document.createElement("button");
      goBtn.className = "task-cta-btn";
      goBtn.textContent = dict.go;
      goBtn.disabled = status === "claimed";
      goBtn.addEventListener("click", () => handleTaskClick(task, "go"));

      const checkBtn = document.createElement("button");
      checkBtn.className = "task-cta-btn";
      checkBtn.textContent = dict.check;
      checkBtn.disabled = status === "claimed";
      checkBtn.addEventListener("click", () => handleTaskClick(task, "check"));

      const claimBtn = document.createElement("button");
      claimBtn.className = "task-cta-btn";
      claimBtn.textContent = dict.claim;
      claimBtn.disabled = status !== "checked";
      claimBtn.addEventListener("click", () =>
        handleTaskClick(task, "claim"),
      );

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

function handleTaskClick(task, action) {
  const state = (localTaskState[task.id] = localTaskState[task.id] || {});
  const status = state.status || "pending";

  if (action === "claim") {
    if (status !== "checked") {
      alert("You must CHECK first before claiming.");
      return;
    }
  }

  if (task.type === "reward") {
    if (action === "go") showRewardAd();
    return;
  }

  if (task.type === "invite") {
    if (action === "go") {
      openInviteModal();
      state.went = true;
      return;
    }
    if (action === "check") {
      if (!state.went) {
        alert("You need to open the invite link first (GO).");
        return;
      }
      checkTask(task.id);
      return;
    }
    if (action === "claim") {
      claimTask(task.id);
      return;
    }
  }

  if (task.type === "affiliate") {
    if (action === "go") {
      openAffiliate(task.url);
      state.went = true;
      return;
    }
    if (action === "check") {
      if (!state.went) {
        alert("Open the target first (GO), then CHECK.");
        return;
      }
      checkTask(task.id);
      return;
    }
    if (action === "claim") {
      claimTask(task.id);
      return;
    }
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
    localTaskState[taskId] = localTaskState[taskId] || {};
    localTaskState[taskId].status = data.task_status;
    renderTasksBoard();
    alert("Task checked, now you can CLAIM.");
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
        alert("You must CHECK first.");
        return;
      }
      throw new Error("claimTask failed");
    }
    const data = await res.json();
    localTaskState[taskId] = localTaskState[taskId] || {};
    localTaskState[taskId].status = data.task_status;
    if (data.user) {
      userState = data.user;
      renderUser();
    }
    renderTasksBoard();
    alert(`Task completed, +${data.reward_coins} coins gained!`);
  } catch (err) {
    console.error("claimTask error:", err);
  }
}

// ---------------------------
// Invite modal
// ---------------------------
function openInviteModal() {
  const modal = document.getElementById("invite-modal");
  if (!modal) return;

  const input = document.getElementById("invite-link-input");

  const baseLink = "https://t.me/TaptoEarnTonBot";
  const link = userId
    ? `${baseLink}?start=ref_${userId}`
    : `${baseLink}?start=ref_demo`;

  if (input) input.value = link;

  openModal("invite-modal");
}

function initInviteCopyButton() {
  const btn = document.getElementById("copy-invite-link-btn");
  const input = document.getElementById("invite-link-input");
  if (!btn || !input) return;

  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      alert("Copied.");
    } catch {
      input.select();
      document.execCommand("copy");
      alert("Copied.");
    }
  });
}

// ---------------------------
// Leaderboard
// ---------------------------
async function openLeaderboard() {
  const modalId = "leaderboard-modal";
  openModal(modalId);

  const listEl = document.getElementById("leaderboard-list");
  const meEl = document.getElementById("leaderboard-me");
  if (!listEl || !meEl) return;
  listEl.innerHTML = "";
  meEl.innerHTML = "";

  const dict = LANG[currentLang] || LANG.en;

  try {
    const url =
      API_BASE +
      "/api/leaderboard" +
      (userId ? `?telegram_id=${encodeURIComponent(userId)}` : "");
    const res = await fetch(url);
    if (!res.ok) {
      listEl.innerHTML = `<p class="info-text">${dict.lb_coming_soon}</p>`;
      return;
    }
    const data = await res.json();
    const top = data.top || [];
    const meRank = data.me_rank || null;

    top.forEach((u, idx) => {
      const row = document.createElement("div");
      row.className = "lb-row";

      const rank = document.createElement("div");
      rank.className = "lb-rank";
      rank.textContent = `#${idx + 1}`;

      const name = document.createElement("div");
      name.className = "lb-name";
      name.textContent = u.display_name || `User ${u.telegram_id}`;

      const score = document.createElement("div");
      score.className = "lb-score";
      score.textContent = `${u.coins ?? 0} coins`;

      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(score);
      listEl.appendChild(row);
    });

    if (meRank) {
      meEl.textContent = `${dict.lb_me_prefix} #${meRank}`;
    } else {
      meEl.textContent = dict.lb_coming_soon;
    }
  } catch (err) {
    console.error("leaderboard error:", err);
    listEl.innerHTML = `<p class="info-text">${dict.lb_coming_soon}</p>`;
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
  const openLeaderboardBtn = document.getElementById("open-leaderboard-btn");
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
  if (openLeaderboardBtn)
    openLeaderboardBtn.addEventListener("click", openLeaderboard);

  closeButtons.forEach((btn) => {
    const target = btn.getAttribute("data-close");
    btn.addEventListener("click", () => closeModal(target));
  });

  initLanguageSelector();
  updateLangUI();
  initUser();
  initTonConnect();
  initAdsgram();
  initInviteCopyButton();
});

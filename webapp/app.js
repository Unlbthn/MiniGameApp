// -------------------------------------------------
// Telegram WebApp integration
// -------------------------------------------------
const tg = window.Telegram ? window.Telegram.WebApp : null;

// -------------------------------------------------
// Globals
// -------------------------------------------------
let userId = null;
let userState = null;
let currentLang = localStorage.getItem("tap_lang") || "en";

const API_BASE = window.location.origin;

// AdsGram
let tapCounter = 0;
const TAPS_PER_AD = 100;
let lastAdTime = 0;
const AD_INTERVAL_MS = 60_000;
let AdController = null;

// -------------------------------------------------
// i18n
// -------------------------------------------------
const LANG = {
  en: {
    level: "Level",
    coins: "Coins",
    tap_power: "Tap Power",
    ton_credits: "TON Credits",
    upgrade: "Upgrade",
    upgrade_btn: (cost) => `Increase Tap Power (cost: ${cost} coins)`,
    upgrade_hint: "Every 100 taps shows an ad and boosts your earnings.",
    daily_chest: "Daily TON Chest",
    daily_tasks: "Daily Tasks",
    tasks_title: "Daily Tasks",
    tasks_subtitle: "Complete tasks to earn extra coins.",
    tap_failed: "Tap failed, please try again.",
    not_enough_coins: "Not enough coins.",
    chest_ok: (coins, ton) => `Chest opened! +${coins} coins, +${ton} TON`,
    chest_already: "You already opened the chest today.",
  },
  tr: {
    level: "Seviye",
    coins: "Coin",
    tap_power: "Vuruş Gücü",
    ton_credits: "TON Kredileri",
    upgrade: "Yükselt",
    upgrade_btn: (cost) => `Vuruş Gücünü Artır (maliyet: ${cost} coin)`,
    upgrade_hint:
      "Her 100 tıklamada bir reklam gösterilir ve kazancın artar.",
    daily_chest: "Günlük TON Sandığı",
    daily_tasks: "Günlük Görevler",
    tasks_title: "Günlük Görevler",
    tasks_subtitle: "Ek coin kazanmak için görevleri tamamla.",
    tap_failed: "Tıklama başarısız, lütfen tekrar dene.",
    not_enough_coins: "Yetersiz coin.",
    chest_ok: (coins, ton) =>
      `Sandık açıldı! +${coins} coin, +${ton} TON kazandın.`,
    chest_already: "Bugün sandığı zaten açtın.",
  },
};

function t(key, ...args) {
  const dict = LANG[currentLang] || LANG.en;
  const val = dict[key] ?? LANG.en[key];
  return typeof val === "function" ? val(...args) : val;
}

// -------------------------------------------------
// AdsGram init
// -------------------------------------------------
const ADSGRAM_INTERSTITIAL_BLOCK_ID = "int-17995";
const ADSGRAM_REWARD_BLOCK_ID = "17996";

function initAdsgram() {
  if (!window.Adsgram) {
    console.log("AdsGram SDK yok.");
    return;
  }
  try {
    AdController = window.Adsgram.init({
      blockId: ADSGRAM_INTERSTITIAL_BLOCK_ID,
    });
    console.log("AdsGram init OK");
  } catch (e) {
    console.error("AdsGram init error:", e);
  }
}

function maybeShowInterstitial() {
  if (!AdController) return;
  const now = Date.now();
  if (now - lastAdTime < AD_INTERVAL_MS) return;

  lastAdTime = now;
  AdController.show().catch((err) =>
    console.error("Interstitial show error:", err)
  );
}

function showRewardAd(onDone) {
  if (!window.Adsgram) {
    console.log("AdsGram yok, reward callback direkt çalıştırılıyor.");
    if (typeof onDone === "function") onDone(true);
    return;
  }

  window.Adsgram.show({
    blockId: ADSGRAM_REWARD_BLOCK_ID,
  })
    .then((result) => {
      console.log("Reward ad result:", result);
      if (result && result.done && !result.error) {
        if (typeof onDone === "function") onDone(true);
      } else {
        if (typeof onDone === "function") onDone(false);
      }
    })
    .catch((err) => {
      console.error("Reward ad error:", err);
      if (typeof onDone === "function") onDone(false);
    });
}

// -------------------------------------------------
// Toast helper
// -------------------------------------------------
function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  el.classList.add("visible");
  setTimeout(() => {
    el.classList.remove("visible");
    el.classList.add("hidden");
  }, 2500);
}

// -------------------------------------------------
// Language selector
// -------------------------------------------------
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
      updateTexts();
    });
  });
}

// -------------------------------------------------
// User loading
// -------------------------------------------------
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

  const name =
    (tg?.initDataUnsafe?.user?.first_name || "") +
    " " +
    (tg?.initDataUnsafe?.user?.last_name || "");

  try {
    const url =
      API_BASE +
      `/api/me?telegram_id=${encodeURIComponent(
        userId
      )}&name=${encodeURIComponent(name.trim())}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("get /api/me failed");
    userState = await res.json();
    renderUser();
  } catch (err) {
    console.error("initUser error:", err);
  }
}

// -------------------------------------------------
// Rendering
// -------------------------------------------------
function getUpgradeCost() {
  if (!userState) return 100;
  const tp = Number(userState.tap_power || 1);
  return tp * 100;
}

function renderUser() {
  if (!userState) return;

  const levelLabel = document.getElementById("level-label");
  const levelValue = document.getElementById("level-value");
  const coinsEl = document.getElementById("coins");
  const tapPowerEl = document.getElementById("tap_power");
  const tonEl = document.getElementById("ton_credits");
  const progressInner = document.getElementById("level-progress-inner");
  const nextLevelText = document.getElementById("next-level-text");

  if (levelLabel) levelLabel.textContent = t("level");
  if (coinsEl) coinsEl.textContent = userState.coins ?? 0;
  if (tapPowerEl) tapPowerEl.textContent = userState.tap_power ?? 1;
  if (tonEl)
    tonEl.textContent = (userState.ton_credits ?? 0).toFixed(2).toString();
  if (levelValue) levelValue.textContent = userState.level ?? 1;

  const xp = userState.xp ?? 0;
  const nextXp = userState.next_level_xp || 1000;
  const pct = Math.max(0, Math.min(100, (xp / nextXp) * 100));
  if (progressInner) {
    progressInner.style.width = `${pct}%`;
  }
  if (nextLevelText) {
    nextLevelText.textContent = `Next level: ${xp} / ${nextXp}`;
  }

  updateTexts();
}

function updateTexts() {
  const upgradeTitle = document.getElementById("upgrade-title");
  const upgradeBtn = document.getElementById("upgrade-tap-power-btn");
  const upgradeHint = document.getElementById("upgrade-hint");
  const dailyChestBtn = document.getElementById("daily-chest-btn");
  const dailyTasksBtn = document.getElementById("daily-tasks-btn");
  const tasksTitle = document.getElementById("tasks-title");
  const tasksSubtitle = document.getElementById("tasks-subtitle");
  const coinsLabel = document.getElementById("coins-label");
  const tapPowerLabel = document.getElementById("tap-power-label");
  const tonCreditsLabel = document.getElementById("ton-credits-label");

  const cost = getUpgradeCost();

  if (upgradeTitle) upgradeTitle.textContent = t("upgrade");
  if (upgradeBtn) upgradeBtn.textContent = t("upgrade_btn", cost);
  if (upgradeHint) upgradeHint.textContent = t("upgrade_hint");
  if (dailyChestBtn) dailyChestBtn.textContent = t("daily_chest");
  if (dailyTasksBtn) dailyTasksBtn.textContent = t("daily_tasks");
  if (tasksTitle) tasksTitle.textContent = t("tasks_title");
  if (tasksSubtitle) tasksSubtitle.textContent = t("tasks_subtitle");
  if (coinsLabel) coinsLabel.textContent = t("coins");
  if (tapPowerLabel) tapPowerLabel.textContent = t("tap_power");
  if (tonCreditsLabel) tonCreditsLabel.textContent = t("ton_credits");
}

// -------------------------------------------------
// Tap & upgrade
// -------------------------------------------------
async function tapOnce() {
  if (!userId) return;

  try {
    const res = await fetch(API_BASE + "/api/tap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, taps: 1 }),
    });

    if (!res.ok) {
      console.error("tap error:", await res.text());
      showToast(t("tap_failed"));
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
    showToast(t("tap_failed"));
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
      const data = await res.json().catch(() => ({}));
      if (data.detail === "NOT_ENOUGH_COINS") {
        showToast(t("not_enough_coins"));
        return;
      }
      console.error("upgrade error:", data);
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

// -------------------------------------------------
// Daily TON Chest (günde 1)
// -------------------------------------------------
async function openDailyChest() {
  if (!userId) return;

  showRewardAd(async (ok) => {
    if (!ok) {
      showToast("Ad failed, try again.");
      return;
    }

    try:
      const res = await fetch(API_BASE + "/api/reward/chest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_id: userId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.detail === "CHEST_ALREADY_OPENED") {
          showToast(t("chest_already"));
          return;
        }
        console.error("chest error:", data);
        showToast("Chest failed.");
        return;
      }

      const data = await res.json();
      if (data.user) {
        userState = data.user;
        renderUser();
      }
      showToast(t("chest_ok", data.reward_coins, data.reward_ton));
    } catch (err) {
      console.error("openDailyChest error:", err);
      showToast("Chest failed.");
    }
  });
}

// -------------------------------------------------
// Tasks
// -------------------------------------------------
const TASKS = [
  {
    id: "visit_boinker",
    title: "Open Boinker",
    desc: "Open Boinker mini app and explore.",
    rewardText: "+1000 coins",
    url: "https://t.me/boinker_bot?start=_tgr_TiWlA9A5YWY8",
  },
  {
    id: "visit_dotcoin",
    title: "Visit DotCoin",
    desc: "Open DotCoin bot.",
    rewardText: "+800 coins",
    url: "https://t.me/dotcoin_bot",
  },
  {
    id: "visit_bbqcoin",
    title: "Visit BBQCoin",
    desc: "Join BBQCoin game.",
    rewardText: "+800 coins",
    url: "https://t.me/BBQCoin_bot",
  },
  {
    id: "invite_friends",
    title: "Invite friends",
    desc: "Share your link with friends.",
    rewardText: "+2000 coins",
    url: null,
  },
];

const taskStatusMap = {};

async function fetchTaskStatuses() {
  if (!userId) return;
  try {
    const res = await fetch(
      API_BASE + `/api/tasks/status?telegram_id=${userId}`
    );
    if (!res.ok) throw new Error("tasks/status failed");
    const data = await res.json();
    data.forEach((t) => {
      taskStatusMap[t.task_id] = t.status;
    });
    renderTasks();
  } catch (err) {
    console.error("fetchTaskStatuses error:", err);
  }
}

function renderTasks() {
  const container = document.getElementById("tasks-list");
  if (!container) return;
  container.innerHTML = "";

  TASKS.forEach((task) => {
    const status = taskStatusMap[task.id] || "pending";

    const card = document.createElement("div");
    card.className = "task-card";

    const main = document.createElement("div");
    main.className = "task-main";

    const titleEl = document.createElement("p");
    titleEl.className = "task-title";
    titleEl.textContent = task.title;

    const descEl = document.createElement("p");
    descEl.className = "task-desc";
    descEl.textContent = task.desc;

    const rewardEl = document.createElement("p");
    rewardEl.className = "task-reward";
    rewardEl.textContent = task.rewardText;

    main.appendChild(titleEl);
    main.appendChild(descEl);
    main.appendChild(rewardEl);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const goBtn = document.createElement("button");
    goBtn.className = "task-btn";
    goBtn.textContent = "GO";
    goBtn.disabled = status === "claimed";
    goBtn.addEventListener("click", () => handleTaskGo(task));

    const checkBtn = document.createElement("button");
    checkBtn.className = "task-btn";
    checkBtn.textContent = "CHECK";
    checkBtn.disabled = status === "claimed";
    checkBtn.addEventListener("click", () => handleTaskCheck(task));

    const claimBtn = document.createElement("button");
    claimBtn.className = "task-btn primary";
    claimBtn.textContent = "CLAIM";
    claimBtn.disabled = status !== "checked";
    claimBtn.addEventListener("click", () => handleTaskClaim(task));

    actions.appendChild(goBtn);
    actions.appendChild(checkBtn);
    actions.appendChild(claimBtn);

    card.appendChild(main);
    card.appendChild(actions);
    container.appendChild(card);
  });
}

function openTelegramLink(url) {
  if (!url) return;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, "_blank");
  }
}

function handleTaskGo(task) {
  if (task.id === "invite_friends") {
    // Telegram share sheet
    const link = `https://t.me/TaptoEarnTonBot?start=ref_${userId}`;
    const msg =
      "Join Tap to Earn TON mini app and earn coins with me! " + link;
    if (tg?.shareUrl) {
      tg.shareUrl(link, msg);
    } else if (tg?.openTelegramLink) {
      tg.openTelegramLink(link);
    } else {
      window.open(link, "_blank");
    }
  } else if (task.url) {
    openTelegramLink(task.url);
  }
}

async function handleTaskCheck(task) {
  if (!userId) return;
  try {
    const res = await fetch(API_BASE + "/api/tasks/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, task_id: task.id }),
    });
    if (!res.ok) {
      console.error("checkTask failed:", await res.text());
      return;
    }
    const data = await res.json();
    taskStatusMap[task.id] = data.task_status;
    renderTasks();
    showToast("Checked, now claim your reward.");
  } catch (err) {
    console.error("handleTaskCheck error:", err);
  }
}

async function handleTaskClaim(task) {
  if (!userId) return;
  try {
    const res = await fetch(API_BASE + "/api/tasks/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, task_id: task.id }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.detail === "TASK_NOT_READY") {
        showToast("First CHECK the task.");
        return;
      }
      console.error("claimTask failed:", data);
      return;
    }

    const data = await res.json();
    taskStatusMap[task.id] = data.task_status;
    if (data.user) {
      userState = data.user;
      renderUser();
    }
    renderTasks();
    showToast(`+${data.reward_coins} coins`);
  } catch (err) {
    console.error("handleTaskClaim error:", err);
  }
}

// -------------------------------------------------
// Leaderboard
// -------------------------------------------------
async function openLeaderboard() {
  if (!userId) return;

  try {
    const res = await fetch(
      API_BASE + `/api/leaderboard?telegram_id=${userId}`
    );
    if (!res.ok) throw new Error("leaderboard failed");
    const data = await res.json();
    renderLeaderboard(data);
    openModal("leaderboard-modal");
  } catch (err) {
    console.error("openLeaderboard error:", err);
  }
}

function renderLeaderboard(data) {
  const listEl = document.getElementById("leaderboard-list");
  const meEl = document.getElementById("leaderboard-me");
  if (!listEl || !meEl) return;

  listEl.innerHTML = "";
  (data.top || []).forEach((item) => {
    const row = document.createElement("div");
    row.className = "lb-row";

    const left = document.createElement("span");
    left.textContent = `#${item.rank}`;

    const mid = document.createElement("span");
    mid.textContent =
      item.display_name || `User ${item.telegram_id}`;

    const right = document.createElement("span");
    right.textContent = item.total_coins ?? 0;

    row.appendChild(left);
    row.appendChild(mid);
    row.appendChild(right);
    listEl.appendChild(row);
  });

  meEl.innerHTML = "";
  if (data.me) {
    const row = document.createElement("div");
    row.className = "lb-row me";

    const left = document.createElement("span");
    left.textContent = `#${data.me.rank}`;

    const mid = document.createElement("span");
    mid.textContent =
      data.me.display_name || `User ${data.me.telegram_id}`;

    const right = document.createElement("span");
    right.textContent = data.me.total_coins ?? 0;

    row.appendChild(left);
    row.appendChild(mid);
    row.appendChild(right);
    meEl.appendChild(row);
  }
}

// -------------------------------------------------
// Modal helpers
// -------------------------------------------------
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

// -------------------------------------------------
// DOMContentLoaded
// -------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  if (tg) {
    try {
      tg.expand();
    } catch (e) {
      console.log("Telegram expand error:", e);
    }
  }

  initLanguageSelector();
  updateTexts();
  initUser();
  initAdsgram();

  const tapBtn = document.getElementById("tap-btn");
  const upgradeBtn = document.getElementById("upgrade-tap-power-btn");
  const dailyChestBtn = document.getElementById("daily-chest-btn");
  const dailyTasksBtn = document.getElementById("daily-tasks-btn");
  const walletBtn = document.getElementById("wallet-btn");
  const leaderboardBtn = document.getElementById("leaderboard-btn");

  if (tapBtn) tapBtn.addEventListener("click", tapOnce);
  if (upgradeBtn)
    upgradeBtn.addEventListener("click", upgradeTapPower);
  if (dailyChestBtn)
    dailyChestBtn.addEventListener("click", openDailyChest);
  if (dailyTasksBtn)
    dailyTasksBtn.addEventListener("click", () => {
      openModal("tasks-modal");
      fetchTaskStatuses();
    });
  if (walletBtn)
    walletBtn.addEventListener("click", () => openModal("wallet-modal"));
  if (leaderboardBtn)
    leaderboardBtn.addEventListener("click", openLeaderboard);

  const closeButtons = document.querySelectorAll(".close-btn");
  closeButtons.forEach((btn) => {
    const target = btn.getAttribute("data-close");
    btn.addEventListener("click", () => closeModal(target));
  });
});

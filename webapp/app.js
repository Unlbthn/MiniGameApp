// ----------------------------------------------------
// Telegram WebApp objesi
// ----------------------------------------------------
const tg = window.Telegram ? window.Telegram.WebApp : null;

// ----------------------------------------------------
// Dil metinleri (EN/TR)
// ----------------------------------------------------
const LANG = {
  en: {
    tap: "TAP",
    level: "Level",
    coins: "Coins",
    tap_power: "Tap Power",
    ton_credits: "TON Credits",
    tasks_title: "Daily Tasks",
    tasks_sub: "Complete tasks to earn extra coins and TON credits.",
    tasks_button: "Daily Tasks",
    leaderboard_title: "Top 10 Players",
    my_rank_prefix: "You are #",
    invite_text: "Play Tap to Earn TON with me and earn rewards!",
  },
  tr: {
    tap: "TIKLA",
    level: "Seviye",
    coins: "Coin",
    tap_power: "Vuruş Gücü",
    ton_credits: "TON Kredisi",
    tasks_title: "Günlük Görevler",
    tasks_sub: "Ek coin ve TON kredisi kazanmak için görevleri tamamla.",
    tasks_button: "Günlük Görevler",
    leaderboard_title: "İlk 10 Oyuncu",
    my_rank_prefix: "Sıran: #",
    invite_text: "Tap to Earn TON oyununa katıl, beraber kazanalım!",
  },
};

// ----------------------------------------------------
// Global state
// ----------------------------------------------------
let currentLang = localStorage.getItem("tap_lang") || "en";

let userId = null;
let userState = null;

// Backend origin (Railway / prod)
const API_BASE = window.location.origin;

// AdsGram
let AdController = null;
// Reward block (AdsGram panelinden aldığın blockId)
const ADSGRAM_REWARD_BLOCK_ID = "17996";
// Interstitial block
const ADSGRAM_INTERSTITIAL_BLOCK_ID = "int-17995";

let tapCounter = 0;
const TAPS_PER_AD = 100;

// Günlük görevler task-id'leri, backend ile uyumlu
const TASKS = [
  {
    id: "daily_ton_chest",
    type: "reward_ad",
    iconEmoji: "🎁",
    title_en: "Daily TON Chest",
    title_tr: "Günlük TON Sandığı",
    desc_en: "Watch a rewarded ad to earn 0.1 TON Credits.",
    desc_tr: "Reklam izle, 0.1 TON Kredisi kazan.",
    reward_text: "+0.1 TON Credits",
  },
  {
    id: "invite_friends",
    type: "invite",
    iconEmoji: "🤝",
    title_en: "Invite Friends",
    title_tr: "Arkadaş Davet Et",
    desc_en: "Invite friends via Telegram and grow together.",
    desc_tr: "Arkadaşlarını Telegram üzerinden davet et, birlikte büyüyün.",
    reward_text: "+2000 coins + 0.02 TON",
  },
  {
    id: "visit_boinker",
    type: "affiliate",
    iconEmoji: "🧠",
    title_en: "Open Boinker",
    title_tr: "Boinker'ı Aç",
    desc_en: "Open Boinker mini-app from Telegram.",
    desc_tr: "Boinker mini-app'i Telegram'da aç.",
    reward_text: "+1000 coins",
    url: "https://t.me/boinker_bot?start=_tgr_TiWlA9A5YWY8",
  },
  {
    id: "visit_dotcoin",
    type: "affiliate",
    iconEmoji: "🟡",
    title_en: "Visit DotCoin",
    title_tr: "DotCoin'i Ziyaret Et",
    desc_en: "Open DotCoin from Telegram.",
    desc_tr: "DotCoin botunu Telegram'da aç.",
    reward_text: "+1000 coins",
    url: "https://t.me/dotcoin_bot",
  },
  {
    id: "visit_bbqcoin",
    type: "affiliate",
    iconEmoji: "🍖",
    title_en: "Visit BBQCoin",
    title_tr: "BBQCoin'i Ziyaret Et",
    desc_en: "Open BBQCoin and check the game.",
    desc_tr: "BBQCoin botunu aç, oyuna göz at.",
    reward_text: "+1000 coins",
    url: "https://t.me/BBQCoin_bot",
  },
];

// task_id -> status ("pending", "checked", "claimed")
const taskStatusMap = {};

// ----------------------------------------------------
// AdsGram init
// ----------------------------------------------------
function initAdsgram() {
  if (!window.Adsgram) {
    console.log("AdsGram SDK yüklenmemiş (sad.min.js).");
    return;
  }
  try {
    AdController = window.Adsgram.init({
      blockId: ADSGRAM_REWARD_BLOCK_ID,
    });
    console.log("AdsGram init OK:", ADSGRAM_REWARD_BLOCK_ID);
  } catch (e) {
    console.error("AdsGram init error:", e);
  }
}

function maybeShowInterstitial() {
  // İleride AdsGram interstitial için ayrıca kullanmak istersen.
  // Şimdilik boş bırakıyoruz veya ileride interstitial blockId ile farklı bir controller kullanılabilir.
}

// Rewarded video göster ve backend'den TON kredisi iste
function showRewardAdAndReward() {
  if (!AdController) {
    alert("Reklam şu anda hazır değil, lütfen daha sonra tekrar dene.");
    return;
  }

  AdController.show()
    .then((result) => {
      console.log("Reward ad result:", result);
      if (result && result.done && !result.error) {
        // Reklam sonuna kadar izlendi → backend'ten ödül iste
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
      console.error("reward/ad failed", await res.text());
      alert("Ödül alınırken hata oluştu.");
      return;
    }
    const data = await res.json();
    if (data.user) {
      userState = data.user;
      renderUser();
    }
    alert("+0.1 TON Credits kazandın!");
  } catch (e) {
    console.error("claimAdRewardFromBackend error:", e);
  }
}

// ----------------------------------------------------
// Dil seçici (eğer index.html'de .lang-chip elemanları varsa)
// ----------------------------------------------------
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

function t(key) {
  const dict = LANG[currentLang] || LANG.en;
  return dict[key] || LANG.en[key] || key;
}

function updateLangUI() {
  const tapBtn = document.getElementById("tap-btn");
  const tasksTitle = document.querySelector(".tasks-title");
  const tasksSubtitle = document.querySelector(".tasks-subtitle");
  const tasksOpenBtn = document.getElementById("open-tasks-btn");

  if (tapBtn) tapBtn.textContent = t("tap");
  if (tasksTitle) tasksTitle.textContent = t("tasks_title");
  if (tasksSubtitle) tasksSubtitle.textContent = t("tasks_sub");
  if (tasksOpenBtn) tasksOpenBtn.textContent = t("tasks_button");

  // User info label'ları (eğer index.html'de text olarak varsa çok bozmadan bırakıyoruz)
  const userInfo = document.getElementById("user-info");
  if (userInfo) {
    // Sadece placeholder; label textlerini orada manuel verdik zaten,
    // istersen burayı daha detaylı manipüle edebiliriz.
  }
}

// ----------------------------------------------------
// User init
// ----------------------------------------------------
async function initUser() {
  // Telegram WebApp içinden user id çek
  if (tg?.initDataUnsafe?.user?.id) {
    userId = tg.initDataUnsafe.user.id;
  } else {
    // Yedek: localStorage random id
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
}

async function fetchUser() {
  if (!userId) return;
  try {
    const res = await fetch(API_BASE + "/api/me?telegram_id=" + userId);
    if (!res.ok) throw new Error("get /api/me failed");
    const data = await res.json();
    userState = data;
    renderUser();
  } catch (e) {
    console.error("fetchUser error:", e);
  }
}

// ----------------------------------------------------
// TAP / UPGRADE
// ----------------------------------------------------
async function tapOnce() {
  if (!userId) return;
  try {
    const res = await fetch(API_BASE + "/api/tap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: userId, taps: 1 }),
    });
    if (!res.ok) {
      console.error("tap failed", await res.text());
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
  } catch (e) {
    console.error("tapOnce error:", e);
    alert("Tap failed, please try again.");
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
  } catch (e) {
    console.error("upgradeTapPower error:", e);
  }
}

// ----------------------------------------------------
// User render
// ----------------------------------------------------
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

// ----------------------------------------------------
// Tasks status (backend)
// ----------------------------------------------------
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
  } catch (e) {
    console.error("fetchTaskStatuses error:", e);
  }
}

// Invite share – Telegram paylaşım ekranı
function openInviteShare() {
  const botLink = "https://t.me/TaptoEarnTonBot";
  const text = encodeURIComponent(t("invite_text"));
  const url = encodeURIComponent(botLink);

  const shareUrl = `https://t.me/share/url?url=${url}&text=${text}`;

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
  } else {
    window.open(shareUrl, "_blank");
  }
}

function openAffiliate(url) {
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, "_blank");
  }
}

// ----------------------------------------------------
// Tasks board render
// ----------------------------------------------------
function renderTasksBoard() {
  const container = document.getElementById("tasks-list");
  if (!container) return;

  container.innerHTML = "";

  TASKS.forEach((task) => {
    const status = taskStatusMap[task.id] || "pending";
    const title =
      currentLang === "tr" ? task.title_tr || task.title_en : task.title_en;
    const desc =
      currentLang === "tr" ? task.desc_tr || task.desc_en : task.desc_en;

    const card = document.createElement("div");
    card.className = "task-card";

    const icon = document.createElement("div");
    icon.className = "task-icon";
    icon.textContent = task.iconEmoji || "⭐";

    const main = document.createElement("div");
    main.className = "task-main";

    const titleEl = document.createElement("p");
    titleEl.className = "task-title";
    titleEl.textContent = title;

    const descEl = document.createElement("p");
    descEl.className = "task-desc";
    descEl.textContent = desc;

    const rewardEl = document.createElement("div");
    rewardEl.className = "task-reward";
    rewardEl.textContent = task.reward_text || "";

    main.appendChild(titleEl);
    main.appendChild(descEl);
    main.appendChild(rewardEl);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    if (task.type === "reward_ad" && task.id === "daily_ton_chest") {
      const btn = document.createElement("button");
      btn.className = "task-cta-btn";
      btn.textContent = "WATCH AD";
      btn.addEventListener("click", () => {
        showRewardAdAndReward();
        // Sonrasında istersen backend task flow'unu da kullanabiliriz:
        // checkTask(task.id) vs. claimTask(task.id)
      });
      actions.appendChild(btn);
    } else if (task.type === "invite") {
      // GO butonu → Telegram share ekranı
      const goBtn = document.createElement("button");
      goBtn.className = "task-cta-btn";
      goBtn.textContent = "GO";
      goBtn.disabled = status === "claimed";
      goBtn.addEventListener("click", () => {
        openInviteShare();
      });
      actions.appendChild(goBtn);

      const checkBtn = document.createElement("button");
      checkBtn.className = "task-cta-btn";
      checkBtn.textContent = "CHECK";
      checkBtn.disabled = status === "claimed";
      checkBtn.addEventListener("click", () => handleTaskClick(task.id, "check"));
      actions.appendChild(checkBtn);

      const claimBtn = document.createElement("button");
      claimBtn.className = "task-cta-btn";
      claimBtn.textContent = "CLAIM";
      claimBtn.disabled = status !== "checked";
      claimBtn.addEventListener("click", () => handleTaskClick(task.id, "claim"));
      actions.appendChild(claimBtn);
    } else if (task.type === "affiliate") {
      const goBtn = document.createElement("button");
      goBtn.className = "task-cta-btn";
      goBtn.textContent = "GO";
      goBtn.disabled = status === "claimed";
      goBtn.addEventListener("click", () => {
        openAffiliate(task.url);
      });
      actions.appendChild(goBtn);

      const checkBtn = document.createElement("button");
      checkBtn.className = "task-cta-btn";
      checkBtn.textContent = "CHECK";
      checkBtn.disabled = status === "claimed";
      checkBtn.addEventListener("click", () => handleTaskClick(task.id, "check"));
      actions.appendChild(checkBtn);

      const claimBtn = document.createElement("button");
      claimBtn.className = "task-cta-btn";
      claimBtn.textContent = "CLAIM";
      claimBtn.disabled = status !== "checked";
      claimBtn.addEventListener("click", () => handleTaskClick(task.id, "claim"));
      actions.appendChild(claimBtn);
    }

    card.appendChild(icon);
    card.appendChild(main);
    card.appendChild(actions);
    container.appendChild(card);
  });
}

// ----------------------------------------------------
// Tasks check/claim (backend)
// ----------------------------------------------------
async function handleTaskClick(taskId, action) {
  if (!userId) return;
  try {
    if (action === "check") {
      const res = await fetch(API_BASE + "/api/tasks/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_id: userId, task_id: taskId }),
      });
      if (!res.ok) throw new Error("checkTask failed");
      const data = await res.json();
      taskStatusMap[taskId] = data.status;
      renderTasksBoard();
      alert("Görev kontrol edildi, şimdi Claim deneyebilirsin.");
    } else if (action === "claim") {
      const res = await fetch(API_BASE + "/api/tasks/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_id: userId, task_id: taskId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.detail === "TASK_NOT_READY") {
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
      alert(
        `Görev tamamlandı, +${data.reward_coins || 0} coin ve +${
          data.reward_ton || 0
        } TON kazandın!`
      );
    }
  } catch (e) {
    console.error("handleTaskClick error:", e);
  }
}

// ----------------------------------------------------
// Leaderboard
// ----------------------------------------------------
async function fetchLeaderboard() {
  try {
    const url =
      API_BASE +
      "/api/leaderboard" +
      (userId ? `?telegram_id=${userId}` : "");
    const res = await fetch(url);
    if (!res.ok) throw new Error("leaderboard failed");
    const data = await res.json();
    renderLeaderboard(data);
  } catch (e) {
    console.error("fetchLeaderboard error:", e);
  }
}

function renderLeaderboard(data) {
  const listEl = document.getElementById("leaderboard-list");
  const myRankEl = document.getElementById("my-rank-label");
  if (!listEl || !data) return;

  listEl.innerHTML = "";

  (data.top || []).forEach((entry) => {
    const row = document.createElement("div");
    row.className = "leaderboard-row";

    const rankSpan = document.createElement("span");
    rankSpan.className = "lb-rank";
    rankSpan.textContent = "#" + entry.rank;

    const idSpan = document.createElement("span");
    idSpan.className = "lb-id";
    idSpan.textContent = String(entry.telegram_id);

    const coinsSpan = document.createElement("span");
    coinsSpan.className = "lb-coins";
    coinsSpan.textContent = entry.total_coins + "💰";

    row.appendChild(rankSpan);
    row.appendChild(idSpan);
    row.appendChild(coinsSpan);

    listEl.appendChild(row);
  });

  if (myRankEl && data.my_rank != null) {
    myRankEl.textContent = t("my_rank_prefix") + data.my_rank;
  }
}

// ----------------------------------------------------
// Modal helpers
// ----------------------------------------------------
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

// ----------------------------------------------------
// DOMContentLoaded
// ----------------------------------------------------
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
  const openTasksBtn = document.getElementById("open-tasks-btn");
  const leaderboardBtn = document.getElementById("open-leaderboard-btn");
  const closeButtons = document.querySelectorAll(".overlay-close");

  if (tapBtn) tapBtn.addEventListener("click", tapOnce);
  if (upgradeBtn) upgradeBtn.addEventListener("click", upgradeTapPower);

  if (openTasksBtn)
    openTasksBtn.addEventListener("click", () => {
      openModal("tasks-modal");
      renderTasksBoard();
    });

  if (leaderboardBtn)
    leaderboardBtn.addEventListener("click", () => {
      openModal("leaderboard-modal");
      fetchLeaderboard();
    });

  closeButtons.forEach((btn) => {
    const target = btn.getAttribute("data-close");
    btn.addEventListener("click", () => closeModal(target));
  });

  initLanguageSelector();
  updateLangUI();
  initUser();
  initAdsgram();
});

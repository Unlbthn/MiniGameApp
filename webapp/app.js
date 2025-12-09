// ===========================
// Telegram WebApp & Globals
// ===========================
const tg = window.Telegram ? window.Telegram.WebApp : null;
const API_BASE = window.location.origin;

let userId = null;
let userState = null;

// tap → reklam sayacı
let tapCounter = 0;
const TAPS_PER_AD = 100;

// ===========================
// Dil metinleri
// ===========================
const LANG = {
  en: {
    level: "Level",
    coins: "Coins",
    tapPower: "Tap Power",
    tonCredits: "TON Credits",
    tap: "TAP",
    upgrade: "Increase Tap Power",
    upgrade_cost_prefix: "Increase Tap Power (cost: ",
    next_level: "Next level",
    daily_tasks_title: "Daily Tasks",
    chest_title: "Daily TON Chest",
    chest_cta: "Open Chest",
    chest_watched: "Chest opened!",
    tasks_btn: "Daily Tasks",
    invite_friends: "Invite Friends",
    copy_link: "Copy",
    copied: "Copied",
    leaderboard_title: "Top 10 Players",
    leaderboard_you: "You",
    leaderboard_empty: "No data yet.",
    error_generic: "Something went wrong.",
    tap_failed: "Tap failed, please try again.",
    not_enough_coins: "Not enough coins.",
    reward_failed: "Chest failed, please try again.",
  },
  tr: {
    level: "Seviye",
    coins: "Coin",
    tapPower: "Vuruş Gücü",
    tonCredits: "TON Kredisi",
    tap: "TIKLA",
    upgrade: "Vuruş Gücünü Artır",
    upgrade_cost_prefix: "Vuruş Gücünü Artır (maliyet: ",
    next_level: "Sonraki seviye",
    daily_tasks_title: "Günlük Görevler",
    chest_title: "Günlük TON Sandığı",
    chest_cta: "Sandığı Aç",
    chest_watched: "Sandık açıldı!",
    tasks_btn: "Günlük Görevler",
    invite_friends: "Arkadaşlarını Davet Et",
    copy_link: "Kopyala",
    copied: "Kopyalandı",
    leaderboard_title: "En İyi 10 Oyuncu",
    leaderboard_you: "Sen",
    leaderboard_empty: "Henüz veri yok.",
    error_generic: "Bir şeyler ters gitti.",
    tap_failed: "Tıklama başarısız, tekrar dene.",
    not_enough_coins: "Yetersiz coin.",
    reward_failed: "Sandık açılamadı, tekrar dene.",
  },
};

let currentLang = localStorage.getItem("tap_lang") || "en";

// ===========================
// AdsGram
// ===========================
let AdControllerReward = null;
let AdControllerInterstitial = null;

// Block ID'ler (senin AdsGram panelindeki)
const ADSGRAM_REWARD_BLOCK_ID = "17996";
const ADSGRAM_INTERSTITIAL_BLOCK_ID = "int-17995";

function initAdsgram() {
  if (!window.Adsgram) {
    console.log("AdsGram SDK bulunamadı (sad.min.js yüklü mü?)");
    return;
  }

  try {
    AdControllerReward = window.Adsgram.init({
      blockId: ADSGRAM_REWARD_BLOCK_ID,
    });
    AdControllerInterstitial = window.Adsgram.init({
      blockId: ADSGRAM_INTERSTITIAL_BLOCK_ID,
    });
    console.log("AdsGram init OK");
  } catch (e) {
    console.error("AdsGram init error:", e);
  }
}

function showInterstitialIfNeeded() {
  if (!AdControllerInterstitial) return;
  if (tapCounter < TAPS_PER_AD) return;

  tapCounter = 0;
  AdControllerInterstitial.show().catch((err) =>
    console.error("Interstitial error:", err)
  );
}

/**
 * Rewarded video gösterir, izlenirse onDone() çağırır.
 */
function showRewardAd(onDone) {
  if (!AdControllerReward) {
    alert("Reklam şu anda hazır değil.");
    return;
  }

  AdControllerReward.show()
    .then((result) => {
      console.log("Reward ad result:", result);
      if (result && result.done && !result.error) {
        if (typeof onDone === "function") onDone();
      } else {
        alert("Ödül için reklamı tamamen izlemen gerekiyor.");
      }
    })
    .catch((err) => {
      console.error("Reward ad error:", err);
      alert("Reklam oynatılırken hata oluştu.");
    });
}

// ===========================
// User init & API helpers
// ===========================
async function initUser() {
  // Telegram ID
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

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error("GET " + path + " failed");
  return res.json();
}

async function apiPost(path, payload) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.detail || LANG[currentLang].error_generic;
    throw new Error(msg);
  }
  return data;
}

async function fetchUser() {
  if (!userId) return;
  try {
    const data = await apiGet(`/api/me?telegram_id=${userId}`);
    userState = data;
    renderUser();
  } catch (e) {
    console.error("fetchUser error:", e);
  }
}

// ===========================
// Rendering helpers
// ===========================
function $(selector) {
  return document.querySelector(selector);
}

function renderUser() {
  if (!userState) return;
  const t = LANG[currentLang];

  const levelEl = $("#level-value");
  const coinsEl = $("#coins-value");
  const tapPowerEl = $("#tap-power-value");
  const tonCreditsEl = $("#ton-credits-value");
  const nextLevelLabel = $("#next-level-label");
  const nextLevelBar = $("#next-level-bar");

  if (levelEl) levelEl.textContent = userState.level ?? 1;
  if (coinsEl) coinsEl.textContent = userState.coins ?? 0;
  if (tapPowerEl) tapPowerEl.textContent = userState.tap_power ?? 1;
  if (tonCreditsEl)
    tonCreditsEl.textContent = (userState.ton_credits ?? 0).toFixed(2);

  // Level progress (backend'den geliyorsa)
  const currentXp = userState.current_xp ?? 0;
  const nextXp = userState.next_level_xp ?? 1000;
  if (nextLevelLabel) {
    nextLevelLabel.textContent = `${t.next_level}: ${currentXp} / ${nextXp}`;
  }
  if (nextLevelBar) {
    const pct = Math.max(0, Math.min(100, (currentXp / nextXp) * 100));
    nextLevelBar.style.width = pct + "%";
  }

  updateTexts();
}

// ===========================
// Dil
// ===========================
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
      renderUser();
    });
  });
}

function updateTexts() {
  const t = LANG[currentLang];

  const tapBtn = $("#tap-btn");
  const upgradeTitle = $("#upgrade-title");
  const upgradeBtn = $("#upgrade-btn");
  const tasksBtn = $("#tasks-open-btn");
  const chestBtn = $("#chest-btn");
  const tasksTitle = $("#tasks-title");
  const inviteTitle = $("#invite-title");
  const copyBtn = $("#invite-copy-btn");
  const leaderboardTitle = $("#leaderboard-title");

  const cost = getUpgradeCost();

  if (tapBtn) tapBtn.textContent = t.tap;
  if (upgradeTitle) upgradeTitle.textContent = t.upgrade;
  if (upgradeBtn)
    upgradeBtn.textContent = `${t.upgrade_cost_prefix}${cost} coins)`;
  if (tasksBtn) tasksBtn.textContent = t.tasks_btn;
  if (chestBtn) chestBtn.textContent = t.chest_cta;
  if (tasksTitle) tasksTitle.textContent = t.daily_tasks_title;
  if (inviteTitle) inviteTitle.textContent = t.invite_friends;
  if (copyBtn) copyBtn.textContent = t.copy_link;
  if (leaderboardTitle) leaderboardTitle.textContent = t.leaderboard_title;

  const tonLabel = $("#ton-label");
  if (tonLabel) tonLabel.textContent = t.tonCredits;
}

// ===========================
// Tap & Upgrade
// ===========================
function getUpgradeCost() {
  if (!userState || typeof userState.tap_power !== "number") return 100;
  return userState.tap_power * 100;
}

async function handleTap() {
  if (!userId) return;
  try {
    const data = await apiPost("/api/tap", {
      telegram_id: userId,
      taps: 1,
    });
    if (data.user) {
      userState = data.user;
      renderUser();
    }
    tapCounter += 1;
    showInterstitialIfNeeded();
  } catch (e) {
    console.error("tap error:", e);
    alert(LANG[currentLang].tap_failed);
  }
}

async function handleUpgrade() {
  if (!userId) return;
  try {
    const data = await apiPost("/api/upgrade/tap_power", {
      telegram_id: userId,
    });
    if (data.user) {
      userState = data.user;
      renderUser();
    }
  } catch (e) {
    console.error("upgrade error:", e);
    alert(e.message || LANG[currentLang].not_enough_coins);
  }
}

// ===========================
// Daily TON Chest (rewarded ad)
// ===========================
async function openDailyChest() {
  if (!userId) return;

  showRewardAd(async () => {
    try {
      const data = await apiPost("/api/reward/ad", {
        telegram_id: userId,
      });
      if (data.user) {
        userState = data.user;
        renderUser();
      }
      alert(LANG[currentLang].chest_watched);
    } catch (e) {
      console.error("chest reward error:", e);
      alert(LANG[currentLang].reward_failed);
    }
  });
}

// ===========================
// Daily Tasks (basit versiyon)
// ===========================
function openTasksModal() {
  const modal = $("#tasks-modal");
  if (modal) modal.classList.remove("hidden");
}

function closeTasksModal() {
  const modal = $("#tasks-modal");
  if (modal) modal.classList.add("hidden");
}

// Invite Friends task
function openInviteShare() {
  if (!userId) return;

  const startParam = `ref_${userId}`;
  const botUsername = "TaptoEarnTonBot"; // kendi bot username'in
  const url = `https://t.me/${botUsername}?start=${startParam}`;
  const text =
    currentLang === "tr"
      ? "TON kazanmak için bu oyuna katıl! 👇"
      : "Join this TON tap game and start earning! 👇";

  const shareLink =
    "https://t.me/share/url?url=" +
    encodeURIComponent(url) +
    "&text=" +
    encodeURIComponent(text);

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(shareLink);
  } else {
    window.open(shareLink, "_blank");
  }
}

function copyInviteLink() {
  if (!userId) return;
  const botUsername = "TaptoEarnTonBot";
  const url = `https://t.me/${botUsername}?start=ref_${userId}`;
  navigator.clipboard
    .writeText(url)
    .then(() => alert(LANG[currentLang].copied))
    .catch(() => alert(url));
}

// ===========================
// Leaderboard
// ===========================
async function openLeaderboard() {
  if (!userId) return;

  try {
    const data = await apiGet(`/api/leaderboard?telegram_id=${userId}`);
    const list = $("#leaderboard-list");
    const meRow = $("#leaderboard-me");
    if (!list || !meRow) return;

    list.innerHTML = "";

    if (!data.top || data.top.length === 0) {
      list.innerHTML = `<li class="lb-empty">${LANG[currentLang].leaderboard_empty}</li>`;
    } else {
      data.top.forEach((item) => {
        const li = document.createElement("li");
        li.className = "lb-item";
        li.innerHTML = `
          <span class="lb-rank">#${item.rank}</span>
          <span class="lb-name">${item.username || "User " + item.rank}</span>
          <span class="lb-coins">${item.total_coins ?? item.coins ?? 0}</span>
        `;
        list.appendChild(li);
      });
    }

    if (data.me) {
      meRow.innerHTML = `
        <span class="lb-rank">#${data.me.rank}</span>
        <span class="lb-name">${LANG[currentLang].leaderboard_you}</span>
        <span class="lb-coins">${data.me.total_coins ?? 0}</span>
      `;
    }

    const modal = $("#leaderboard-modal");
    if (modal) modal.classList.remove("hidden");
  } catch (e) {
    console.error("leaderboard error:", e);
    alert(LANG[currentLang].error_generic);
  }
}

function closeLeaderboard() {
  const modal = $("#leaderboard-modal");
  if (modal) modal.classList.add("hidden");
}

// ===========================
// TON Wallet (şimdilik placeholder)
// ===========================
function openWallet() {
  alert(
    currentLang === "tr"
      ? "TON cüzdan entegrasyonu yakında eklenecek."
      : "TON wallet integration is coming soon."
  );
}

// ===========================
// DOMContentLoaded
// ===========================
document.addEventListener("DOMContentLoaded", () => {
  if (tg) {
    try {
      tg.expand();
    } catch (e) {
      console.log("Telegram expand error:", e);
    }
  }

  // butonlar
  const tapBtn = $("#tap-btn");
  const upgradeBtn = $("#upgrade-btn");
  const chestBtn = $("#chest-btn");
  const tasksBtn = $("#tasks-open-btn");
  const tasksClose = $("#tasks-close-btn");
  const inviteGoBtn = $("#invite-go-btn");
  const inviteCopyBtn = $("#invite-copy-btn");
  const walletIcon = $("#wallet-icon");
  const trophyIcon = $("#trophy-icon");
  const lbCloseBtn = $("#leaderboard-close-btn");

  if (tapBtn) tapBtn.addEventListener("click", handleTap);
  if (upgradeBtn) upgradeBtn.addEventListener("click", handleUpgrade);
  if (chestBtn) chestBtn.addEventListener("click", openDailyChest);
  if (tasksBtn) tasksBtn.addEventListener("click", openTasksModal);
  if (tasksClose) tasksClose.addEventListener("click", closeTasksModal);
  if (inviteGoBtn) inviteGoBtn.addEventListener("click", openInviteShare);
  if (inviteCopyBtn) inviteCopyBtn.addEventListener("click", copyInviteLink);
  if (walletIcon) walletIcon.addEventListener("click", openWallet);
  if (trophyIcon) trophyIcon.addEventListener("click", openLeaderboard);
  if (lbCloseBtn) lbCloseBtn.addEventListener("click", closeLeaderboard);

  initLanguageSelector();
  updateTexts();
  initUser();
  initAdsgram();
});

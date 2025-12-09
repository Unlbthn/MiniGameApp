// webapp/app.js
// Tap to Earn TON – front-end (Telegram Mini App)

"use strict";

/* -------------------- Telegram / globals -------------------- */

const tg = window.Telegram ? window.Telegram.WebApp : null;
const API_BASE = window.location.origin;

let userId = null;
let userState = null;
let currentLang = localStorage.getItem("tap_lang") || "en";

// tap → interstitial ad
let tapCounter = 0;
const TAPS_PER_AD = 100;

// AdsGram controllers
let adsInterstitial = null;
let adsReward = null;
// IDs you created in AdsGram
const INTERSTITIAL_BLOCK_ID = "int-17995";
const REWARD_BLOCK_ID = "17996";

/* -------------------- i18n -------------------- */

const LANG = {
  en: {
    coins: "Coins",
    tapPower: "Tap Power",
    tonCredits: "TON Credits",
    level: "Level",
    nextLevel: "Next level",
    tap: "TAP",
    upgradeBtn: "Increase Tap Power (cost: {cost} coins)",
    dailyChest: "Daily TON Chest",
    dailyTasks: "Daily Tasks",
    inviteFriends: "Invite Friends",
    chestTitle: "Daily TON Chest",
    chestDesc: "Watch an ad and get 0.01 TON.",
    chestOpened: "Chest opened! +0.01 TON",
    chestFailed: "Chest failed. Please watch the ad to the end.",
    tapFailed: "Tap failed, please try again.",
    upgradeFailed: "You don’t have enough coins.",
    genericError: "Something went wrong, please try again.",
    leaderboardTitle: "Top 10 Players",
    yourRank: "Your position",
    copy: "Copy",
    copied: "Copied!",
    shareText:
      "Join Tap to Earn TON! Tap, complete tasks and earn TON: https://t.me/TaptoEarnTonBot/app",
  },
  tr: {
    coins: "Coin",
    tapPower: "Vuruş Gücü",
    tonCredits: "TON Kredisi",
    level: "Seviye",
    nextLevel: "Sonraki seviye",
    tap: "TIKLA",
    upgradeBtn: "Vuruş gücünü arttır (maliyet: {cost} coin)",
    dailyChest: "Günlük TON Sandığı",
    dailyTasks: "Günlük Görevler",
    inviteFriends: "Arkadaşlarını Davet Et",
    chestTitle: "Günlük TON Sandığı",
    chestDesc: "Reklam izle ve 0.01 TON kazan.",
    chestOpened: "Sandık açıldı! +0.01 TON",
    chestFailed: "Sandık başarısız. Reklamı sonuna kadar izlemelisin.",
    tapFailed: "Tık başarısız, lütfen tekrar dene.",
    upgradeFailed: "Yeterli coinin yok.",
    genericError: "Bir hata oluştu, lütfen tekrar dene.",
    leaderboardTitle: "İlk 10 Oyuncu",
    yourRank: "Sıran",
    copy: "Kopyala",
    copied: "Kopyalandı!",
    shareText:
      "Tap to Earn TON oyununa katıl! Tıkla, görevleri yap ve TON kazan: https://t.me/TaptoEarnTonBot/app",
  },
};

function t(key, vars = {}) {
  const dict = LANG[currentLang] || LANG.en;
  let str = dict[key] || LANG.en[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}

/* -------------------- helpers -------------------- */

function $(id) {
  return document.getElementById(id);
}

function safeAddListener(el, evt, fn) {
  if (el) el.addEventListener(evt, fn);
}

function showAlert(msg) {
  if (tg && tg.showAlert) tg.showAlert(msg);
  else alert(msg);
}

/* -------------------- AdsGram -------------------- */

function initAdsgram() {
  if (!window.Adsgram) {
    console.log("AdsGram SDK not found.");
    return;
  }
  try {
    adsInterstitial = window.Adsgram.init({
      blockId: INTERSTITIAL_BLOCK_ID,
    });
  } catch (e) {
    console.error("AdsGram interstitial init error:", e);
  }

  try {
    adsReward = window.Adsgram.init({
      blockId: REWARD_BLOCK_ID,
    });
  } catch (e) {
    console.error("AdsGram reward init error:", e);
  }
}

function maybeShowTapAd() {
  if (!adsInterstitial) return;
  if (!userId) return;

  adsInterstitial
    .show({ userId: String(userId) })
    .then((res) => console.log("Interstitial result:", res))
    .catch((err) => console.error("Interstitial error:", err));
}

function showRewardAd(onDone) {
  if (!adsReward) {
    showAlert("Ad is not ready yet, please try later.");
    return;
  }
  if (!userId) return;

  adsReward
    .show({ userId: String(userId) })
    .then((result) => {
      console.log("Reward ad result:", result);
      if (typeof onDone === "function") onDone(result);
    })
    .catch((err) => {
      console.error("Reward ad error:", err);
      showAlert(t("genericError"));
    });
}

/* -------------------- API calls -------------------- */

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    console.error("API error:", url, res.status, text);
    throw new Error("API_ERROR");
  }
  return res.json();
}

async function apiGetMe() {
  if (!userId) return null;
  return fetchJSON(`${API_BASE}/api/me?telegram_id=${userId}`);
}

async function apiTap(count = 1) {
  if (!userId) return null;
  return fetchJSON(`${API_BASE}/api/tap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegram_id: userId, taps: count }),
  });
}

async function apiUpgradeTapPower() {
  if (!userId) return null;
  return fetchJSON(`${API_BASE}/api/upgrade/tap_power`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegram_id: userId }),
  });
}

async function apiRewardAd(kind) {
  if (!userId) return null;
  return fetchJSON(`${API_BASE}/api/reward/ad`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegram_id: userId, kind }),
  });
}

async function apiGetLeaderboard() {
  if (!userId) return null;
  return fetchJSON(
    `${API_BASE}/api/leaderboard?limit=10&telegram_id=${userId}`
  );
}

/* -------------------- state + render -------------------- */

function getUpgradeCost() {
  if (!userState) return 100;
  const base = userState.tap_power || 1;
  return base * 100;
}

function renderUser() {
  if (!userState) return;

  const lvlEl = $("level-value");
  const coinsEl = $("coins-value");
  const powerEl = $("tap-power-value");
  const tonEl = $("ton-credits-value");
  const nextLabel = $("next-level-label");
  const progressBar = $("level-progress-fill");

  if (lvlEl) lvlEl.textContent = userState.level ?? 1;
  if (coinsEl) coinsEl.textContent = userState.coins ?? 0;
  if (powerEl) powerEl.textContent = userState.tap_power ?? 1;
  if (tonEl)
    tonEl.textContent = (userState.ton_credits ?? 0).toFixed(2);

  const currXp =
    userState.level_xp ?? userState.xp ?? userState.current_xp ?? 0;
  const nextXp =
    userState.next_level_xp ??
    (userState.level ? userState.level * 1000 : 1000);

  if (nextLabel)
    nextLabel.textContent = `${t("nextLevel")}: ${currXp} / ${nextXp}`;

  if (progressBar) {
    const pct = Math.max(
      0,
      Math.min(100, nextXp > 0 ? Math.floor((currXp / nextXp) * 100) : 0)
    );
    progressBar.style.width = `${pct}%`;
  }

  // update texts depending on language
  updateLangUI();
}

function updateLangUI() {
  const langBtns = document.querySelectorAll("[data-lang]");
  langBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });

  const coinsLabel = $("label-coins");
  const powerLabel = $("label-tap-power");
  const tonLabel = $("label-ton-credits");
  const levelLabel = $("label-level");
  const tapBtn = $("tap-btn");
  const upgradeBtn = $("upgrade-btn");
  const chestBtn = $("daily-chest-btn");
  const tasksBtn = $("daily-tasks-btn");
  const inviteTitle = $("invite-title");
  const chestTitle = $("chest-title");
  const chestDesc = $("chest-desc");
  const leaderboardTitle = $("leaderboard-title");

  if (coinsLabel) coinsLabel.textContent = t("coins");
  if (powerLabel) powerLabel.textContent = t("tapPower");
  if (tonLabel) tonLabel.textContent = t("tonCredits");
  if (levelLabel) levelLabel.textContent = t("level");
  if (tapBtn) tapBtn.textContent = t("tap");

  const cost = getUpgradeCost();
  if (upgradeBtn) upgradeBtn.textContent = t("upgradeBtn", { cost });

  if (chestBtn) chestBtn.textContent = t("dailyChest");
  if (tasksBtn) tasksBtn.textContent = t("dailyTasks");
  if (inviteTitle) inviteTitle.textContent = t("inviteFriends");
  if (chestTitle) chestTitle.textContent = t("chestTitle");
  if (chestDesc) chestDesc.textContent = t("chestDesc");
  if (leaderboardTitle) leaderboardTitle.textContent = t("leaderboardTitle");
}

/* -------------------- actions -------------------- */

async function handleTap() {
  if (!userId) return;
  try {
    const data = await apiTap(1);
    if (data && data.user) {
      userState = data.user;
      renderUser();
    }
    tapCounter += 1;
    if (tapCounter >= TAPS_PER_AD) {
      tapCounter = 0;
      maybeShowTapAd();
    }
  } catch (err) {
    console.error("tap error:", err);
    showAlert(t("tapFailed"));
  }
}

async function handleUpgrade() {
  if (!userId) return;
  try {
    const data = await apiUpgradeTapPower();
    if (data && data.user) {
      userState = data.user;
      renderUser();
    }
  } catch (err) {
    console.error("upgrade error:", err);
    showAlert(t("upgradeFailed"));
  }
}

function openDailyChest() {
  showRewardAd(async (result) => {
    if (!result || result.error || !result.done) {
      showAlert(t("chestFailed"));
      return;
    }
    try {
      const data = await apiRewardAd("chest");
      if (data && data.user) {
        userState = data.user;
        renderUser();
      }
      showAlert(t("chestOpened"));
    } catch (err) {
      console.error("reward api error:", err);
      showAlert(t("genericError"));
    }
  });
}

function openTasks() {
  const modal = $("tasks-modal");
  if (modal) modal.classList.add("open");
}

function closeTasks() {
  const modal = $("tasks-modal");
  if (modal) modal.classList.remove("open");
}

async function openLeaderboard() {
  const modal = $("leaderboard-modal");
  const listEl = $("leaderboard-list");
  const yourRankEl = $("leaderboard-your-rank");

  if (!modal || !listEl || !yourRankEl) return;

  listEl.innerHTML = "";
  yourRankEl.textContent = "...";

  modal.classList.add("open");

  try {
    const data = await apiGetLeaderboard();
    const top = data.top || [];
    const userInfo = data.user || {};

    top.forEach((row) => {
      const li = document.createElement("li");
      const name =
        row.username || row.first_name || `User ${row.telegram_id}`;
      const coins = row.total_coins ?? row.coins ?? 0;
      const rank = row.rank ?? "?";
      li.textContent = `#${rank} – ${name} – ${coins} ${t("coins")}`;
      listEl.appendChild(li);
    });

    if (userInfo.rank != null) {
      yourRankEl.textContent = `${t("yourRank")}: #${userInfo.rank}`;
    } else if (userState && userState.total_coins != null) {
      yourRankEl.textContent = `${t("yourRank")}: ${userState.total_coins} ${t(
        "coins"
      )}`;
    }
  } catch (err) {
    console.error("leaderboard error:", err);
    yourRankEl.textContent = t("genericError");
  }
}

function closeLeaderboard() {
  const modal = $("leaderboard-modal");
  if (modal) modal.classList.remove("open");
}

function handleInviteGo() {
  const text = t("shareText");
  const url = "https://t.me/TaptoEarnTonBot/app";

  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(
      `https://t.me/share/url?url=${encodeURIComponent(
        url
      )}&text=${encodeURIComponent(text)}`
    );
  } else {
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(
      url
    )}&text=${encodeURIComponent(text)}`;
    window.open(shareUrl, "_blank");
  }
}

/* -------------------- language + init user -------------------- */

function initLanguageSelector() {
  document.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.dataset.lang;
      if (!LANG[lang]) return;
      currentLang = lang;
      localStorage.setItem("tap_lang", lang);
      updateLangUI();
    });
  });
}

function initUserId() {
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
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
}

async function loadUser() {
  try {
    const data = await apiGetMe();
    if (data) {
      userState = data;
      renderUser();
    }
  } catch (err) {
    console.error("get /api/me error:", err);
  }
}

/* -------------------- TON wallet badge (only UI) -------------------- */

function initWalletBadge() {
  const walletBadge = $("wallet-badge");
  if (!walletBadge) return;

  walletBadge.addEventListener("click", () => {
    // Sadece Telegram TON cüzdanını açmaya çalışıyoruz
    if (tg && tg.openTelegramLink) {
      tg.openTelegramLink("https://t.me/wallet");
    } else {
      window.open("https://t.me/wallet", "_blank");
    }
  });
}

/* -------------------- DOMContentLoaded -------------------- */

document.addEventListener("DOMContentLoaded", () => {
  if (tg) {
    try {
      tg.expand();
    } catch (e) {
      console.log("Telegram expand error:", e);
    }
  }

  initUserId();
  initLanguageSelector();
  initWalletBadge();
  initAdsgram();

  // buttons
  safeAddListener($("tap-btn"), "click", handleTap);
  safeAddListener($("upgrade-btn"), "click", handleUpgrade);
  safeAddListener($("daily-chest-btn"), "click", openDailyChest);
  safeAddListener($("daily-tasks-btn"), "click", openTasks);
  safeAddListener($("tasks-close-btn"), "click", closeTasks);
  safeAddListener($("leaderboard-btn"), "click", openLeaderboard);
  safeAddListener($("leaderboard-close-btn"), "click", closeLeaderboard);
  safeAddListener($("invite-go-btn"), "click", handleInviteGo);

  updateLangUI();
  loadUser();
});

// ------------------------------------------------------------
// Telegram WebApp Init
// ------------------------------------------------------------
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
}

// ------------------------------------------------------------
// Language Texts
// ------------------------------------------------------------
const LANG = {
    en: {
        tap: "TAP",
        daily_chest: "Daily TON Chest",
        daily_tasks: "Daily Tasks",
        invite: "Invite Friends",
        upgrade: "Upgrade",
        coins: "Coins",
        power: "Tap Power",
        ton: "TON Credits",
        leaderboard: "Top 10 Players",
        share_msg: "Join Tap to Earn TON and get rewards!",
    },
    tr: {
        tap: "TIKLA",
        daily_chest: "Günlük TON Sandığı",
        daily_tasks: "Günlük Görevler",
        invite: "Arkadaş Davet Et",
        upgrade: "Yükselt",
        coins: "Coin",
        power: "Vuruş Gücü",
        ton: "TON Kredisi",
        leaderboard: "En İyi 10 Oyuncu",
        share_msg: "Tap to Earn TON'a katıl, ödülleri kazan!",
    }
};

let currentLang = localStorage.getItem("lang") || "en";

// ------------------------------------------------------------
// API BASE
// ------------------------------------------------------------
const API = window.location.origin;

// ------------------------------------------------------------
// USER STATE
// ------------------------------------------------------------
let userId = null;
let userState = null;

// ------------------------------------------------------------
// INITIAL LOAD
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    initLanguageButtons();
    initButtons();
    initUser();
    initAdsGram();
});

// ------------------------------------------------------------
// LANGUAGE SYSTEM
// ------------------------------------------------------------
function initLanguageButtons() {
    document.querySelectorAll(".lang-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            currentLang = btn.dataset.lang;
            localStorage.setItem("lang", currentLang);
            applyLang();
        });
    });
}

function applyLang() {
    const t = LANG[currentLang];
    document.querySelector("#tap-btn").textContent = t.tap;
    document.querySelector("#daily-chest-btn").textContent = t.daily_chest;
    document.querySelector("#daily-tasks-btn").textContent = t.daily_tasks;
    document.querySelector("#invite-btn").textContent = t.invite;
    document.querySelector("#upgrade-btn").textContent = t.upgrade;
}

// ------------------------------------------------------------
// FETCH USER
// ------------------------------------------------------------
async function initUser() {
    if (tg?.initDataUnsafe?.user?.id) {
        userId = tg.initDataUnsafe.user.id;
    } else {
        userId = Number(localStorage.getItem("anon_id")) || Math.floor(Math.random() * 99999999);
        localStorage.setItem("anon_id", userId);
    }

    const res = await fetch(`${API}/api/me?telegram_id=${userId}`);
    userState = await res.json();

    renderUser();
    applyLang();
}

// ------------------------------------------------------------
// RENDER USER INFO
// ------------------------------------------------------------
function renderUser() {
    document.querySelector("#level").textContent = userState.level;
    document.querySelector("#coins").textContent = userState.coins;
    document.querySelector("#power").textContent = userState.tap_power;
    document.querySelector("#ton").textContent = userState.ton_credits.toFixed(2);

    updateProgressBar();
}

// XP Progress Bar
function updateProgressBar() {
    const bar = document.querySelector("#xp-bar-inner");
    const pct = (userState.xp / userState.next_level_xp) * 100;
    bar.style.width = pct + "%";
}

// ------------------------------------------------------------
// TAP LOGIC + ADSGRAM INTERSTITIAL
// ------------------------------------------------------------
let tapCount = 0;
let AdController = null;

function initAdsGram() {
    try {
        AdController = window.Adsgram.init({ blockId: "int-17995" });
    } catch (e) {
        console.log("AdsGram init failed", e);
    }
}

async function tapOnce() {
  if (!userId) return;

  try {
    // backend query param beklediği için URL'e ekliyoruz
    const url =
      API_BASE +
      `/api/tap?telegram_id=${encodeURIComponent(userId)}&taps=1`;

    const res = await fetch(url, {
      method: "POST",
    });

    if (!res.ok) {
      // Hata detayını konsola yaz (debug için)
      try {
        const errData = await res.json();
        console.error("tap error:", errData);
      } catch (e) {
        console.error("tap error (no json):", e);
      }
      alert("Tap failed, please try again.");
      return;
    }

    const data = await res.json();

    if (data.user) {
      userState = data.user;
      renderUser();
    }

    // Reklam sayacı (mevcut mantığın devamı)
    tapCounter += 1;
    if (tapCounter >= TAPS_PER_AD) {
      tapCounter = 0;
      maybeShowInterstitial();
    }
  } catch (err) {
    console.error("tapOnce error:", err);
    alert("Tap failed, please try again.");
  }
}

document.querySelector("#tap-btn").addEventListener("click", async () => {
    const res = await fetch(`${API}/api/tap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_id: userId, taps: 1 })
    });

    if (!res.ok) {
        alert("Tap failed, try again.");
        return;
    }

    const data = await res.json();
    userState = data.user;
    renderUser();

    tapCount++;
    if (tapCount >= 100 && AdController) {
        tapCount = 0;
        AdController.show();
    }
});

// ------------------------------------------------------------
// DAILY TON CHEST
// ------------------------------------------------------------
document.querySelector("#daily-chest-btn").addEventListener("click", async () => {
    const rewardAd = window.Adsgram.init({ blockId: "17996" });

    rewardAd.show().then(async result => {
        if (!result.done) return alert("Reklam tamamlanmadı.");

        const res = await fetch(`${API}/api/reward/ad`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ telegram_id: userId })
        });

        const data = await res.json();

        if (data.detail === "DAILY_LIMIT_REACHED") {
            return alert("Günlük reklam limitine ulaştın (10/10)");
        }

        userState = data.user;
        renderUser();
        alert("0.01 TON kazandın!");
    });
});

// ------------------------------------------------------------
// UPGRADE
// ------------------------------------------------------------
document.querySelector("#upgrade-btn").addEventListener("click", async () => {
    const res = await fetch(`${API}/api/upgrade/tap_power`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_id: userId })
    });

    if (!res.ok) return alert("Not enough coins!");

    const data = await res.json();
    userState = data.user;
    renderUser();
});

// ------------------------------------------------------------
// INVITE FRIENDS — native telegram share
// ------------------------------------------------------------
document.querySelector("#invite-btn").addEventListener("click", () => {
    const t = LANG[currentLang];
    const text = t.share_msg;
    const link = `https://t.me/TaptoEarnTonBot?start=${userId}`;

    if (tg?.openTelegramLink) tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
});

// ------------------------------------------------------------
// LEADERBOARD
// ------------------------------------------------------------
document.querySelector("#leaderboard-btn").addEventListener("click", async () => {
    const res = await fetch(`${API}/api/leaderboard?telegram_id=${userId}`);
    const data = await res.json();

    const list = document.querySelector("#leaderboard-list");
    list.innerHTML = "";

    data.top10.forEach((u, i) => {
        const row = document.createElement("div");
        row.className = "lb-row";
        row.innerHTML = `<span>#${i + 1}</span> <span>ID: ${u.telegram_id}</span> <span>${u.total_coins}</span>`;
        list.appendChild(row);
    });

    document.querySelector("#user-rank").textContent = `Your Rank: ${data.user_rank}`;

    document.querySelector("#leaderboard-modal").classList.remove("hidden");
});

document.querySelectorAll(".close-modal").forEach(btn =>
    btn.addEventListener("click", () => {
        document.querySelectorAll(".modal").forEach(m => m.classList.add("hidden"));
    })
);

// ------------------------------------------------------------
// END OF FILE
// ------------------------------------------------------------

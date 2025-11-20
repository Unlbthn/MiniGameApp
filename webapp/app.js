// Telegram WebApp objesi (varsa)
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
    daily_sub: "Complete tasks to earn extra coins.",
  },
  tr: {
    tap: "TIKLA",
    upgrade_title: "Yükselt",
    upgrade_btn_prefix: "Vuruş Gücünü Artır (maliyet: ",
    wallet_title: "TON Cüzdan",
    buy_ton: "TON ile coin satın al (beta)",
    daily_tasks: "Günlük Görevler",
    daily_sub: "Ek coin kazanmak için görevleri tamamla.",
  },
};

let currentLang = localStorage.getItem("tap_lang") || "en";

let userId = null;
let userState = null;

// Backend ile aynı origin üzerinden konuşuyoruz
const API_BASE = window.location.origin;

// ---------------------------
// AdsGram: Reward + Interstitial
// ---------------------------

// Tap sayacı → belli sayıda tap'te bir interstitial tetiklemek için
let tapCounter = 0;
const TAPS_PER_AD = 50; // 50 tap'te bir reklam dene

// Minimum süre kontrolü
let lastAdTime = 0;
const AD_INTERVAL_MS = 60_000; // 1 dakika

// AdsGram controller
let AdController = null;

// AdsGram blockId / PlatformID
const ADSGRAM_BLOCK_ID = "16514";

function initAdsgram() {
  if (window.Adsgram && !AdController) {
    try {
      AdController = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
      console.log("AdsGram SDK init edildi, blockId:", ADSGRAM_BLOCK_ID);
    } catch (err) {
      console.error("AdsGram init hatası:", err);
    }
  } else if (!window.Adsgram) {
    console.log("AdsGram SDK bulunamadı. sad.min.js script'i yüklü mü?");
  }
}

// Interstitial reklam (otomatik, ödülsüz)
function maybeShowInterstitial() {
  if (!AdController) return;

  const now = Date.now();
  if (now - lastAdTime < AD_INTERVAL_MS) {
    return;
  }

  lastAdTime = now;

  AdController.show()
    .then((result) => {
      console.log("Interstitial gösterildi:", result);
    })
    .catch((err) => {
      console.error("Interstitial gösterilemedi:", err);
    });
}

// Rewarded reklam
function showRewardAd() {
  if (!AdController) {
    alert("Reklam şu anda hazır değil.");
    return;
  }

  AdController.show()
    .then((result) => {
      console.log("Reward ad sonucu:", result);

      if (result && result.done && !result.error) {
        giveRewardCoins();
      } else {
        alert("Ödül kazanmak için reklamı sonuna kadar izlemen gerekiyor.");
      }
    })
    .catch((err) => {
      console.error("Reward ad hatası:", err);
      alert("Reklam oynatılırken bir hata oluştu.");
    });
}

// Şimdilik ödülü local state üzerinde veriyoruz
function giveRewardCoins() {
  if (!userState) return;
  const rewardAmount = 500;

  userState.coins += rewardAmount;
  if (typeof userState.total_coins === "number") {
    userState.total_coins += rewardAmount;
  }

  renderUser();
  alert(`+${rewardAmount} coin kazandın! 🎉`);
}

// AdsGram Task format hook
function showAdsgramTask() {
  if (!window.Adsgram) {
    alert("AdsGram not available right now.");
    return;
  }

  // Gerçek Task entegrasyon kodu buraya gelecek
  alert(
    "Task ad integration placeholder.\nLütfen AdsGram Task dokümanındaki gerçek kodu showAdsgramTask() içine ekle."
  );
}

// ---------------------------
// Daily Tasks Config
// ---------------------------

const TASKS = [
  {
    id: "reward_1",
    type: "reward",
    iconType: "reward",
    iconEmoji: "🎬",
    title: "Watch a Reward Ad",
    description: "Watch 1 full ad and get bonus coins.",
    rewardText: "+500 coins",
    actionText: "WATCH",
  },
  {
    id: "adsgram_task_1",
    type: "adsgram_task",
    iconType: "task",
    iconEmoji: "📲",
    title: "Complete AdsGram Task",
    description: "Finish a sponsor task to earn a big bonus.",
    rewardText: "+1000 coins",
    actionText: "START",
  },
  {
    id: "affiliate_boinker",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🧠",
    title: "Open Boinker Mini-App",
    description: "Open Boinker from Telegram and explore.",
    rewardText: "+800 coins (manual)",
    actionText: "OPEN",
    url: "https://t.me/boinker_bot?start=_tgr_TiWlA9A5YWY8",
  },
  {
    id: "affiliate_dotcoin",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🟡",
    title: "Check DotCoin Bot",
    description: "Visit DotCoin and see trending tasks.",
    rewardText: "External",
    actionText: "OPEN",
    url: "https://t.me/dotcoin_bot",
  },
  {
    id: "affiliate_bbqcoin",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "🍖",
    title: "Visit BBQCoin",
    description: "Join a fun tap-to-earn partner game.",
    rewardText: "External",
    actionText: "OPEN",
    url: "https://t.me/BBQCoin_bot",
  },
  {
    id: "affiliate_gemz",
    type: "affiliate",
    iconType: "affiliate",
    iconEmoji: "💎",
    title: "Visit Gemz Coin",
    description: "Discover Gemz and new missions.",
    rewardText: "External",
    actionText: "OPEN",
    url: "https://t.me/gemzcoin_bot",
  },
];

// ---------------------------
// TONCONNECT: TON Wallet entegrasyonu
// ---------------------------

let tonConnectUI = null;
let connectedWalletAddress = null;

const TONCONNECT_MANIFEST_URL =
  "https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json";

function initTonConnect() {
  try {
    const container = document.getElementById("ton-connect-button");
    if (!container || !window.TON_CONNECT_UI) {
      console.log("TonConnect UI için container veya kütüphane bulunamadı.");
      return;
    }

    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
      manifestUrl: TONCONNECT_MANIFEST_URL,
      buttonRootId: "ton-connect-button",
    });

    tonConnectUI.onStatusChange(function (wallet) {
      if (wallet) {
        connectedWalletAddress = wallet.account.address;
        const addrEl = document.getElementById("wallet-address");
        if (addrEl) {
          addrEl.textContent = "Bağlı cüzdan: " + connectedWalletAddress;
        }
        console.log("TON wallet connected:", connectedWalletAddress);
      } else {
        connectedWalletAddress = null;
        const addrEl = document.getElementById("wallet-address");
        if (addrEl) {
          addrEl.textContent = "";
        }
        console.log("TON wallet disconnected");
      }
    });
  } catch (err) {
    console.error("TonConnect init error:", err);
  }
}

// Örnek: TON ile coin satın alma (şu an iskelet)
async function buyCoinsWithTon() {
  if (!tonConnectUI || !connectedWalletAddress) {
    alert("Lütfen önce TON cüzdanınızı bağlayın.");
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

    console.log("TON ödeme isteği gönderildi.");
  } catch (err) {
    console.error("TON ödeme isteği hatası:", err);
  }
}

// ---------------------------
// Upgrade Cost hesaplama
// ---------------------------

function getUpgradeCost() {
  if (!userState || typeof userState.tap_power !== "number") {
    return 100;
  }
  // İlk seviye: tap_power = 1 => 100
  // Sonraki her seviye için +100 artar: 100, 200, 300, ...
  return userState.tap_power * 100;
}

// ---------------------------
// Dil seçici
// ---------------------------

function initLanguageSelector() {
  const langBtn = document.getElementById("current-lang");
  const dropdown = document.getElementById("lang-dropdown");

  if (!langBtn || !dropdown) return;

  langBtn.addEventListener("click", () => {
    dropdown.classList.toggle("hidden");
  });

  document.querySelectorAll(".lang-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      currentLang = opt.dataset.lang;
      localStorage.setItem("tap_lang", currentLang);
      updateLangUI();
      dropdown.classList.add("hidden");
    });
  });
}

function updateLangUI() {
  const dict = LANG[currentLang] || LANG.en;
  const tapBtn = document.getElementById("tap-btn");
  const upgradeTitle = document.querySelector(".upgrade-section h2");
  const upgradeBtn = document.getElementById("upgrade-tap-power-btn");
  const walletTitle = document.querySelector(".wallet-title");
  const buyTonBtn = document.getElementById("buy-coins-ton-btn");
  const tasksTitle = document.querySelector(".tasks-title");
  const tasksSubtitle = document.querySelector(".tasks-subtitle");
  const langBtn = document.getElementById("current-lang");

  const cost = getUpgradeCost();

  if (tapBtn) tapBtn.textContent = dict.tap;
  if (upgradeTitle) upgradeTitle.textContent = dict.upgrade_title;
  if (upgradeBtn)
    upgradeBtn.textContent = `${dict.upgrade_btn_prefix}${cost} coins)`;
  if (walletTitle) walletTitle.textContent = dict.wallet_title;
  if (buyTonBtn) buyTonBtn.textContent = dict.buy_ton;
  if (tasksTitle) tasksTitle.textContent = dict.daily_tasks;
  if (tasksSubtitle) tasksSubtitle.textContent = dict.daily_sub;
  if (langBtn)
    langBtn.textContent = currentLang === "en" ? "🇬🇧 EN" : "🇹🇷 TR";
}

// ---------------------------
// Kullanıcı başlatma (login)
// ---------------------------

async function initUser() {
  if (
    tg &&
    tg.initDataUnsafe &&
    tg.initDataUnsafe.user &&
    tg.initDataUnsafe.user.id
  ) {
    userId = tg.initDataUnsafe.user.id;
    console.log("Telegram user id:", userId);
  } else {
    console.log("Telegram user bulunamadı, local fallback kullanılacak.");
    const saved = window.localStorage.getItem("tap_user_id");
    if (saved) {
      userId = parseInt(saved, 10);
    } else {
      userId = Math.floor(Math.random() * 1000000000);
      window.localStorage.setItem("tap_user_id", String(userId));
    }
  }

  await fetchUser();
}

// ---------------------------
// API Çağrıları
// ---------------------------

async function fetchUser() {
  if (!userId) return;

  try {
    const res = await fetch(API_BASE + "/api/me?telegram_id=" + userId);
    if (!res.ok) {
      throw new Error("Kullanıcı bilgisi alınamadı");
    }

    userState = await res.json();
    renderUser();
  } catch (err) {
    console.error("fetchUser hata:", err);
  }
}

async function tapOnce() {
  if (!userId) return;

  try {
    const res = await fetch(API_BASE + "/api/tap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegram_id: userId,
        taps: 1,
      }),
    });

    if (!res.ok) {
      throw new Error("Tap isteği başarısız");
    }

    userState = await res.json();
    renderUser();

    tapCounter += 1;
    if (tapCounter >= TAPS_PER_AD) {
      tapCounter = 0;
      maybeShowInterstitial();
    }
  } catch (err) {
    console.error("tapOnce hata:", err);
  }
}

async function upgradeTapPower() {
  if (!userId || !userState) return;

  const cost = getUpgradeCost();

  if (userState.coins < cost) {
    alert("Not enough coins!");
    return;
  }

  try {
    const res = await fetch(API_BASE + "/api/upgrade/tap_power", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegram_id: userId,
      }),
    });

    if (!res.ok) {
      throw new Error("Upgrade isteği başarısız");
    }

    userState = await res.json();
    renderUser();
  } catch (err) {
    console.error("upgradeTapPower hata:", err);
  }
}

// ---------------------------
// UI Güncelleme
// ---------------------------

function renderUser() {
  if (!userState) return;

  const levelEl = document.getElementById("level");
  const coinsEl = document.getElementById("coins");
  const powerEl = document.getElementById("tap_power");

  if (levelEl) levelEl.textContent = userState.level;
  if (coinsEl) coinsEl.textContent = userState.coins;
  if (powerEl) powerEl.textContent = userState.tap_power;

  updateLangUI();
}

// ---------------------------
// Tasks UI & Handlers
// ---------------------------

function renderTasksBoard() {
  const container = document.getElementById("tasks-list");
  if (!container) return;

  container.innerHTML = "";

  TASKS.forEach((task) => {
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

    const ctaBtn = document.createElement("button");
    ctaBtn.className = "task-cta-btn";
    ctaBtn.textContent = task.actionText || "GO";
    ctaBtn.addEventListener("click", function () {
      handleTaskClick(task);
    });

    card.appendChild(icon);
    card.appendChild(main);
    card.appendChild(ctaBtn);

    container.appendChild(card);
  });
}

function handleTaskClick(task) {
  switch (task.type) {
    case "reward":
      showRewardAd();
      break;
    case "adsgram_task":
      showAdsgramTask();
      break;
    case "affiliate":
      openAffiliate(task.url);
      break;
    default:
      console.log("Unknown task type:", task);
  }
}

// ---------------------------
// Affiliate link opener
// ---------------------------

function openAffiliate(url) {
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, "_blank");
  }
}

function openBoinkerAffiliate() {
  openAffiliate("https://t.me/boinker_bot?start=_tgr_TiWlA9A5YWY8");
}

// ---------------------------
// DOMContentLoaded
// ---------------------------

document.addEventListener("DOMContentLoaded", function () {
  if (tg) {
    try {
      tg.expand();
    } catch (e) {
      console.log("Telegram WebApp expand error:", e);
    }
  }

  const tapBtn = document.getElementById("tap-btn");
  const upgradeBtn = document.getElementById("upgrade-tap-power-btn");
  const tonBuyBtn = document.getElementById("buy-coins-ton-btn");

  if (tapBtn) tapBtn.addEventListener("click", tapOnce);
  if (upgradeBtn) upgradeBtn.addEventListener("click", upgradeTapPower);
  if (tonBuyBtn) tonBuyBtn.addEventListener("click", buyCoinsWithTon);

  // Dil seçici
  initLanguageSelector();
  updateLangUI();

  // Kullanıcı / TON / AdsGram / Tasks
  initUser();
  initTonConnect();
  initAdsgram();
  renderTasksBoard();
});

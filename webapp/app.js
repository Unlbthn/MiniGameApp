// Telegram WebApp objesi (varsa)
const tg = window.Telegram ? window.Telegram.WebApp : null;

// Telegram içindeysek ekranı büyüt
if (tg) {
  try {
    tg.expand();
  } catch (e) {
    console.log("Telegram WebApp expand error:", e);
  }
}

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

// Minimum süre kontrolü (aynı anda hem tap hem süreye bakabiliriz)
let lastAdTime = 0;
const AD_INTERVAL_MS = 60_000; // 1 dakika

// AdsGram controller
let AdController = null;

// blockId → AdsGram panelinden aldığın ID
// Moderasyon mesajında PlatformID: 16514 dedin, burada onu kullanıyoruz.
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
// Kullanıcı AdController.show() ile reklamı izler veya kapatır.
// Biz sadece görüntüleme başına CPM kazanırız.
function maybeShowInterstitial() {
  if (!AdController) return;

  const now = Date.now();

  // Çok sık reklam göstermemek için zaman kontrolü
  if (now - lastAdTime < AD_INTERVAL_MS) {
    return;
  }

  lastAdTime = now;

  AdController.show()
    .then((result) => {
      console.log("Interstitial gösterildi:", result);
      // Interstitial'de ödül zorunlu değil, sadece gösterimden kazanıyoruz.
    })
    .catch((err) => {
      console.error("Interstitial gösterilemedi:", err);
    });
}

// Rewarded reklam (kullanıcı video/ads bitirince ödül)
// Örnek: +500 coin
function showRewardAd() {
  if (!AdController) {
    alert("Reklam şu anda hazır değil.");
    return;
  }

  AdController.show()
    .then((result) => {
      console.log("Reward ad sonucu:", result);

      // done = true ve error = false ise kullanıcı sonuna kadar izlemiş demektir
      if (result && result.done && !result.error) {
        giveRewardCoins();
      } else {
        // Kullanıcı erken kapattı veya error oluştu
        alert("Ödül kazanmak için reklamı sonuna kadar izlemen gerekiyor.");
      }
    })
    .catch((err) => {
      console.error("Reward ad hatası:", err);
      alert("Reklam oynatılırken bir hata oluştu.");
    });
}

// Şimdilik ödülü sadece local state üzerinde veriyoruz.
// İleride backend'de /api/reward endpoint'i ile kalıcı hâle getirebilirsin.
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

// AdsGram Task format (örnek hook)
// NOT: Task formatı için init gerekmediğini AdsGram dokümanında söylüyor.
// Buradaki fonksiyonun içine, AdsGram Task entegrasyon dokümanındaki kodu eklemelisin.
function showAdsgramTask() {
  if (!window.Adsgram) {
    alert("AdsGram not available right now.");
    return;
  }

  // Buraya AdsGram Task entegrasyonundan gelen gerçek kodu ekleyeceksin.
  // Örneğin (hayali örnek):
  // window.Adsgram.task({ blockId: ADSGRAM_BLOCK_ID })
  //   .then((result) => {
  //      console.log("Task completed:", result);
  //      // İstersen burada ek coin ödülü verebilirsin
  //   })
  //   .catch((err) => console.error("Task error:", err));

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
    type: "reward", // AdsGram rewarded video
    iconType: "reward",
    iconEmoji: "🎬",
    title: "Watch a Reward Ad",
    description: "Watch 1 full ad and get bonus coins.",
    rewardText: "+500 coins",
    actionText: "WATCH",
  },
  {
    id: "adsgram_task_1",
    type: "adsgram_task", // AdsGram Task format (join/open)
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

// Demo manifest; gerçek projede kendi manifest.json'ını host etmelisin.
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

    // Cüzdan durumu değiştiğinde (connect/disconnect)
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

// Örnek: TON ile coin satın alma (şu an sadece iskelet)
async function buyCoinsWithTon() {
  if (!tonConnectUI || !connectedWalletAddress) {
    alert("Lütfen önce TON cüzdanınızı bağlayın.");
    return;
  }

  try {
    // ÖRNEK: 0.1 TON gönderim isteği (nanoTON cinsinden 100000000)
    await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [
        {
          // BURAYA kendi geliştirici cüzdan adresini yazman gerekir
          address: "YOUR_TON_WALLET_ADDRESS",
          amount: "100000000",
        },
      ],
    });

    console.log("TON ödeme isteği gönderildi.");
  } catch (err) {
    console.error("TON ödeme isteği hatası:", err);
  }
}

// ---------------------------
// Kullanıcı başlatma (login mantığı)
// ---------------------------

async function initUser() {
  // 1) Telegram içinden açıldıysa user id al
  if (
    tg &&
    tg.initDataUnsafe &&
    tg.initDataUnsafe.user &&
    tg.initDataUnsafe.user.id
  ) {
    userId = tg.initDataUnsafe.user.id;
    console.log("Telegram user id:", userId);
  } else {
    // 2) Telegram yoksa local fallback
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

    // Reklam sayaç mantığı (interstitial için)
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
  if (!userId) return;

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

  var levelEl = document.getElementById("level");
  var coinsEl = document.getElementById("coins");
  var powerEl = document.getElementById("tap_power");

  if (levelEl) levelEl.textContent = userState.level;
  if (coinsEl) coinsEl.textContent = userState.coins;
  if (powerEl) powerEl.textContent = userState.tap_power;
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

// Eski boinker fonksiyonu hâlâ kullanılabilir istersen
function openBoinkerAffiliate() {
  openAffiliate("https://t.me/boinker_bot?start=_tgr_TiWlA9A5YWY8");
}

// ---------------------------
// Event Listener'lar
// ---------------------------

document.addEventListener("DOMContentLoaded", function () {
  var tapBtn = document.getElementById("tap-btn");
  var upgradeBtn = document.getElementById("upgrade-tap-power-btn");
  var tonBuyBtn = document.getElementById("buy-coins-ton-btn");

  if (tapBtn) {
    tapBtn.addEventListener("click", tapOnce);
  }
  if (upgradeBtn) {
    upgradeBtn.addEventListener("click", upgradeTapPower);
  }
  if (tonBuyBtn) {
    tonBuyBtn.addEventListener("click", buyCoinsWithTon);
  }

  // Oyun kullanıcı login/iç durum başlat
  initUser();

  // TON wallet butonu
  initTonConnect();

  // AdsGram SDK
  initAdsgram();

  // Daily tasks board
  renderTasksBoard();
});

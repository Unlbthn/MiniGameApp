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
// Adsgram: Reklam kontrol değişkenleri
// ---------------------------

let tapCounter = 0;
const TAPS_PER_AD = 50;           // 50 tap'te bir reklam dene
let lastAdTime = 0;
const AD_INTERVAL_MS = 60_000;    // minimum 1 dakika arayla reklam

// Adsgram için basit hazır/var mı kontrolü
// PlatformID: 16511
let adsgramReady = false;

function initAdsgram() {
  // Burada index.html'e eklediğin Adsgram script'ine göre kontrolü güncelle.
  // Örneğin Adsgram global objesinin adı "adsgram" ise:
  if (window.adsgram) {
    adsgramReady = true;
    console.log("Adsgram SDK hazır (PlatformID: 16511)");
  } else {
    console.log(
      "Adsgram SDK bulunamadı. Lütfen Adsgram dokümantasyonundaki <script> kodunu index.html'e ekle."
    );
  }
}

function maybeShowAd() {
  const now = Date.now();

  // Çok sık reklam göstermemek için minimum süre kontrolü
  if (now - lastAdTime < AD_INTERVAL_MS) {
    return;
  }

  lastAdTime = now;

  try {
    if (adsgramReady && window.adsgram) {
      // ÖRNEK:
      // Eğer Adsgram "showInterstitial" fonksiyonu veriyorsa:
      // window.adsgram.showInterstitial();
      //
      // Kendi panelindeki entegrasyon dokümanına göre
      // bu satırı doğru fonksiyon adıyla değiştirmen gerekiyor.
      console.log("Reklam tetiklenmeli (Adsgram fonksiyonunu buraya ekle)");
    } else {
      console.log("Adsgram hazır değil, reklam gösterilmedi.");
    }
  } catch (err) {
    console.error("Reklam gösterilemedi:", err);
  }
}

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

// İleride ödeme butonu eklemek için örnek (şimdilik kullanılmıyor)
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

    // Burada başarılı işlemden sonra backend'e "ödemeyi aldım" diye haber vermen gerekir.
    console.log("Ödeme isteği gönderildi.");
  } catch (err) {
    console.error("TON ödeme isteği hatası:", err);
  }
}

// ---------------------------
// Kullanıcı başlatma (login mantığı)
// ---------------------------

async function initUser() {
  // 1) Telegram içinden açıldıysa user id al
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
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

    // Reklam sayaç mantığı
    tapCounter += 1;
    if (tapCounter >= TAPS_PER_AD) {
      tapCounter = 0;
      maybeShowAd();
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
// Boinker affiliate task
// ---------------------------

function openBoinkerAffiliate() {
  var url = "https://t.me/boinker_bot?start=_tgr_TiWlA9A5YWY8";

  if (tg && tg.openTelegramLink) {
    // Telegram içinden link aç
    tg.openTelegramLink(url);
  } else {
    window.open(url, "_blank");
  }
}

// ---------------------------
// Event Listener'lar
// ---------------------------

document.addEventListener("DOMContentLoaded", function () {
  var tapBtn = document.getElementById("tap-btn");
  var upgradeBtn = document.getElementById("upgrade-tap-power-btn");
  var boinkerTaskBtn = document.getElementById("boinker-task-btn");
  var tonBuyBtn = document.getElementById("buy-coins-ton-btn");

  if (tapBtn) {
    tapBtn.addEventListener("click", tapOnce);
  }
  if (upgradeBtn) {
    upgradeBtn.addEventListener("click", upgradeTapPower);
  }
  if (boinkerTaskBtn) {
    boinkerTaskBtn.addEventListener("click", openBoinkerAffiliate);
  }
  if (tonBuyBtn) {
    tonBuyBtn.addEventListener("click", buyCoinsWithTon);
  }

  // Oyun kullanıcı login/iç durum başlat
  initUser();

  // TON wallet butonu
  initTonConnect();

  // Adsgram (SDK varsa)
  initAdsgram();
});

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
// Kullanıcıyı başlat
// ---------------------------
async function initUser() {
  // 1) Telegram içinden açıldıysa buradan user id almaya çalış
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
    userId = tg.initDataUnsafe.user.id;
    console.log("Telegram user id:", userId);
  } else {
    // 2) Telegram bilgisi yoksa (ör. direkt browser) local fallback kullan
    console.log("Telegram user bulunamadı, local fallback kullanılacak.");
    const saved = localStorage.getItem("tap_user_id");
    if (saved) {
      userId = parseInt(saved, 10);
    } else {
      userId = Math.floor(Math.random() * 1_000_000_000);
      localStorage.setItem("tap_user_id", userId.toString());
    }
  }

  // Artık elimizde bir userId var, backend'den kullanıcıyı çekelim
  await fetchUser();
}

// ---------------------------
// API Çağrıları
// ---------------------------

async function fetchUser() {
  if (!userId) return;

  try {
    const res = await fetch(`${API_BASE}/api/me?telegram_id=${userId}`);
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
    const res = await fetch(`${API_BASE}/api/tap`, {
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
  } catch (err) {
    console.error("tapOnce hata:", err);
  }
}

async function upgradeTapPower() {
  if (!userId) return;

  try {
    const res = await fetch(`${API_BASE}/api/upgrade/tap_power`, {
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

  document.getElementById("level").innerText = userState.level;
  document.getElementById("coins").innerText = userState.coins;
  document.getElementById("tap_power").innerText = userState.tap_power;
}

// ---------------------------
// Event Listener'lar
// ---------------------------

document.addEventListener("DOMContentLoaded", () => {
  const tapBtn = document.getElementById("tap-btn");
  const upgradeBtn = document.getElementById("upgrade-tap-power-btn");

  if (tapBtn) {
    tapBtn.addEventListener("click", tapOnce);
  }
  if (upgradeBtn) {
    upgradeBtn.addEventListener("click", upgradeTapPower);
  }

  // Kullanıcıyı başlat
  initUser();
});

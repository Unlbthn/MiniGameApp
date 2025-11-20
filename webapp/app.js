const tg = window.Telegram.WebApp;

// Uygulama açıldığında tam ekrana genişlet
tg.expand();

let userId = null;
let userState = null;

// Backend ile aynı origin üzerinden konuşuyoruz (FastAPI + StaticFiles birlikte)
const API_BASE = window.location.origin;

// --- API Çağrıları ---

async function fetchUser() {
  try {
    const user = tg.initDataUnsafe?.user;
    if (!user) {
      alert("Telegram kullanıcısı bulunamadı. Lütfen WebApp'i bot üzerinden aç.");
      return;
    }

    userId = user.id;

    const res = await fetch(`${API_BASE}/api/me?telegram_id=${userId}`);
    if (!res.ok) {
      throw new Error("Kullanıcı bilgisi alınamadı");
    }

    userState = await res.json();
    renderUser();
  } catch (err) {
    console.error(err);
    alert("Kullanıcı yüklenirken bir hata oluştu.");
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
    console.error(err);
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
    console.error(err);
  }
}


// --- UI Güncelleme ---

function renderUser() {
  if (!userState) return;

  document.getElementById("level").innerText = userState.level;
  document.getElementById("coins").innerText = userState.coins;
  document.getElementById("tap_power").innerText = userState.tap_power;
}


// --- Event Listener'lar ---

document.addEventListener("DOMContentLoaded", () => {
  const tapBtn = document.getElementById("tap-btn");
  const upgradeBtn = document.getElementById("upgrade-tap-power-btn");

  tapBtn.addEventListener("click", tapOnce);
  upgradeBtn.addEventListener("click", upgradeTapPower);

  fetchUser();
});

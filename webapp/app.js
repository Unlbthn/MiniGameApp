// Telegram WebApp
const tg = window.Telegram ? window.Telegram.WebApp : null;

let userId = null;
let userState = null;

const API = window.location.origin;

// -------------------------------------------------------------------
// INIT USER
// -------------------------------------------------------------------
async function initUser() {
  if (tg?.initDataUnsafe?.user?.id) {
    userId = tg.initDataUnsafe.user.id;
  } else {
    let saved = localStorage.getItem("tap_user_id");
    if (!saved) {
      saved = Math.floor(Math.random() * 1_000_000_000);
      localStorage.setItem("tap_user_id", saved);
    }
    userId = parseInt(saved);
  }

  await fetchUser();
}

// -------------------------------------------------------------------
async function fetchUser() {
  const res = await fetch(API + "/api/me?telegram_id=" + userId);
  if (!res.ok) return;
  userState = await res.json();
  renderUser();
}

// -------------------------------------------------------------------
// TAP BUTTON
// -------------------------------------------------------------------
async function tapOnce() {
  if (!userId) return;

  const res = await fetch(API + "/api/tap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegram_id: userId, taps: 1 }),
  });

  if (!res.ok) {
    console.log("tap error:", await res.text());
    alert("Tap failed, please try again.");
    return;
  }

  const data = await res.json();
  userState = data.user;
  renderUser();
}

// -------------------------------------------------------------------
// USER RENDER
// -------------------------------------------------------------------
function renderUser() {
  document.getElementById("coins").textContent = userState.coins;
  document.getElementById("tap_power").textContent = userState.tap_power;
  document.getElementById("ton_credits").textContent =
    userState.ton_credits.toFixed(2);
  document.getElementById("level").textContent = userState.level;
}

// -------------------------------------------------------------------
// INVITE FRIENDS (Telegram Share Sheet)
// -------------------------------------------------------------------
function shareInviteLink() {
  const base = "https://t.me/TaptoEarnTonBot";
  const ref = `start=ref_${userId}`;
  const url = `${base}?${ref}`;

  const share = `https://t.me/share/url?url=${encodeURIComponent(
    url
  )}&text=${encodeURIComponent("Join Tap to Earn TON!")}`;

  if (tg && tg.openTelegramLink) tg.openTelegramLink(share);
  else window.open(share, "_blank");
}

// -------------------------------------------------------------------
// TASK ACTION HANDLER
// -------------------------------------------------------------------
function handleTaskClick(task, action) {
  if (task.type === "invite") {
    if (action === "go") shareInviteLink();
    return;
  }
  // Diğer task türleri burada
}

// -------------------------------------------------------------------
// LEADERBOARD
// -------------------------------------------------------------------
async function openLeaderboard() {
  const res = await fetch(API + `/api/leaderboard?telegram_id=${userId}`);
  if (!res.ok) return;

  const data = await res.json();

  const box = document.getElementById("leaderboard-modal");
  const list = document.getElementById("leaderboard-list");
  const rankBox = document.getElementById("your-rank");

  list.innerHTML = "";

  data.top10.forEach((u, i) => {
    const item = document.createElement("div");
    item.className = "lb-item";
    item.innerHTML = `<b>#${i + 1}</b> — ${u.telegram_id} | ${u.coins} coins`;
    list.appendChild(item);
  });

  rankBox.textContent = `You are ranked: ${data.rank}`;
  box.classList.remove("hidden");
}

function closeLeaderboard() {
  document.getElementById("leaderboard-modal").classList.add("hidden");
}

// -------------------------------------------------------------------
// DOM EVENTS
// -------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initUser();

  document.getElementById("tap-btn").addEventListener("click", tapOnce);

  const lbBtn = document.getElementById("leaderboard-btn");
  if (lbBtn) lbBtn.addEventListener("click", openLeaderboard);

  document.getElementById("close-leaderboard").addEventListener("click", closeLeaderboard);
});

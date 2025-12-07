/** --------------------------
 * TAP TO EARN TON - app.js
 * Full Fixed Version (Turbo + Tasks + Daily Chest + Referral)
 * -------------------------- */

// Telegram WebApp
const tg = window.Telegram ? window.Telegram.WebApp : null;

// Language dictionary
const LANG = {
  en: {
    tap: "TAP",
    upgrade_title: "Upgrade",
    upgrade_btn_prefix: "Increase Tap Power (cost: ",
    wallet_title: "TON Wallet",
    buy_ton: "Buy coins with TON (beta)",
    daily_tasks: "Daily Tasks",
    daily_sub: "Complete tasks to earn extra rewards.",
    tasks_button: "Daily Tasks",
    ton_credits_label: "TON Credits",
    turbo: "Turbo x2 (5 min)",
  },
  tr: {
    tap: "TIKLA",
    upgrade_title: "Yükselt",
    upgrade_btn_prefix: "Vuruş Gücünü Artır (maliyet: ",
    wallet_title: "TON Cüzdan",
    buy_ton: "TON ile coin satın al (beta)",
    daily_tasks: "Günlük Görevler",
    daily_sub: "Ek ödüller kazanmak için görevleri tamamla.",
    tasks_button: "Günlük Görevler",
    ton_credits_label: "TON Kredileri",
    turbo: "Turbo x2 (5 dk)",
  },
};

let currentLang = localStorage.getItem("tap_lang") || "en";

// Backend origin
const API_BASE = window.location.origin;

// User state
let userId = null;
let userState = null;

// AdsGram
let AdController = null;
const REWARD_BLOCK_ID = "17996";
const INTERSTITIAL_BLOCK_ID = "int-17995";

// Turbo logic
let turboActive = false;
let turboEndsAt = null;

// --------------------------
// INIT
// --------------------------

document.addEventListener("DOMContentLoaded", async () => {
  if (tg) tg.expand();

  initLanguageSelector();

  await initUser();
  initTurboUI();
  initAdsGram();

  attachEvents();
});

// --------------------------
// USER INIT
// --------------------------

async function initUser() {
  if (tg?.initDataUnsafe?.user?.id) {
    userId = tg.initDataUnsafe.user.id;
  } else {
    userId =
      localStorage.getItem("tap_user_id") || Math.floor(Math.random() * 1e9);
    localStorage.setItem("tap_user_id", userId);
  }

  await fetchUser();
  await fetchTaskStatuses();
}

async function fetchUser() {
  const res = await fetch(`${API_BASE}/api/me?telegram_id=${userId}`);
  if (!res.ok) return;
  userState = await res.json();
  renderUser();
}

// --------------------------
// RENDER USER
// --------------------------
function renderUser() {
  if (!userState) return;

  document.getElementById("level").textContent = userState.level;
  document.getElementById("coins").textContent = userState.coins;
  document.getElementById("tap_power").textContent = userState.tap_power;
  document.getElementById("ton_credits").textContent =
    userState.ton_credits.toFixed(2);

  // Update TON pill
  const pill = document.getElementById("ton-pill-value");
  if (pill) pill.textContent = userState.ton_credits.toFixed(2);

  updateLangUI();
}

// --------------------------
// TAP LOGIC
// --------------------------

async function tapOnce() {
  if (!userId) return;

  let tapsToSend = turboActive ? 2 : 1;

  const res = await fetch(`${API_BASE}/api/tap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegram_id: userId, taps: tapsToSend }),
  });

  if (!res.ok) return;
  const data = await res.json();

  userState = data.user;
  renderUser();
}

// --------------------------
// UPGRADE
// --------------------------

async function upgradeTapPower() {
  const res = await fetch(`${API_BASE}/api/upgrade/tap_power`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegram_id: userId }),
  });

  const data = await res.json();
  if (data.user) {
    userState = data.user;
    renderUser();
  }
}

// --------------------------
// TURBO BOOST
// --------------------------

function initTurboUI() {
  const btn = document.getElementById("turbo-btn");
  if (!btn) return;

  if (turboActive && turboEndsAt) {
    btn.disabled = true;
    startTurboCountdown();
  }
}

async function startTurbo() {
  if (turboActive) return;

  const res = await fetch(`${API_BASE}/api/turbo/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegram_id: userId }),
  });

  if (!res.ok) {
    alert("Turbo already active today.");
    return;
  }

  const data = await res.json();
  turboActive = true;
  turboEndsAt = Date.now() + 5 * 60 * 1000;

  const btn = document.getElementById("turbo-btn");
  btn.disabled = true;

  startTurboCountdown();
}

function startTurboCountdown() {
  const btn = document.getElementById("turbo-btn");

  const timer = setInterval(() => {
    const diff = turboEndsAt - Date.now();
    if (diff <= 0) {
      clearInterval(timer);
      turboActive = false;
      btn.disabled = false;
      btn.textContent = LANG[currentLang].turbo;
      return;
    }
    btn.textContent = `${Math.floor(diff / 1000)}s`;
  }, 1000);
}

// --------------------------
// ADSGRAM REWARD AD
// --------------------------

function initAdsGram() {
  if (!window.Adsgram) return;

  AdController = window.Adsgram.init({ blockId: REWARD_BLOCK_ID });
}

function showRewardAd() {
  if (!AdController) return;

  AdController.show().then(async (result) => {
    if (!result.done) {
      alert("You must watch full ad.");
      return;
    }

    const res = await fetch(
      `${API_BASE}/api/reward/ad?telegram_id=${userId}`,
      {
        method: "POST",
      }
    );

    const data = await res.json();
    userState = data.user;
    renderUser();
  });
}

// --------------------------
// TASK SYSTEM
// --------------------------

let taskStatusMap = {};
let taskUnlockTimers = {};

// Task List
const TASKS = [
  {
    id: "daily_chest",
    type: "reward_once",
    title: "Daily TON Chest",
    desc: "Watch 1 ad daily and earn TON.",
    reward_text: "+0.01 TON",
    icon: "🎁",
  },
  {
    id: "turbo",
    type: "turbo",
    title: "Turbo Boost x2",
    desc: "Activate 5-min turbo mode.",
    reward_text: "2x power",
    icon: "⚡",
  },
  {
    id: "referral",
    type: "referral",
    title: "Invite Friends",
    desc: "Earn when your friend reaches 200 coins.",
    reward_text: "+0.02 TON",
    icon: "👥",
  },
  {
    id: "boinker",
    type: "affiliate",
    title: "Visit Boinker",
    desc: "Open Boinker mini-app.",
    reward_text: "+1000 coins",
    url: "https://t.me/boinker_bot",
    icon: "🧠",
  },
];

// Fetch tasks
async function fetchTaskStatuses() {
  const res = await fetch(
    `${API_BASE}/api/tasks/status?telegram_id=${userId}`
  );
  const data = await res.json();
  data.forEach((s) => (taskStatusMap[s.task_id] = s.status));
  renderTasksBoard();
}

// Render tasks
function renderTasksBoard() {
  const list = document.getElementById("tasks-list");
  if (!list) return;
  list.innerHTML = "";

  TASKS.forEach((task) => {
    const status = taskStatusMap[task.id] || "pending";

    const card = document.createElement("div");
    card.className = "task-card";

    card.innerHTML = `
      <div class="task-icon">${task.icon}</div>
      <div class="task-info">
        <div class="task-title">${task.title}</div>
        <div class="task-desc">${task.desc}</div>
        <div class="task-reward">${task.reward_text}</div>
      </div>
      <div class="task-actions" id="actions-${task.id}">
      </div>
    `;

    const actions = card.querySelector(`#actions-${task.id}`);

    // Button logic
    if (task.type === "reward_once") {
      const btn = document.createElement("button");
      btn.textContent = "WATCH";
      btn.disabled = status === "claimed";
      btn.onclick = () => showRewardAd();
      actions.appendChild(btn);
    }

    if (task.type === "turbo") {
      const btn = document.createElement("button");
      btn.textContent = LANG[currentLang].turbo;
      btn.disabled = turboActive;
      btn.onclick = startTurbo;
      actions.appendChild(btn);
    }

    if (task.type === "affiliate") {
      const go = document.createElement("button");
      go.textContent = "GO";
      go.onclick = () => openAffiliate(task.id, task.url);
      actions.appendChild(go);

      const check = document.createElement("button");
      check.textContent = "CHECK";
      check.disabled = !taskUnlockTimers[task.id];
      check.onclick = () => checkTask(task.id);
      actions.appendChild(check);

      const claim = document.createElement("button");
      claim.textContent = "CLAIM";
      claim.disabled = status !== "checked";
      claim.onclick = () => claimTask(task.id);
      actions.appendChild(claim);
    }

    if (task.type === "referral") {
      const go = document.createElement("button");
      go.textContent = "INVITE";
      go.onclick = () => openReferral();
      actions.appendChild(go);

      const check = document.createElement("button");
      check.textContent = "CHECK";
      check.onclick = () => checkTask("referral");
      actions.appendChild(check);

      const claim = document.createElement("button");
      claim.textContent = "CLAIM";
      claim.disabled = status !== "checked";
      claim.onclick = () => claimTask("referral");
      actions.appendChild(claim);
    }

    list.appendChild(card);
  });
}

function openAffiliate(taskId, url) {
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank");

  // After 10 sec → enable CHECK
  taskUnlockTimers[taskId] = false;
  setTimeout(() => {
    taskUnlockTimers[taskId] = true;
    renderTasksBoard();
  }, 10000);
}

// Referral link
function openReferral() {
  const link = `https://t.me/TaptoEarnTonBot?start=ref_${userId}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(link);
  else window.open(link, "_blank");
}

// Check task
async function checkTask(taskId) {
  const res = await fetch(`${API_BASE}/api/tasks/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegram_id: userId, task_id: taskId }),
  });

  const data = await res.json();
  taskStatusMap[taskId] = data.task_status;
  renderTasksBoard();
}

// Claim task
async function claimTask(taskId) {
  const res = await fetch(`${API_BASE}/api/tasks/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegram_id: userId, task_id: taskId }),
  });

  const data = await res.json();
  userState = data.user;
  taskStatusMap[taskId] = data.task_status;

  renderUser();
  renderTasksBoard();
}

// --------------------------
// EVENTS
// --------------------------

function attachEvents() {
  document.getElementById("tap-btn").onclick = tapOnce;
  document.getElementById("upgrade-tap-power-btn").onclick = upgradeTapPower;

  document.getElementById("open-tasks-btn").onclick = () =>
    openModal("tasks-modal");

  document.querySelectorAll(".overlay-close").forEach((btn) => {
    const target = btn.dataset.close;
    btn.onclick = () => closeModal(target);
  });
}

// --------------------------
// MODALS
// --------------------------

function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

// --------------------------
// LANGUAGE
// --------------------------

function initLanguageSelector() {
  const chips = document.querySelectorAll(".lang-chip");
  chips.forEach((chip) => {
    if (chip.dataset.lang === currentLang) chip.classList.add("active");

    chip.onclick = () => {
      currentLang = chip.dataset.lang;
      localStorage.setItem("tap_lang", currentLang);
      chips.forEach((c) =>
        c.classList.toggle("active", c.dataset.lang === currentLang)
      );
      updateLangUI();
    };
  });
}

function updateLangUI() {
  const dict = LANG[currentLang];
  document.getElementById("tap-btn").textContent = dict.tap;
  document.querySelector(".upgrade-section h2").textContent =
    dict.upgrade_title;

  const cost = userState.tap_power * 100;
  document.getElementById("upgrade-tap-power-btn").textContent =
    `${dict.upgrade_btn_prefix}${cost} coins)`;

  document.querySelector(".tasks-title").textContent = dict.daily_tasks;
  document.querySelector(".tasks-subtitle").textContent = dict.daily_sub;
  document.getElementById("open-tasks-btn").textContent = dict.tasks_button;
}

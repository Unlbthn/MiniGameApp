// webapp/app.js

// Küçük yardımcı: element al, yoksa uyar ama hata fırlatma
function $(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn("Missing element with id:", id);
    }
    return el;
}

const tg = window.Telegram ? window.Telegram.WebApp : null;

let telegramId = null;
let state = {
    level: 1,
    coins: 0,
    tapPower: 1,
    tonCredits: 0,
    nextLevelRequirement: 1000, // backend'den override edilecek
};

// DOM referansları (ID'ler index.html ile bire bir uyumlu)
const tapButton         = $("tapButton");

const levelValue        = $("level");
const coinsValue        = $("coins");
const tapPowerValue     = $("tapPower");
const tonCreditsValue   = $("tonCredits");
const levelProgressFill = $("xpFill");
const nextLevelText     = $("nextLevelText");

const increaseTapBtn    = $("upgradeBtn");
const dailyTasksBtn     = $("tasksBtn");
const dailyTasksModal   = $("tasksPopup");
const dailyTasksClose   = $("closeTasks");

const chestBtn          = $("chestBtn");
const inviteBtn         = $("inviteBtn");

const walletIcon        = $("walletBtn");
const trophyIcon        = $("leaderboardBtn");
const leaderboardModal  = $("leaderPopup");
const leaderboardClose  = $("closeLeaderboard");
const leaderboardList   = $("leaderList");
const leaderboardYouRow = $("yourRank");

const langEnBtn         = $("langEN");
const langTrBtn         = $("langTR");

function showError(msg) {
    console.error(msg);
    if (tg && typeof tg.showAlert === "function") {
        tg.showAlert(msg);
    } else {
        alert(msg);
    }
}

function showToast(msg) {
    if (tg && typeof tg.showPopup === "function") {
        tg.showPopup({ message: msg });
    } else {
        console.log("Toast:", msg);
    }
}

// UI güncelleme
function updateUI() {
    if (levelValue)      levelValue.textContent      = state.level;
    if (coinsValue)      coinsValue.textContent      = state.coins;
    if (tapPowerValue)   tapPowerValue.textContent   = state.tapPower;
    if (tonCreditsValue) tonCreditsValue.textContent = state.tonCredits.toFixed(2);

    // Level progress (0–1)
    if (
        typeof state.nextLevelRequirement === "number" &&
        state.nextLevelRequirement > 0 &&
        levelProgressFill
    ) {
        const ratio = Math.max(
            0,
            Math.min(1, state.coins / state.nextLevelRequirement)
        );
        levelProgressFill.style.width = (ratio * 100).toFixed(1) + "%";
    }

    if (nextLevelText) {
        nextLevelText.textContent =
            `Next level: ${state.coins} / ${state.nextLevelRequirement}`;
    }
}

// Kullanıcıyı backend'den çek
async function loadUser() {
    if (!telegramId) {
        showError("Telegram user id not found. Please open this game inside Telegram.");
        return;
    }

    try {
        const res = await fetch(`/api/me?telegram_id=${telegramId}`);
        if (!res.ok) {
            throw new Error("Failed to load user: " + res.status);
        }
        const data = await res.json();

        state.level                = data.level ?? 1;
        state.coins                = data.coins ?? 0;
        state.tapPower             = data.tap_power ?? 1;
        state.tonCredits           = data.ton_credits ?? 0;
        state.nextLevelRequirement = data.next_level_requirement ?? 1000;

        updateUI();
    } catch (err) {
        console.error(err);
        showError("Could not load player data. Please try again.");
    }
}

// TAP handler
async function handleTap() {
    if (!telegramId) {
        showError("Telegram user not detected.");
        return;
    }

    try {
        const res = await fetch("/api/tap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ telegram_id: telegramId })
        });

        if (!res.ok) {
            const txt = await res.text();
            console.error("Tap failed:", res.status, txt);
            showError("Tap failed, please try again.");
            return;
        }

        const data = await res.json();

        state.coins                = data.coins ?? state.coins;
        state.level                = data.level ?? state.level;
        state.tapPower             = data.tap_power ?? state.tapPower;
        state.tonCredits           = data.ton_credits ?? state.tonCredits;
        state.nextLevelRequirement = data.next_level_requirement ?? state.nextLevelRequirement;

        updateUI();

        if (data.show_ad) {
            console.log("Ad hint from backend:", data.show_ad);
        }
    } catch (err) {
        console.error(err);
        showError("Tap error, please try again.");
    }
}

// Tap power upgrade handler
async function handleIncreaseTapPower() {
    if (!telegramId) {
        showError("Telegram user not detected.");
        return;
    }

    try {
        const res = await fetch("/api/upgrade_tap_power", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ telegram_id: telegramId })
        });

        if (!res.ok) {
            const txt = await res.text();
            console.error("Upgrade failed:", res.status, txt);
            showError("Not enough coins to upgrade tap power.");
            return;
        }

        const data = await res.json();

        state.coins                = data.coins ?? state.coins;
        state.tapPower             = data.tap_power ?? state.tapPower;
        state.level                = data.level ?? state.level;
        state.nextLevelRequirement = data.next_level_requirement ?? state.nextLevelRequirement;

        updateUI();
        showToast("Tap power upgraded!");
    } catch (err) {
        console.error(err);
        showError("Upgrade error, please try again.");
    }
}

// Daily tasks modal
function openDailyTasks() {
    if (dailyTasksModal) {
        dailyTasksModal.classList.remove("hidden");
        dailyTasksModal.classList.add("visible");
    }
}

function closeDailyTasks() {
    if (dailyTasksModal) {
        dailyTasksModal.classList.remove("visible");
        dailyTasksModal.classList.add("hidden");
    }
}

// Daily TON Chest (şimdilik placeholder – sonra backend'e bağlarız)
async function handleChestTask() {
    // Buraya /api/tasks/chest çağrısı ekleyebiliriz
    showToast("Daily TON Chest will be upgraded soon with real rewards.");
}

// Invite Friends (Telegram share link)
function handleInviteTask() {
    const url = "https://t.me/TaptoEarnTonBot/app"; // senin gerçek TMA linkini yaz
    const text = "Tap to Earn TON oyununa katıl, birlikte TON kazanalım!";
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

    if (tg && tg.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
    } else {
        window.open(shareUrl, "_blank");
    }
}

// Partner site linki – index.html'deki inline onclick bunu kullanıyor
function openTaskLink(url) {
    if (tg && tg.openLink) {
        tg.openLink(url);
    } else {
        window.open(url, "_blank");
    }
}
window.openTaskLink = openTaskLink; // global yap

// Wallet icon
function handleWalletClick() {
    showToast("TON wallet linking will be available soon.");
    // TonConnect entegrasyonunu buraya ekleyeceğiz.
}

// Leaderboard
async function openLeaderboard() {
    if (!telegramId) {
        showError("Telegram user not detected.");
        return;
    }

    if (!leaderboardModal || !leaderboardList || !leaderboardYouRow) {
        console.warn("Leaderboard elements missing, skipping openLeaderboard");
        return;
    }

    try {
        const res = await fetch(`/api/leaderboard?telegram_id=${telegramId}`);
        if (!res.ok) {
            const txt = await res.text();
            console.error("Leaderboard failed:", res.status, txt);
            showError("Could not load leaderboard.");
            return;
        }

        const data = await res.json();
        const top = data.top ?? [];
        const you = data.you ?? null;

        leaderboardList.innerHTML = "";

        top.forEach((user, idx) => {
            const row = document.createElement("div");
            row.className = "leaderboard-row";
            row.innerHTML = `
                <span class="leaderboard-rank">#${idx + 1}</span>
                <span class="leaderboard-name">${user.username || "Player"}</span>
                <span class="leaderboard-score">${user.total_coins ?? 0}💠</span>
            `;
            leaderboardList.appendChild(row);
        });

        if (you) {
            leaderboardYouRow.textContent =
                `Your rank: #${you.rank} • Total coins: ${you.total_coins ?? 0}`;
        } else {
            leaderboardYouRow.textContent = "Play more to enter the rankings!";
        }

        leaderboardModal.classList.remove("hidden");
        leaderboardModal.classList.add("visible");
    } catch (err) {
        console.error(err);
        showError("Leaderboard error, please try again.");
    }
}

function closeLeaderboard() {
    if (leaderboardModal) {
        leaderboardModal.classList.remove("visible");
        leaderboardModal.classList.add("hidden");
    }
}

// Dil değiştirme (şimdilik buton highlight)
function setLanguage(lang) {
    if (lang === "en") {
        if (langEnBtn) langEnBtn.classList.add("active");
        if (langTrBtn) langTrBtn.classList.remove("active");
    } else {
        if (langTrBtn) langTrBtn.classList.add("active");
        if (langEnBtn) langEnBtn.classList.remove("active");
    }
}

// Başlat
document.addEventListener("DOMContentLoaded", () => {
    // Telegram kullanıcıyı al
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        telegramId = tg.initDataUnsafe.user.id;
        console.log("Telegram user id:", telegramId);
    } else {
        console.warn("Telegram WebApp user not found in initDataUnsafe.");
    }

    // Event listeners — element varsa bağla
    if (tapButton)       tapButton.addEventListener("click", handleTap);
    if (increaseTapBtn)  increaseTapBtn.addEventListener("click", handleIncreaseTapPower);
    if (dailyTasksBtn)   dailyTasksBtn.addEventListener("click", openDailyTasks);
    if (dailyTasksClose) dailyTasksClose.addEventListener("click", closeDailyTasks);
    if (chestBtn)        chestBtn.addEventListener("click", handleChestTask);
    if (inviteBtn)       inviteBtn.addEventListener("click", handleInviteTask);

    if (walletIcon)      walletIcon.addEventListener("click", handleWalletClick);
    if (trophyIcon)      trophyIcon.addEventListener("click", openLeaderboard);
    if (leaderboardClose) leaderboardClose.addEventListener("click", closeLeaderboard);

    if (langEnBtn) langEnBtn.addEventListener("click", () => setLanguage("en"));
    if (langTrBtn) langTrBtn.addEventListener("click", () => setLanguage("tr"));

    // Başlangıç dili
    setLanguage("en");

    // Kullanıcı verisini çek
    loadUser();
});

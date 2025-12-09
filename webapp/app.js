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
    nextLevelRequirement: 1000, // backend'den gelirse override edeceğiz
};

// DOM referansları
const tapButton         = $("tapButton");
const levelValue        = $("levelValue");
const coinsValue        = $("coinsValue");
const tapPowerValue     = $("tapPowerValue");
const tonCreditsValue   = $("tonCreditsValue");
const levelProgressFill = $("levelProgressFill");
const nextLevelText     = $("nextLevelText");

const increaseTapBtn    = $("increaseTapPowerBtn");
const dailyTasksBtn     = $("dailyTasksBtn");
const dailyTasksModal   = $("dailyTasksModal");
const dailyTasksClose   = $("dailyTasksClose");

const walletIcon        = $("walletIcon");
const trophyIcon        = $("trophyIcon");
const leaderboardModal  = $("leaderboardModal");
const leaderboardClose  = $("leaderboardClose");
const leaderboardList   = $("leaderboardList");
const leaderboardYouRow = $("leaderboardYouRow");

const langEnBtn         = $("langEnBtn");
const langTrBtn         = $("langTrBtn");

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
    if (typeof state.nextLevelRequirement === "number" &&
        state.nextLevelRequirement > 0 &&
        levelProgressFill) {

        const currentInLevel = state.coins;
        const ratio = Math.max(
            0,
            Math.min(1, currentInLevel / state.nextLevelRequirement)
        );
        levelProgressFill.style.width = (ratio * 100).toFixed(1) + "%";
    }

    if (nextLevelText) {
        nextLevelText.textContent = `Next level: ${state.coins} / ${state.nextLevelRequirement}`;
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

        // Backend'den dönen alan isimlerine göre ayarla
        state.level               = data.level ?? 1;
        state.coins               = data.coins ?? 0;
        state.tapPower            = data.tap_power ?? 1;
        state.tonCredits          = data.ton_credits ?? 0;
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

        state.coins               = data.coins ?? state.coins;
        state.level               = data.level ?? state.level;
        state.tapPower            = data.tap_power ?? state.tapPower;
        state.tonCredits          = data.ton_credits ?? state.tonCredits;
        state.nextLevelRequirement = data.next_level_requirement ?? state.nextLevelRequirement;

        updateUI();

        // 100 tap'te bir reklam bilgisi backend'den geliyorsa:
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

        state.coins    = data.coins ?? state.coins;
        state.tapPower = data.tap_power ?? state.tapPower;
        state.level    = data.level ?? state.level;
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
        dailyTasksModal.classList.add("visible");
    }
}

function closeDailyTasks() {
    if (dailyTasksModal) {
        dailyTasksModal.classList.remove("visible");
    }
}

// Wallet icon
function handleWalletClick() {
    showToast("TON wallet linking will be available soon.");
    // İleride TonConnect entegrasyonunu buraya koyacağız.
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

        leaderboardModal.classList.add("visible");
    } catch (err) {
        console.error(err);
        showError("Leaderboard error, please try again.");
    }
}

function closeLeaderboard() {
    if (leaderboardModal) {
        leaderboardModal.classList.remove("visible");
    }
}

// Dil değiştirme (şimdilik sadece buton seçimi)
function setLanguage(lang) {
    if (lang === "en") {
        if (langEnBtn) langEnBtn.classList.add("active");
        if (langTrBtn) langTrBtn.classList.remove("active");
    } else {
        if (langTrBtn) langTrBtn.classList.add("active");
        if (langEnBtn) langEnBtn.classList.remove("active");
    }
    // İleride backend'e language preference gönderebiliriz.
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
    if (tapButton) {
        tapButton.addEventListener("click", handleTap);
    }
    if (increaseTapBtn) {
        increaseTapBtn.addEventListener("click", handleIncreaseTapPower);
    }
    if (dailyTasksBtn) {
        dailyTasksBtn.addEventListener("click", openDailyTasks);
    }
    if (dailyTasksClose) {
        dailyTasksClose.addEventListener("click", closeDailyTasks);
    }
    if (walletIcon) {
        walletIcon.addEventListener("click", handleWalletClick);
    }
    if (trophyIcon) {
        trophyIcon.addEventListener("click", openLeaderboard);
    }
    if (leaderboardClose) {
        leaderboardClose.addEventListener("click", closeLeaderboard);
    }

    if (langEnBtn) {
        langEnBtn.addEventListener("click", () => setLanguage("en"));
    }
    if (langTrBtn) {
        langTrBtn.addEventListener("click", () => setLanguage("tr"));
    }

    // Başlangıç dili
    setLanguage("en");

    // Kullanıcı verisini çek
    loadUser();
});

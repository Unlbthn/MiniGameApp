// app.js – Tap to Earn TON (clean + robust version)

// --- Telegram WebApp & global state ---

const tg = window.Telegram ? window.Telegram.WebApp : null;
if (tg) {
    tg.expand();
}

const userId =
    tg?.initDataUnsafe?.user?.id ||
    tg?.initDataUnsafe?.user?.ID ||
    null;

if (!userId) {
    console.warn("Telegram user id bulunamadı. WebApp dışında test ediyor olabilirsin.");
}

let gameState = {
    level: 1,
    coins: 0,
    tapPower: 1,
    tonCredits: 0,
    currentXp: 0,
    nextLevelXp: 1000
};

let currentLocale = "en";
let isTapping = false;

// --- Helpers ---

function webAlert(message) {
    if (tg && typeof tg.showAlert === "function") {
        tg.showAlert(message);
    } else {
        alert(message);
    }
}

async function apiFetch(path, options = {}) {
    const url = `${window.location.origin}${path}`;
    const headers = options.headers || {};
    if (!(options.body instanceof FormData)) {
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }

    const finalOptions = {
        method: options.method || "GET",
        headers,
        body: options.body
    };

    try {
        const res = await fetch(url, finalOptions);
        if (!res.ok) {
            const text = await res.text();
            console.error(`API error ${path}:`, res.status, text);
            throw new Error(`HTTP ${res.status}`);
        }
        // Bazı endpoint’ler boş dönebilir, o yüzden json parse’ı try-catch’liyoruz
        try {
            return await res.json();
        } catch (e) {
            return {};
        }
    } catch (err) {
        console.error("apiFetch error:", err);
        webAlert("Connection error, please try again.");
        throw err;
    }
}

// Backend farklı alan adları kullanırsa da çalışsın diye
function extractUserFromResponse(data) {
    if (!data) return {};
    // Eğer data.user varsa onu al
    if (data.user) return data.user;

    // Yoksa direkt data’yı user kabul et
    return data;
}

// --- DOM Referansları ---

function $(id) {
    return document.getElementById(id);
}

const levelValueEl = $("levelValue");
const coinsValueEl = $("coinsValue");
const tapPowerValueEl = $("tapPowerValue");
const tonCreditsValueEl = $("tonCreditsValue");
const userIdValueEl = $("userIdValue");
const nextLevelLabelEl = $("nextLevelLabel");
const xpProgressInnerEl = $("xpProgressInner");

const tapButtonEl = $("tapButton");
const upgradeButtonEl = $("upgradeButton");
const dailyTasksButtonEl = $("dailyTasksButton");
const walletButtonEl = $("walletButton");
const leaderboardButtonEl = $("leaderboardButton");

const langEnBtn = $("langEn");
const langTrBtn = $("langTr");

const dailyTasksModalEl = $("dailyTasksModal");
const tasksListEl = $("tasksList");
const closeTasksEl = $("closeTasks");

const leaderboardModalEl = $("leaderboardModal");
const leaderboardListEl = $("leaderboardList");
const closeLeaderboardEl = $("closeLeaderboard");

// --- i18n ---

const messages = {
    en: {
        tapFailed: "Tap failed, please try again.",
        notEnoughCoins: "Not enough coins to upgrade tap power.",
        walletSoon: "TON wallet linking will be available soon.",
        leaderboardTitle: "Top 10 Players",
        yourRank: rank => `Your rank: ${rank}`,
        dailyTasksTitle: "Daily tasks",
        inviteFriends: "Invite friends",
        visitChannel: "Visit partner channel",
        watchAd: "Watch ad & get reward"
    },
    tr: {
        tapFailed: "Tıklama başarısız, lütfen tekrar dene.",
        notEnoughCoins: "Tap gücünü arttırmak için yeterli coinin yok.",
        walletSoon: "TON cüzdan eşleştirme yakında aktif olacak.",
        leaderboardTitle: "En iyi 10 oyuncu",
        yourRank: rank => `Senin sıran: ${rank}.`,
        dailyTasksTitle: "Günlük görevler",
        inviteFriends: "Arkadaşlarını davet et",
        visitChannel: "Partner kanalını ziyaret et",
        watchAd: "Reklam izle, ödül kazan"
    }
};

function t(key, ...args) {
    const dict = messages[currentLocale] || messages.en;
    const value = dict[key] || messages.en[key] || "";
    if (typeof value === "function") {
        return value(...args);
    }
    return value;
}

function setLocale(locale) {
    currentLocale = locale === "tr" ? "tr" : "en";

    if (langEnBtn) {
        langEnBtn.classList.toggle("lang-active", currentLocale === "en");
    }
    if (langTrBtn) {
        langTrBtn.classList.toggle("lang-active", currentLocale === "tr");
    }

    if (dailyTasksButtonEl) {
        dailyTasksButtonEl.textContent = currentLocale === "en" ? "Daily Tasks" : "Günlük Görevler";
    }
    if (upgradeButtonEl) {
        upgradeButtonEl.textContent =
            currentLocale === "en"
                ? "Increase Tap Power (cost: 100 coins)"
                : "Tap Gücünü Arttır (maliyet: 100 coin)";
    }
}

// --- UI Güncelleme ---

function updateUIFromState() {
    if (levelValueEl) levelValueEl.textContent = gameState.level;
    if (coinsValueEl) coinsValueEl.textContent = gameState.coins;
    if (tapPowerValueEl) tapPowerValueEl.textContent = gameState.tapPower;
    if (userIdValueEl) userIdValueEl.textContent = userId ? String(userId) : "—";

    if (tonCreditsValueEl) tonCreditsValueEl.textContent = gameState.tonCredits.toFixed
        ? gameState.tonCredits.toFixed(2)
        : Number(gameState.tonCredits || 0).toFixed(2);

    if (nextLevelLabelEl) {
        nextLevelLabelEl.textContent = `${gameState.currentXp} / ${gameState.nextLevelXp}`;
    }

    // Progress bar
    if (xpProgressInnerEl) {
        const ratio =
            gameState.nextLevelXp > 0
                ? Math.max(0, Math.min(1, gameState.currentXp / gameState.nextLevelXp))
                : 0;
        xpProgressInnerEl.style.width = `${ratio * 100}%`;
    }
}

function hydrateStateFromUser(user) {
    if (!user) return;
    // Backend alan adlarına göre esnek davran
    gameState.level = user.level ?? gameState.level;
    gameState.coins = user.coins ?? user.total_coins ?? gameState.coins;
    gameState.tapPower = user.tap_power ?? user.tapPower ?? gameState.tapPower;
    gameState.tonCredits = user.ton_credits ?? user.tonCredits ?? gameState.tonCredits;
    gameState.currentXp = user.current_xp ?? user.exp ?? user.xp ?? gameState.currentXp;
    gameState.nextLevelXp = user.next_level_xp ?? user.nextLevelXp ?? gameState.nextLevelXp;
    updateUIFromState();
}

// --- API ile entegrasyon ---

async function loadUser() {
    if (!userId) return;
    try {
        const data = await apiFetch(`/api/me?telegram_id=${encodeURIComponent(userId)}`, {
            method: "GET"
        });
        const user = extractUserFromResponse(data);
        hydrateStateFromUser(user);
    } catch (err) {
        console.error("loadUser error:", err);
    }
}

async function handleTap() {
    if (!userId || isTapping) return;
    isTapping = true;

    try {
        const data = await apiFetch("/api/tap", {
            method: "POST",
            body: JSON.stringify({ telegram_id: userId })
        });

        const user = extractUserFromResponse(data);
        if (!user) {
            console.warn("Tap response without user:", data);
            webAlert(t("tapFailed"));
        } else {
            hydrateStateFromUser(user);
        }
    } catch (err) {
        console.error("handleTap error:", err);
        webAlert(t("tapFailed"));
    } finally {
        isTapping = false;
    }
}

async function handleUpgradeTapPower() {
    if (!userId) return;

    if (gameState.coins < 100) {
        webAlert(t("notEnoughCoins"));
        return;
    }

    try {
        const data = await apiFetch("/api/upgrade_tap_power", {
            method: "POST",
            body: JSON.stringify({ telegram_id: userId })
        });
        const user = extractUserFromResponse(data);
        hydrateStateFromUser(user);
    } catch (err) {
        console.error("handleUpgradeTapPower error:", err);
    }
}

// --- Daily Tasks (şimdilik basic, sonra AdsGram ile doldurulabilir) ---

function openDailyTasks() {
    if (!dailyTasksModalEl || !tasksListEl) return;

    tasksListEl.innerHTML = "";

    const tasks = [
        { id: "watch_ad", labelEn: t("watchAd"), labelTr: t("watchAd") },
        { id: "invite", labelEn: t("inviteFriends"), labelTr: t("inviteFriends") },
        { id: "visit", labelEn: t("visitChannel"), labelTr: t("visitChannel") }
    ];

    tasks.forEach(task => {
        const li = document.createElement("li");
        li.className = "task-item";

        const span = document.createElement("span");
        span.textContent = currentLocale === "en" ? task.labelEn : task.labelTr;

        const btn = document.createElement("button");
        btn.className = "task-check-btn";
        btn.textContent = currentLocale === "en" ? "Go" : "Git";

        btn.addEventListener("click", () => {
            // Şimdilik sadece örnek – gerçek davranışlar sonradan AdsGram / referans linki ile bağlanacak
            if (task.id === "watch_ad") {
                webAlert("Rewarded ad integration will be added soon.");
            } else if (task.id === "invite") {
                if (tg && tg.openTelegramLink) {
                    tg.openTelegramLink(`https://t.me/share/url?url=t.me/${tg.initDataUnsafe?.user?.username || ""}`);
                } else {
                    webAlert("Share link will be available in Telegram.");
                }
            } else if (task.id === "visit") {
                if (tg && tg.openTelegramLink) {
                    tg.openTelegramLink("https://t.me/taptoearnton"); // Örnek kanal
                } else {
                    window.open("https://t.me/taptoearnton", "_blank");
                }
            }
        });

        li.appendChild(span);
        li.appendChild(btn);
        tasksListEl.appendChild(li);
    });

    dailyTasksModalEl.classList.add("modal-visible");
}

function closeDailyTasks() {
    if (dailyTasksModalEl) {
        dailyTasksModalEl.classList.remove("modal-visible");
    }
}

// --- Wallet & Leaderboard ---

function openWallet() {
    webAlert(t("walletSoon"));
}

async function openLeaderboard() {
    if (!leaderboardModalEl || !leaderboardListEl || !userId) return;

    leaderboardListEl.innerHTML = "";

    try {
        const data = await apiFetch(`/api/leaderboard?telegram_id=${encodeURIComponent(userId)}`, {
            method: "GET"
        });

        const players = data.leaderboard || data.players || [];
        const yourRank = data.your_rank ?? data.rank ?? null;

        players.forEach((p, index) => {
            const li = document.createElement("li");
            li.className = "leaderboard-item";

            const posSpan = document.createElement("span");
            posSpan.className = "leaderboard-pos";
            posSpan.textContent = `${index + 1}.`;

            const nameSpan = document.createElement("span");
            nameSpan.className = "leaderboard-name";
            nameSpan.textContent = p.username || p.name || `User ${index + 1}`;

            const scoreSpan = document.createElement("span");
            scoreSpan.className = "leaderboard-score";
            scoreSpan.textContent = `${p.total_coins ?? p.coins ?? 0}`;

            li.appendChild(posSpan);
            li.appendChild(nameSpan);
            li.appendChild(scoreSpan);

            leaderboardListEl.appendChild(li);
        });

        const rankInfo = $("yourRank");
        if (rankInfo && yourRank != null) {
            rankInfo.textContent = t("yourRank", yourRank);
        }

        leaderboardModalEl.classList.add("modal-visible");
    } catch (err) {
        console.error("openLeaderboard error:", err);
    }
}

function closeLeaderboard() {
    if (leaderboardModalEl) {
        leaderboardModalEl.classList.remove("modal-visible");
    }
}

// --- Event binding & init ---

function bindEvents() {
    if (tapButtonEl) {
        tapButtonEl.addEventListener("click", handleTap);
    }
    if (upgradeButtonEl) {
        upgradeButtonEl.addEventListener("click", handleUpgradeTapPower);
    }
    if (dailyTasksButtonEl) {
        dailyTasksButtonEl.addEventListener("click", openDailyTasks);
    }
    if (walletButtonEl) {
        walletButtonEl.addEventListener("click", openWallet);
    }
    if (leaderboardButtonEl) {
        leaderboardButtonEl.addEventListener("click", openLeaderboard);
    }
    if (closeTasksEl) {
        closeTasksEl.addEventListener("click", closeDailyTasks);
    }
    if (closeLeaderboardEl) {
        closeLeaderboardEl.addEventListener("click", closeLeaderboard);
    }
    if (langEnBtn) {
        langEnBtn.addEventListener("click", () => setLocale("en"));
    }
    if (langTrBtn) {
        langTrBtn.addEventListener("click", () => setLocale("tr"));
    }
}

document.addEventListener("DOMContentLoaded", () => {
    setLocale("en"); // varsayılan
    bindEvents();
    loadUser();
});

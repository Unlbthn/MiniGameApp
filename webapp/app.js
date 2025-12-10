// webapp/app.js

// ----- Global state -----
const state = {
    user: null,
    lang: "en",
    tapInFlight: false,
    telegramId: null,
};

// ----- Helpers -----
function getTelegramId() {
    try {
        const tg = window.Telegram?.WebApp;
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
            return tg.initDataUnsafe.user.id;
        }
    } catch (e) {
        console.error("Telegram WebApp error:", e);
    }
    return null;
}

function tgAlert(message) {
    try {
        const tg = window.Telegram?.WebApp;
        if (tg && tg.showAlert) {
            tg.showAlert(message);
            return;
        }
    } catch (e) {
        console.error("Telegram alert error:", e);
    }
    alert(message);
}

function bindClick(id, handler) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener("click", handler);
    }
}

function formatTon(ton) {
    if (ton == null) return "0.00";
    return Number(ton).toFixed(2);
}

// ----- API calls -----
async function apiGetMe() {
    if (!state.telegramId) return null;
    const resp = await fetch(`/api/me?telegram_id=${state.telegramId}`);
    if (!resp.ok) {
        throw new Error("Failed to load user");
    }
    const data = await resp.json();
    // /api/me bazen direkt user, bazen {user: {...}} dönebilir
    return data.user || data;
}

async function apiTap() {
    if (!state.telegramId) throw new Error("No telegram id");
    const resp = await fetch("/api/tap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_id: state.telegramId }),
    });
    if (!resp.ok) {
        throw new Error("Tap failed");
    }
    // Cevabı kullanmak zorunda değiliz, garanti için tekrar /api/me çağıracağız
}

async function apiUpgradeTapPower() {
    if (!state.telegramId) throw new Error("No telegram id");
    const resp = await fetch("/api/upgrade_tap_power", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_id: state.telegramId }),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
        throw new Error(data.error || "Upgrade failed");
    }
    return data.user || data;
}

async function apiGetTasks() {
    if (!state.telegramId) return [];
    const resp = await fetch(`/api/daily_tasks?telegram_id=${state.telegramId}`);
    if (!resp.ok) {
        throw new Error("Failed to load tasks");
    }
    const data = await resp.json();
    return data.tasks || data;
}

async function apiClaimTask(taskKey) {
    if (!state.telegramId) throw new Error("No telegram id");
    const resp = await fetch("/api/claim_task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_id: state.telegramId, task_key: taskKey }),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
        throw new Error(data.error || "Claim failed");
    }
    return {
        user: data.user || data,
        tasks: data.tasks || [],
    };
}

async function apiGetLeaderboard() {
    const resp = await fetch("/api/leaderboard");
    if (!resp.ok) throw new Error("Leaderboard failed");
    const data = await resp.json();
    return {
        top: data.top || [],
        you: data.you || null,
    };
}

// ----- UI update -----
function updateUserUI() {
    const u = state.user;
    if (!u) return;

    const levelEl = document.getElementById("levelValue");
    const coinsEl = document.getElementById("coinsValue");
    const tapPowerEl = document.getElementById("tapPowerValue");
    const tonCreditsEl = document.getElementById("tonCreditsValue");
    const nextLabelEl = document.getElementById("nextLevelLabel");
    const progressFill = document.getElementById("progressBarFill");

    if (levelEl) levelEl.textContent = u.level ?? 1;
    if (coinsEl) coinsEl.textContent = u.coins ?? 0;
    if (tapPowerEl) tapPowerEl.textContent = u.tap_power ?? 1;
    if (tonCreditsEl) tonCreditsEl.textContent = formatTon(u.ton_credits);

    const currentXp = u.current_xp ?? 0;
    const nextXp = u.next_level_xp ?? 1000;
    if (nextLabelEl) {
        nextLabelEl.textContent = `${currentXp} / ${nextXp}`;
    }
    const pct = Math.max(0, Math.min(100, (currentXp / nextXp) * 100));
    if (progressFill) {
        progressFill.style.width = `${pct}%`;
    }
}

function renderTasks(tasks) {
    const container = document.getElementById("tasksList");
    if (!container) return;
    if (!tasks || tasks.length === 0) {
        container.innerHTML =
            '<div class="task-item empty">No tasks available for now.</div>';
        return;
    }

    container.innerHTML = "";
    tasks.forEach((t) => {
        const row = document.createElement("div");
        row.className = "task-item";

        const info = document.createElement("div");
        info.className = "task-info";
        info.innerHTML = `
            <div class="task-title">${t.title || t.key}</div>
            <div class="task-desc">${t.description || ""}</div>
            <div class="task-reward">+${t.reward_coins || 0} coins${
            t.reward_ton ? ` • +${formatTon(t.reward_ton)} TON` : ""
        }</div>
        `;

        const actions = document.createElement("div");
        actions.className = "task-actions";

        const status = t.status || "pending";
        if (status === "completed") {
            const done = document.createElement("span");
            done.className = "task-status done";
            done.textContent = "Done";
            actions.appendChild(done);
        } else if (status === "claimed") {
            const claimed = document.createElement("span");
            claimed.className = "task-status claimed";
            claimed.textContent = "Claimed";
            actions.appendChild(claimed);
        } else {
            const goBtn = document.createElement("button");
            goBtn.className = "btn-task-go";
            goBtn.textContent = "Go";
            goBtn.addEventListener("click", () => {
                if (t.url) {
                    window.open(t.url, "_blank");
                } else {
                    tgAlert("Task link is not ready yet.");
                }
            });

            const claimBtn = document.createElement("button");
            claimBtn.className = "btn-task-claim";
            claimBtn.textContent = "Claim";
            claimBtn.addEventListener("click", async () => {
                try {
                    const { user, tasks: newTasks } = await apiClaimTask(t.key);
                    state.user = user;
                    updateUserUI();
                    renderTasks(newTasks);
                    tgAlert("Reward claimed!");
                } catch (e) {
                    console.error(e);
                    tgAlert(e.message || "Claim failed");
                }
            });

            actions.appendChild(goBtn);
            actions.appendChild(claimBtn);
        }

        row.appendChild(info);
        row.appendChild(actions);
        container.appendChild(row);
    });
}

function renderLeaderboard(top, you) {
    const modal = document.getElementById("leaderboardModal");
    const list = document.getElementById("leaderboardList");
    const youRow = document.getElementById("leaderboardYou");
    if (!modal || !list) return;

    list.innerHTML = "";
    top.forEach((u, idx) => {
        const row = document.createElement("div");
        row.className = "leaderboard-row";
        row.innerHTML = `
            <span class="lb-rank">${u.rank ?? idx + 1}</span>
            <span class="lb-name">${u.username || u.first_name || u.telegram_id}</span>
            <span class="lb-score">${u.total_coins ?? 0}</span>
        `;
        list.appendChild(row);
    });

    if (you && youRow) {
        youRow.innerHTML = `
            <span class="lb-rank">${you.rank}</span>
            <span class="lb-name">${you.username || you.first_name || you.telegram_id}</span>
            <span class="lb-score">${you.total_coins ?? 0}</span>
        `;
        youRow.style.display = "flex";
    }

    modal.classList.add("open");
}

// ----- Event handlers -----
async function handleTapClick() {
    if (!state.telegramId) {
        tgAlert("Telegram ID not found.");
        return;
    }
    if (state.tapInFlight) return;
    state.tapInFlight = true;
    try {
        await apiTap();          // coin ekleyen endpoint
        const user = await apiGetMe(); // en güncel değeri çek
        state.user = user;
        updateUserUI();
    } catch (e) {
        console.error(e);
        tgAlert("Tap failed, please try again.");
    } finally {
        state.tapInFlight = false;
    }
}

async function handleUpgradeClick() {
    try {
        const user = await apiUpgradeTapPower();
        state.user = user;
        updateUserUI();
        tgAlert("Tap power upgraded!");
    } catch (e) {
        console.error(e);
        tgAlert(e.message || "Not enough coins to upgrade tap power.");
    }
}

async function handleOpenTasks() {
    const modal = document.getElementById("tasksModal");
    if (!modal) return;
    try {
        const tasks = await apiGetTasks();
        renderTasks(tasks);
        modal.classList.add("open");
    } catch (e) {
        console.error(e);
        tgAlert("Failed to load daily tasks.");
    }
}

function handleCloseTasks() {
    const modal = document.getElementById("tasksModal");
    if (modal) modal.classList.remove("open");
}

async function handleOpenLeaderboard() {
    try {
        const { top, you } = await apiGetLeaderboard();
        renderLeaderboard(top, you);
    } catch (e) {
        console.error(e);
        tgAlert("Failed to load leaderboard.");
    }
}

function handleCloseLeaderboard() {
    const modal = document.getElementById("leaderboardModal");
    if (modal) modal.classList.remove("open");
}

function handleWalletClick() {
    tgAlert("TON wallet linking will be available soon.");
}

// ----- Init -----
async function initApp() {
    state.telegramId = getTelegramId();

    // Telegram tema ile uyum için
    try {
        const tg = window.Telegram?.WebApp;
        if (tg && tg.ready) {
            tg.ready();
            tg.expand();
        }
    } catch (e) {
        console.error(e);
    }

    // Event listener'lar
    bindClick("tapButton", handleTapClick);
    bindClick("upgradeButton", handleUpgradeClick);
    bindClick("dailyTasksButton", handleOpenTasks);
    bindClick("tasksClose", handleCloseTasks);
    bindClick("walletButton", handleWalletClick);
    bindClick("leaderboardButton", handleOpenLeaderboard);
    bindClick("leaderboardClose", handleCloseLeaderboard);

    // Başlangıçta kullanıcıyı çek
    try {
        const user = await apiGetMe();
        if (user) {
            state.user = user;
            updateUserUI();
        }
    } catch (e) {
        console.error(e);
        tgAlert("Failed to load user data.");
    }
}

document.addEventListener("DOMContentLoaded", initApp);

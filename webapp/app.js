// webapp/app.js
// Tap to Earn TON – Safe & Optimized Frontend

(function () {
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

    // ------- GLOBAL STATE -------
    let telegramId = null;

    const userState = {
        level: 1,
        coins: 0,
        tap_power: 1,
        ton_credits: 0,
        taps_since_last_ad: 0,
        next_level_cost: 1000, // level 1 -> 2 için varsayılan
        rank: null
    };

    // ------- DOM HELPERS -------
    function $(id) {
        return document.getElementById(id);
    }

    function setText(id, value) {
        const el = $(id);
        if (el) el.textContent = value;
    }

    function showToast(message) {
        if (tg && typeof tg.showAlert === "function") {
            tg.showAlert(message);
        } else {
            alert(message);
        }
    }

    function safeAddListener(id, event, handler) {
        const el = $(id);
        if (el) el.addEventListener(event, handler);
    }

    // ------- RENDER / UI -------
    function renderUser() {
        setText("level-value", userState.level);
        setText("coins-value", userState.coins);
        setText("tap-power-value", userState.tap_power);
        setText("ton-credits-value", userState.ton_credits.toFixed(2));

        // Seviye ilerleme çubuğu (0–1 arası progress)
        const progressBar = $("level-progress-inner");
        if (progressBar) {
            const currentLevelCost = userState.next_level_cost || 1000;
            // basit mantık: coin / cost (0 ile 1 arası)
            const progress = Math.max(
                0,
                Math.min(1, userState.coins / currentLevelCost)
            );
            progressBar.style.width = `${progress * 100}%`;
        }

        // Top 10 rank display
        const rankLabel = $("rank-footer-label");
        if (rankLabel) {
            if (userState.rank && userState.rank <= 10) {
                rankLabel.textContent = `You are #${userState.rank} in the Top 10`;
            } else if (userState.rank) {
                rankLabel.textContent = `You are #${userState.rank}`;
            } else {
                rankLabel.textContent = "";
            }
        }
    }

    // ------- API HELPERS -------
    async function apiGet(path) {
        const res = await fetch(path, {
            method: "GET",
            headers: {
                "Accept": "application/json"
            }
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`GET ${path} failed: ${res.status} ${text}`);
        }
        return res.json();
    }

    async function apiPost(path, bodyObj) {
        const res = await fetch(path, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(bodyObj)
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`POST ${path} failed: ${res.status} ${text}`);
        }
        return res.json();
    }

    // ------- INITIAL LOAD -------
    async function initUser() {
        try {
            if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
                telegramId = tg.initDataUnsafe.user.id;
            } else {
                // fallback – local test için
                telegramId = 123456;
            }

            const data = await apiGet(`/api/me?telegram_id=${telegramId}`);

            // backend UserOut yapısını userState'e map’liyoruz
            userState.level = data.level ?? userState.level;
            userState.coins = data.coins ?? userState.coins;
            userState.tap_power = data.tap_power ?? data.tapPower ?? userState.tap_power;
            userState.ton_credits = data.ton_credits ?? data.tonCredits ?? userState.ton_credits;
            userState.taps_since_last_ad = data.taps_since_last_ad ?? userState.taps_since_last_ad;
            userState.next_level_cost = data.next_level_cost ?? userState.next_level_cost;
            userState.rank = data.rank ?? null;

            renderUser();
        } catch (err) {
            console.error("initUser error:", err);
            showToast("User verisi alınamadı, lütfen tekrar deneyin.");
        }
    }

    // ------- TAP LOGIC -------
    async function handleTap() {
        try {
            if (!telegramId) {
                showToast("Telegram kullanıcı bilgisi alınamadı.");
                return;
            }

            const tapBtn = $("tap-button");
            if (tapBtn) tapBtn.disabled = true;

            const data = await apiPost("/api/tap", { telegram_id: telegramId });

            // response yine UserOut benzeri varsayılıyor
            userState.level = data.level ?? userState.level;
            userState.coins = data.coins ?? userState.coins;
            userState.tap_power = data.tap_power ?? data.tapPower ?? userState.tap_power;
            userState.ton_credits = data.ton_credits ?? data.tonCredits ?? userState.ton_credits;
            userState.taps_since_last_ad = data.taps_since_last_ad ?? userState.taps_since_last_ad;
            userState.next_level_cost = data.next_level_cost ?? userState.next_level_cost;

            renderUser();
        } catch (err) {
            console.error("tap error:", err);
            showToast("Tap failed, please try again.");
        } finally {
            const tapBtn = $("tap-button");
            if (tapBtn) tapBtn.disabled = false;
        }
    }

    // ------- UPGRADE (TAP POWER) -------
    async function handleUpgrade() {
        try {
            if (!telegramId) {
                showToast("Telegram kullanıcı bilgisi alınamadı.");
                return;
            }
            const upBtn = $("upgrade-button");
            if (upBtn) upBtn.disabled = true;

            const data = await apiPost("/api/upgrade", { telegram_id: telegramId });

            userState.level = data.level ?? userState.level;
            userState.coins = data.coins ?? userState.coins;
            userState.tap_power = data.tap_power ?? data.tapPower ?? userState.tap_power;
            userState.next_level_cost = data.next_level_cost ?? userState.next_level_cost;

            renderUser();
        } catch (err) {
            console.error("upgrade error:", err);
            showToast("Yükseltme yapılamadı, yeterli coin olmayabilir.");
        } finally {
            const upBtn = $("upgrade-button");
            if (upBtn) upBtn.disabled = false;
        }
    }

    // ------- DAILY CHEST -------
    async function handleDailyChest() {
        try {
            if (!telegramId) {
                showToast("Telegram kullanıcı bilgisi alınamadı.");
                return;
            }

            // Adsgram tetikleme (SDK yüklüyse)
            if (window.Sad && window.Sad.showRewarded) {
                window.Sad.showRewarded(
                    "17996", // reward block id
                    { userId: String(telegramId) },
                    async function (result) {
                        if (!result || !result.done) {
                            console.log("Reward ad not completed:", result);
                            showToast("Reklam tamamlanmadı.");
                            return;
                        }
                        try {
                            const data = await apiPost("/api/daily-chest", {
                                telegram_id: telegramId
                            });

                            userState.ton_credits = data.ton_credits ?? userState.ton_credits;
                            renderUser();
                            showToast("0.01 TON kredisi eklendi!");
                        } catch (err) {
                            console.error("daily chest claim error:", err);
                            showToast("Chest claim edilemedi, lütfen tekrar deneyin.");
                        }
                    }
                );
            } else {
                showToast("Reklam servisi şu anda uygun değil.");
            }
        } catch (err) {
            console.error("daily chest error:", err);
            showToast("İşlem başarısız, lütfen tekrar deneyin.");
        }
    }

    // ------- DAILY TASKS MODAL -------
    function openDailyTasks() {
        const modal = $("tasks-modal");
        if (!modal) return;
        modal.classList.add("visible");
    }

    function closeDailyTasks() {
        const modal = $("tasks-modal");
        if (!modal) return;
        modal.classList.remove("visible");
    }

    // Nodelar yoksa bile hata almamak için hepsini if’lerle koruyoruz
    async function handleTaskAction(taskKey, action) {
        try {
            if (!telegramId) {
                showToast("Telegram kullanıcı bilgisi alınamadı.");
                return;
            }
            const data = await apiPost(`/api/tasks/${action}`, {
                telegram_id: telegramId,
                task_key: taskKey
            });

            if (data && data.coins != null) {
                userState.coins = data.coins;
                renderUser();
            }

            // butonları UI’da kapatma
            const checkBtn = $(`${taskKey}-check-btn`);
            const claimBtn = $(`${taskKey}-claim-btn`);

            if (action === "check" && checkBtn) {
                checkBtn.disabled = true;
                checkBtn.textContent = "Checked";
            }
            if (action === "claim" && claimBtn) {
                claimBtn.disabled = true;
                claimBtn.textContent = "Claimed";
            }
        } catch (err) {
            console.error(`task ${action} error:`, err);
            showToast("Görev işlemi sırasında hata oluştu.");
        }
    }

    // ------- LEADERBOARD -------
    async function openLeaderboard() {
        try {
            const modal = $("leaderboard-modal");
            const list = $("leaderboard-list");
            const rankFooter = $("rank-footer-label");
            if (!modal || !list) return;

            list.innerHTML = "<li>Loading...</li>";
            modal.classList.add("visible");

            const data = await apiGet("/api/leaderboard");
            list.innerHTML = "";

            if (!Array.isArray(data.entries) || data.entries.length === 0) {
                list.innerHTML = "<li>No data yet.</li>";
            } else {
                data.entries.forEach((entry, idx) => {
                    const li = document.createElement("li");
                    li.className = "leaderboard-item";
                    li.textContent = `#${entry.rank || idx + 1} – ${entry.username || "User"} – ${entry.total_coins} coins`;
                    if (entry.telegram_id === telegramId) {
                        li.classList.add("me");
                    }
                    list.appendChild(li);
                });
            }

            if (data.user_rank) {
                userState.rank = data.user_rank;
                if (rankFooter) {
                    rankFooter.textContent =
                        data.user_rank <= 10
                            ? `You are #${data.user_rank} in Top 10`
                            : `You are #${data.user_rank}`;
                }
            }

        } catch (err) {
            console.error("leaderboard error:", err);
            showToast("Leaderboard alınamadı.");
        }
    }

    function closeLeaderboard() {
        const modal = $("leaderboard-modal");
        if (!modal) return;
        modal.classList.remove("visible");
    }

    // ------- WALLET CONNECT -------
    function openWallet() {
        // Şimdilik sadece bilgi mesajı; ileride TON Connect entegre edersin
        showToast("Coming soon: TON wallet bağlama ekranı.");
    }

    // ------- LANGUAGE SWITCH -------
    function setLanguage(lang) {
        const root = document.documentElement;
        root.setAttribute("data-lang", lang);

        const enBtn = $("lang-en");
        const trBtn = $("lang-tr");
        if (enBtn && trBtn) {
            enBtn.classList.toggle("active", lang === "en");
            trBtn.classList.toggle("active", lang === "tr");
        }
    }

    // ------- INIT SCRIPT -------
    document.addEventListener("DOMContentLoaded", function () {
        try {
            if (tg) {
                tg.ready();
                tg.expand();
            }

            // Event bindings (hepsi safeAddListener ile)
            safeAddListener("tap-button", "click", handleTap);
            safeAddListener("upgrade-button", "click", handleUpgrade);

            safeAddListener("daily-chest-button", "click", handleDailyChest);
            safeAddListener("daily-tasks-button", "click", openDailyTasks);
            safeAddListener("tasks-close-btn", "click", closeDailyTasks);

            safeAddListener("leaderboard-open-btn", "click", openLeaderboard);
            safeAddListener("leaderboard-close-btn", "click", closeLeaderboard);

            safeAddListener("wallet-icon", "click", openWallet);
            safeAddListener("trophy-icon", "click", openLeaderboard);

            safeAddListener("lang-en", "click", () => setLanguage("en"));
            safeAddListener("lang-tr", "click", () => setLanguage("tr"));

            // Örnek görev butonları, varsa
            safeAddListener("task-invite-check-btn", "click", () =>
                handleTaskAction("task-invite", "check")
            );
            safeAddListener("task-invite-claim-btn", "click", () =>
                handleTaskAction("task-invite", "claim")
            );

            // Varsayılan dili EN yap
            setLanguage("en");

            // Kullanıcı verisini yükle
            initUser();
        } catch (err) {
            console.error("global init error:", err);
            showToast("Uygulama başlatılırken hata oluştu.");
        }
    });
})();

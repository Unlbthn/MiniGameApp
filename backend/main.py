from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

import os
from datetime import datetime, timedelta

from .db import get_db, engine
from .models import Base, User, TaskStatus

# ---------------------------
# INIT
# ---------------------------
Base.metadata.create_all(bind=engine)

app = FastAPI()

# ---------------------------
# STATIC FILES
# ---------------------------
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "webapp")

app.mount(
    "/static",
    StaticFiles(directory=STATIC_DIR),
    name="static"
)

# ---------------------------
# CORS (Telegram Mini App için gerekli)
# ---------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_headers=["*"],
    allow_methods=["*"]
)

# -----------------------------------------
# LEVEL-UP SYSTEM
# Level = (Toplam Coins + Tap Power * 10) // 500
# Her upgrade veya tap'ten sonra güncellenir
# -----------------------------------------
def calculate_level(user: User) -> int:
    xp = user.coins + (user.tap_power * 10)
    return max(1, xp // 500)


# -----------------------------------------
# GET /api/me
# -----------------------------------------
@app.get("/api/me")
def get_me(telegram_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.telegram_id == telegram_id).first()

    if not user:
        user = User(
            telegram_id=telegram_id,
            coins=0,
            total_coins=0,
            level=1,
            tap_power=1,
            ton_credits=0.0,
            turbo_end=None,
            referrals=0
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return {
        "telegram_id": user.telegram_id,
        "coins": user.coins,
        "total_coins": user.total_coins,
        "level": user.level,
        "tap_power": user.tap_power,
        "ton_credits": round(user.ton_credits or 0.0, 3),
        "turbo_active": bool(user.turbo_end and user.turbo_end > datetime.utcnow()),
        "turbo_end": user.turbo_end.isoformat() if user.turbo_end else None,
        "referrals": user.referrals or 0
    }


# -----------------------------------------
# POST /api/tap (Turbo + Level-Up)
# -----------------------------------------
@app.post("/api/tap")
def tap(data: dict, db: Session = Depends(get_db)):
    telegram_id = data.get("telegram_id")
    if telegram_id is None:
        raise HTTPException(400, "telegram_id required")

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    # Turbo aktifse 2x
    turbo_multiplier = 2 if (user.turbo_end and user.turbo_end > datetime.utcnow()) else 1

    gained = user.tap_power * turbo_multiplier
    user.coins += gained
    user.total_coins += gained

    # LEVEL UPDATE
    user.level = calculate_level(user)

    db.commit()
    db.refresh(user)

    return {"ok": True, "user": user}


# -----------------------------------------
# POST /api/upgrade/tap_power
# -----------------------------------------
@app.post("/api/upgrade/tap_power")
def upgrade_tap_power(data: dict, db: Session = Depends(get_db)):
    telegram_id = data.get("telegram_id")
    if telegram_id is None:
        raise HTTPException(400, "telegram_id required")

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    cost = user.tap_power * 100
    if user.coins < cost:
        raise HTTPException(400, "NOT_ENOUGH_COINS")

    user.coins -= cost
    user.tap_power += 1

    # LEVEL UPDATE
    user.level = calculate_level(user)

    db.commit()
    db.refresh(user)

    return {"ok": True, "user": user}


# -----------------------------------------
# 🎬 DAILY TON CHEST (Reward Ad)
# /api/reward/ad
# Şu an: 0.01 TON verir – günlük 10 limit
# (istersen sonra 1'e düşürebiliriz)
# -----------------------------------------
@app.post("/api/reward/ad")
def reward_ad(data: dict, db: Session = Depends(get_db)):
    telegram_id = data.get("telegram_id")
    if telegram_id is None:
        raise HTTPException(400, "telegram_id required")

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    today = datetime.utcnow().date()
    # last_ad_date farklı bir günse sayaç reset
    count = user.daily_ads_count if (user.last_ad_date == today) else 0

    if count >= 10:
        raise HTTPException(400, "DAILY_LIMIT_REACHED")

    # TON ödülü
    user.ton_credits = (user.ton_credits or 0.0) + 0.01
    user.last_ad_date = today
    user.daily_ads_count = count + 1

    db.commit()
    db.refresh(user)

    return {
        "ok": True,
        "remaining": 10 - user.daily_ads_count,
        "user": user
    }


# -----------------------------------------
# 💰 EXTRA COINS BOOST
# /api/boost/coins
#
# - Bir rewarded video sonrası çağrılacak şekilde tasarlandı
# - Günlük 5 kez kullanılabilir
# - Her seferinde +2000 coins verir
# - User modelinde aşağıdaki alanları eklemen gerekir:
#   extra_boost_count: Integer, nullable=True, default=0
#   extra_boost_last_date: Date, nullable=True
# -----------------------------------------
@app.post("/api/boost/coins")
def coins_boost(data: dict, db: Session = Depends(get_db)):
    telegram_id = data.get("telegram_id")
    if telegram_id is None:
        raise HTTPException(400, "telegram_id required")

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    today = datetime.utcnow().date()

    # Yeni gün mü? Sayaç reset
    if not user.extra_boost_last_date or user.extra_boost_last_date != today:
        current_count = 0
    else:
        current_count = user.extra_boost_count or 0

    DAILY_LIMIT = 5
    REWARD_COINS = 2000

    if current_count >= DAILY_LIMIT:
        raise HTTPException(400, "BOOST_LIMIT_REACHED")

    user.coins += REWARD_COINS
    user.total_coins += REWARD_COINS

    # Level güncelle
    user.level = calculate_level(user)

    # Sayaç güncelle
    user.extra_boost_last_date = today
    user.extra_boost_count = current_count + 1

    db.commit()
    db.refresh(user)

    return {
        "ok": True,
        "reward": REWARD_COINS,
        "remaining": DAILY_LIMIT - user.extra_boost_count,
        "user": user
    }


# -----------------------------------------
# 🎁 TURBO BOOST (5 dk, günde 3 hakkı var)
# /api/turbo/activate
# -----------------------------------------
@app.post("/api/turbo/activate")
def turbo_activate(data: dict, db: Session = Depends(get_db)):
    telegram_id = data.get("telegram_id")
    if telegram_id is None:
        raise HTTPException(400, "telegram_id required")

    user = db.query(User).filter(User.telegram_id == telegram_id).first()

    if not user:
        raise HTTPException(404, "User not found")

    today = datetime.utcnow().date()
    count = user.daily_turbo_count if (user.last_turbo_date == today) else 0

    if count >= 3:
        raise HTTPException(400, "TURBO_LIMIT_REACHED")

    user.turbo_end = datetime.utcnow() + timedelta(minutes=5)
    user.last_turbo_date = today
    user.daily_turbo_count = count + 1

    db.commit()
    db.refresh(user)

    return {
        "ok": True,
        "turbo_active": True,
        "expires": user.turbo_end.isoformat(),
        "remaining": 3 - user.daily_turbo_count
    }


# -----------------------------------------
# 📌 REFERRAL TRACKING
# /api/referral/register
# -----------------------------------------
@app.post("/api/referral/register")
def referral_register(data: dict, db: Session = Depends(get_db)):
    ref_id = data.get("ref")
    new_user_id = data.get("telegram_id")

    if not new_user_id:
        raise HTTPException(400, "telegram_id required")

    if not ref_id or ref_id == new_user_id:
        return {"ok": False, "reason": "invalid"}

    ref_user = db.query(User).filter(User.telegram_id == ref_id).first()
    new_user = db.query(User).filter(User.telegram_id == new_user_id).first()

    if not ref_user or not new_user:
        return {"ok": False}

    if new_user.referred_by:
        return {"ok": False, "reason": "duplicate"}

    new_user.referred_by = ref_id
    ref_user.referrals = (ref_user.referrals or 0) + 1

    db.commit()

    return {"ok": True}


# -----------------------------------------
# TASKS: GET STATUS
# -----------------------------------------
@app.get("/api/tasks/status")
def get_task_status(telegram_id: int, db: Session = Depends(get_db)):
    tasks = (
        db.query(TaskStatus)
        .filter(TaskStatus.telegram_id == telegram_id)
        .all()
    )
    return [{"task_id": t.task_id, "status": t.status} for t in tasks]


# -----------------------------------------
# TASK: CHECK
# -----------------------------------------
@app.post("/api/tasks/check")
def task_check(data: dict, db: Session = Depends(get_db)):
    task_id = data.get("task_id")
    telegram_id = data.get("telegram_id")

    if not task_id or not telegram_id:
        raise HTTPException(400, "task_id and telegram_id required")

    entry = (
        db.query(TaskStatus)
        .filter(TaskStatus.telegram_id == telegram_id, TaskStatus.task_id == task_id)
        .first()
    )
    if not entry:
        entry = TaskStatus(
            telegram_id=telegram_id,
            task_id=task_id,
            status="checked"
        )
        db.add(entry)
    else:
        entry.status = "checked"

    db.commit()
    return {"ok": True, "task_status": "checked"}


# -----------------------------------------
# TASK: CLAIM
# -----------------------------------------
@app.post("/api/tasks/claim")
def task_claim(data: dict, db: Session = Depends(get_db)):
    telegram_id = data.get("telegram_id")
    task_id = data.get("task_id")

    if not task_id or not telegram_id:
        raise HTTPException(400, "task_id and telegram_id required")

    entry = (
        db.query(TaskStatus)
        .filter(TaskStatus.telegram_id == telegram_id, TaskStatus.task_id == task_id)
        .first()
    )

    if not entry or entry.status != "checked":
        raise HTTPException(400, "TASK_NOT_READY")

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    reward = 1000  # İstersen task_id'ye göre dinamik yapabiliriz
    user.coins += reward
    user.total_coins += reward

    entry.status = "claimed"

    # LEVEL UPDATE
    user.level = calculate_level(user)

    db.commit()
    db.refresh(user)

    return {
        "ok": True,
        "task_status": "claimed",
        "reward_coins": reward,
        "user": user
    }


# -----------------------------------------
# SERVE FRONTEND
# -----------------------------------------
@app.get("/", response_class=HTMLResponse)
def web_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

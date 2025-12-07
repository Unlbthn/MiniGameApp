from datetime import datetime, date, timedelta
import os
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .db import SessionLocal, engine, Base
from .models import User, TaskStatus


# -----------------------------------------------------------------------------
# Veritabanı init
# -----------------------------------------------------------------------------
Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -----------------------------------------------------------------------------
# FastAPI app
# -----------------------------------------------------------------------------
app = FastAPI(title="Tap to Earn TON API")

# CORS – Railway ve Telegram WebApp için serbest bırakalım
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Statik dosyalar (index.html / styles.css / app.js)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEBAPP_DIR = os.path.join(BASE_DIR, "webapp")

app.mount("/static", StaticFiles(directory=WEBAPP_DIR), name="static")


# -----------------------------------------------------------------------------
# Yardımcı fonksiyonlar
# -----------------------------------------------------------------------------
DAILY_AD_LIMIT = 10          # Daily TON Chest video sayısı
DAILY_TURBO_LIMIT = 2        # günde 2 kere turbo
TURBO_MINUTES = 5            # turbo süresi (dakika)
AD_REWARD_TON = 0.1          # reklam başına TON birimi (credits)
TAP_AD_INTERVAL = 100        # 100 tap'te bir reklam (frontend tarafında tetikleniyor)


def get_or_create_user(db: Session, telegram_id: int) -> User:
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if user:
        maybe_reset_daily(user)
        return user

    # Yeni kullanıcı
    user = User(
        telegram_id=telegram_id,
        level=1,
        coins=0,
        tap_power=1,
        ton_credits=0.0,
        daily_ad_views=0,
        daily_turbo_uses=0,
    )
    # basit referans kodu
    user.ref_code = f"T{telegram_id}"
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def maybe_reset_daily(user: User) -> None:
    """Gün değiştiyse günlük sayaçları sıfırla."""
    today = date.today()
    if user.last_daily_reset is None or user.last_daily_reset != today:
        user.last_daily_reset = today
        user.daily_ad_views = 0
        user.daily_turbo_uses = 0


def is_turbo_active(user: User) -> bool:
    if not user.turbo_until:
        return False
    return datetime.utcnow() < user.turbo_until


def add_xp_and_maybe_level_up(user: User, added_coins: int) -> None:
    """
    Level mantığı:
      Level 1 → 0–999 XP
      Level 2 → 1000–2999 XP
      Level 3 → 3000–5999 XP
      Level 4 → 6000–9999 XP
      ...
      Kısaca: Level n için gereken toplam XP = n*(n-1)/2 * 1000
    """
    if user.total_xp is None:
        user.total_xp = 0

    user.total_xp += added_coins

    # Hangi level olması gerektiğini hesapla
    new_level = user.level or 1
    xp = user.total_xp

    # Basit sınır: max 100 level diyelim
    for lvl in range(1, 101):
        required = (lvl * (lvl - 1) // 2) * 1000
        if xp >= required:
            new_level = lvl
        else:
            break

    user.level = max(1, new_level)


def user_to_dict(user: User) -> dict:
    turbo_active = is_turbo_active(user)
    turbo_remaining = 0
    if turbo_active:
        turbo_remaining = int((user.turbo_until - datetime.utcnow()).total_seconds())

    return {
        "telegram_id": user.telegram_id,
        "level": user.level,
        "coins": user.coins,
        "tap_power": user.tap_power,
        "ton_credits": float(user.ton_credits or 0),
        "turbo_active": turbo_active,
        "turbo_remaining": turbo_remaining,
        "daily_ad_views": user.daily_ad_views or 0,
        "daily_turbo_uses": user.daily_turbo_uses or 0,
    }


# -----------------------------------------------------------------------------
# Önyüz / statik routing
# -----------------------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
def serve_index() -> HTMLResponse:
    index_path = os.path.join(WEBAPP_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="index.html bulunamadı")
    return HTMLResponse(open(index_path, "r", encoding="utf-8").read())


@app.get("/index.html", response_class=HTMLResponse)
def serve_index_html() -> HTMLResponse:
    return serve_index()


# -----------------------------------------------------------------------------
# API: Kullanıcı
# -----------------------------------------------------------------------------
@app.get("/api/me")
def get_me(telegram_id: int = Query(...), db: Session = Depends(get_db)):
    user = get_or_create_user(db, telegram_id)
    db.commit()
    return user_to_dict(user)


@app.post("/api/tap")
def tap(
    payload: dict,
    db: Session = Depends(get_db),
):
    telegram_id = int(payload.get("telegram_id"))
    taps = int(payload.get("taps", 1))

    if taps <= 0:
        raise HTTPException(status_code=400, detail="taps must be > 0")

    user = get_or_create_user(db, telegram_id)

    turbo_multiplier = 2 if is_turbo_active(user) else 1
    gained = taps * user.tap_power * turbo_multiplier

    user.coins += gained
    add_xp_and_maybe_level_up(user, gained)

    db.commit()
    db.refresh(user)
    return {"user": user_to_dict(user)}


@app.post("/api/upgrade/tap_power")
def upgrade_tap_power(payload: dict, db: Session = Depends(get_db)):
    telegram_id = int(payload.get("telegram_id"))
    user = get_or_create_user(db, telegram_id)

    cost = user.tap_power * 100
    if user.coins < cost:
        raise HTTPException(status_code=400, detail="NOT_ENOUGH_COINS")

    user.coins -= cost
    user.tap_power += 1
    db.commit()
    db.refresh(user)

    return {"user": user_to_dict(user), "cost": cost}


# -----------------------------------------------------------------------------
# API: Reklam ödülü (Daily TON Chest)
# -----------------------------------------------------------------------------
@app.post("/api/reward/ad")
def reward_ad(payload: dict, db: Session = Depends(get_db)):
    telegram_id = int(payload.get("telegram_id"))
    user = get_or_create_user(db, telegram_id)
    maybe_reset_daily(user)

    if user.daily_ad_views >= DAILY_AD_LIMIT:
        db.commit()
        raise HTTPException(status_code=400, detail="DAILY_LIMIT_REACHED")

    user.daily_ad_views += 1
    user.ton_credits = (user.ton_credits or 0) + AD_REWARD_TON

    db.commit()
    db.refresh(user)

    remaining = DAILY_AD_LIMIT - user.daily_ad_views
    return {
        "user": user_to_dict(user),
        "remaining": max(0, remaining),
        "added": AD_REWARD_TON,
    }


# -----------------------------------------------------------------------------
# API: Turbo Boost (sadece görevden tetikleniyor)
# -----------------------------------------------------------------------------
@app.post("/api/turbo/activate")
def activate_turbo(payload: dict, db: Session = Depends(get_db)):
    telegram_id = int(payload.get("telegram_id"))
    user = get_or_create_user(db, telegram_id)
    maybe_reset_daily(user)

    if user.daily_turbo_uses >= DAILY_TURBO_LIMIT:
        db.commit()
        raise HTTPException(status_code=400, detail="DAILY_TURBO_LIMIT")

    user.daily_turbo_uses += 1
    user.turbo_until = datetime.utcnow() + timedelta(minutes=TURBO_MINUTES)

    db.commit()
    db.refresh(user)
    return {"user": user_to_dict(user)}


# -----------------------------------------------------------------------------
# API: Görevler
# -----------------------------------------------------------------------------
@app.get("/api/tasks/status")
def get_task_statuses(
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Frontend'de tanımlı TASKS listesiyle uyumlu olacak şekilde status döner."""
    _ = get_or_create_user(db, telegram_id)

    rows: List[TaskStatus] = (
        db.query(TaskStatus).filter(TaskStatus.telegram_id == telegram_id).all()
    )

    return [
        {"task_id": row.task_id, "status": row.status}
        for row in rows
    ]


@app.post("/api/tasks/check")
def check_task(payload: dict, db: Session = Depends(get_db)):
    telegram_id = int(payload.get("telegram_id"))
    task_id = payload.get("task_id")
    if not task_id:
        raise HTTPException(status_code=400, detail="task_id required")

    user = get_or_create_user(db, telegram_id)

    row = (
        db.query(TaskStatus)
        .filter(
            TaskStatus.telegram_id == telegram_id,
            TaskStatus.task_id == task_id,
        )
        .first()
    )
    if not row:
        row = TaskStatus(
            telegram_id=telegram_id,
            task_id=task_id,
            status="checked",
            updated_at=datetime.utcnow(),
        )
        db.add(row)
    else:
        row.status = "checked"
        row.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(user)
    db.refresh(row)

    return {
        "task_id": task_id,
        "task_status": row.status,
    }


@app.post("/api/tasks/claim")
def claim_task(payload: dict, db: Session = Depends(get_db)):
    telegram_id = int(payload.get("telegram_id"))
    task_id = payload.get("task_id")
    if not task_id:
        raise HTTPException(status_code=400, detail="task_id required")

    user = get_or_create_user(db, telegram_id)

    row = (
        db.query(TaskStatus)
        .filter(
            TaskStatus.telegram_id == telegram_id,
            TaskStatus.task_id == task_id,
        )
        .first()
    )

    if not row or row.status != "checked":
        raise HTTPException(status_code=400, detail="TASK_NOT_READY")

    # Ödül miktarlarını task_id üzerinden belirleyelim
    reward_coins = 0
    reward_ton = 0.0

    if task_id == "affiliate_boinker":
        reward_coins = 1000
    elif task_id == "affiliate_dotcoin":
        reward_coins = 1000
    elif task_id == "affiliate_bbqcoin":
        reward_coins = 1000
    elif task_id == "invite_friends":
        reward_ton = 0.02
    elif task_id == "turbo_task":
        # Turbo görevinde ödül turbo; coins vermiyoruz, sadece aktif et
        user.turbo_until = datetime.utcnow() + timedelta(minutes=TURBO_MINUTES)

    # Ödülleri ekle
    if reward_coins:
        user.coins += reward_coins
        add_xp_and_maybe_level_up(user, reward_coins)
    if reward_ton:
        user.ton_credits = (user.ton_credits or 0) + reward_ton

    row.status = "claimed"
    row.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(user)
    db.refresh(row)

    return {
        "task_id": task_id,
        "task_status": row.status,
        "reward_coins": reward_coins,
        "reward_ton": reward_ton,
        "user": user_to_dict(user),
    }


# -----------------------------------------------------------------------------
# API: Leaderboard
# -----------------------------------------------------------------------------
@app.get("/api/leaderboard/top")
def get_leaderboard(
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
):
    users = (
        db.query(User)
        .order_by(User.coins.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "telegram_id": u.telegram_id,
            "level": u.level,
            "coins": u.coins,
            "tap_power": u.tap_power,
        }
        for u in users
    ]


# -----------------------------------------------------------------------------
# API: Invite Link
# -----------------------------------------------------------------------------
BOT_USERNAME = os.getenv("BOT_USERNAME", "TaptoEarnTonBot")


@app.get("/api/invite_link")
def get_invite_link(
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
):
    user = get_or_create_user(db, telegram_id)
    if not user.ref_code:
        user.ref_code = f"T{telegram_id}"
        db.commit()
        db.refresh(user)

    link = f"https://t.me/{BOT_USERNAME}?start={user.ref_code}"
    return {"invite_link": link}

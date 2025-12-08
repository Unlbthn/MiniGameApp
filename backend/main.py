from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from datetime import datetime, timedelta
import os
from typing import Optional, List

from .db import SessionLocal, engine, Base
from .models import User, TaskStatus

# -------------------------------------------------
# FastAPI & DB
# -------------------------------------------------

app = FastAPI(title="Tap to Earn TON")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -------------------------------------------------
# Helpers & constants
# -------------------------------------------------

DAILY_AD_LIMIT = 10
AD_REWARD_TON = 0.1

TURBO_MULTIPLIER = 2
TURBO_DURATION_SECONDS = 600  # 10 dakika
DAILY_TURBO_LIMIT = 3


def get_or_create_user(db: Session, telegram_id: int) -> User:
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        user = User(
            telegram_id=telegram_id,
            level=1,
            coins=0,
            tap_power=1,
            ton_credits=0.0,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def refresh_turbo_state(user: User):
    """Turbo süresi bittiyse pasif yap."""
    now = datetime.utcnow()
    if user.turbo_expires_at and user.turbo_expires_at <= now:
        user.turbo_active = False
        user.turbo_expires_at = None


def user_to_dict(user: User) -> dict:
    refresh_turbo_state(user)
    now = datetime.utcnow()
    turbo_remaining = 0
    if user.turbo_expires_at and user.turbo_expires_at > now:
        turbo_remaining = int((user.turbo_expires_at - now).total_seconds())

    return {
        "telegram_id": user.telegram_id,
        "level": user.level,
        "coins": user.coins,
        "tap_power": user.tap_power,
        "ton_credits": float(user.ton_credits or 0),
        "turbo_active": bool(user.turbo_active),
        "turbo_remaining": turbo_remaining,
    }


# -------------------------------------------------
# API: User & game logic
# -------------------------------------------------

@app.get("/api/me", response_model=dict)
def get_me(telegram_id: int, db: Session = Depends(get_db)):
    user = get_or_create_user(db, telegram_id)
    return user_to_dict(user)


@app.post("/api/tap")
def tap(payload: dict, db: Session = Depends(get_db)):
    telegram_id = int(payload.get("telegram_id"))
    taps = int(payload.get("taps", 1))

    user = get_or_create_user(db, telegram_id)
    refresh_turbo_state(user)

    effective_power = user.tap_power
    if user.turbo_active:
        effective_power *= TURBO_MULTIPLIER

    gained = taps * effective_power
    user.coins += gained

    # basit level sistemi: required = level * 1000
    required = user.level * 1000
    while user.coins >= required:
        user.level += 1
        required = user.level * 1000

    db.commit()
    db.refresh(user)
    return {"user": user_to_dict(user), "gained": gained}


@app.post("/api/upgrade/tap_power")
def upgrade_tap_power(payload: dict, db: Session = Depends(get_db)):
    telegram_id = int(payload.get("telegram_id"))
    user = get_or_create_user(db, telegram_id)

    cost = user.tap_power * 100  # 1→100, 2→200...
    if user.coins < cost:
        raise HTTPException(status_code=400, detail="NOT_ENOUGH_COINS")

    user.coins -= cost
    user.tap_power += 1

    db.commit()
    db.refresh(user)
    return {"user": user_to_dict(user), "cost": cost}


# -------------------------------------------------
# AdsGram reward (video izleme → TON)
# -------------------------------------------------

@app.post("/api/reward/ad")
def reward_ad(
    payload: Optional[dict] = None,
    telegram_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Hem:
      - POST JSON: { "telegram_id": 123 }
      - GET/POST ?telegram_id=123
    formatlarını destekler.
    Böylece AdsGram server callback + frontend isteği aynı endpointi kullanabilir.
    """
    if payload and "telegram_id" in payload:
        telegram_id = int(payload["telegram_id"])
    elif telegram_id is not None:
        telegram_id = int(telegram_id)

    if telegram_id is None:
        raise HTTPException(status_code=400, detail="TELEGRAM_ID_REQUIRED")

    user = get_or_create_user(db, telegram_id)

    # Günlük limit reset
    today = datetime.utcnow().date()
    if user.last_ad_view_at is None or user.last_ad_view_at.date() != today:
        user.daily_ad_views = 0

    if user.daily_ad_views >= DAILY_AD_LIMIT:
        raise HTTPException(status_code=400, detail="DAILY_LIMIT_REACHED")

    user.daily_ad_views += 1
    user.ton_credits = (user.ton_credits or 0) + AD_REWARD_TON
    user.last_ad_view_at = datetime.utcnow()

    db.commit()
    db.refresh(user)
    remaining = DAILY_AD_LIMIT - user.daily_ad_views
    return {
        "user": user_to_dict(user),
        "remaining": remaining,
        "reward_ton": AD_REWARD_TON,
    }


# -------------------------------------------------
# Tasks (Daily Tasks + Invite + Turbo)
# -------------------------------------------------

@app.get("/api/tasks/status")
def task_status(telegram_id: int, db: Session = Depends(get_db)) -> List[dict]:
    rows = (
        db.query(TaskStatus)
        .filter(TaskStatus.telegram_id == telegram_id)
        .all()
    )
    return [{"task_id": r.task_id, "status": r.status} for r in rows]


@app.post("/api/tasks/check")
def check_task(payload: dict, db: Session = Depends(get_db)):
    telegram_id = int(payload.get("telegram_id"))
    task_id = payload.get("task_id")

    user = get_or_create_user(db, telegram_id)

    row = (
        db.query(TaskStatus)
        .filter(TaskStatus.telegram_id == telegram_id, TaskStatus.task_id == task_id)
        .first()
    )
    if not row:
        row = TaskStatus(
            telegram_id=telegram_id,
            task_id=task_id,
            status="checked",
        )
        db.add(row)
    else:
        row.status = "checked"

    db.commit()
    return {"task_status": row.status}


@app.post("/api/tasks/claim")
def claim_task(payload: dict, db: Session = Depends(get_db)):
    telegram_id = int(payload.get("telegram_id"))
    task_id = payload.get("task_id")

    user = get_or_create_user(db, telegram_id)

    row = (
        db.query(TaskStatus)
        .filter(TaskStatus.telegram_id == telegram_id, TaskStatus.task_id == task_id)
        .first()
    )
    if not row or row.status != "checked":
        raise HTTPException(status_code=400, detail="TASK_NOT_READY")

    reward_coins = 0
    reward_ton = 0.0

    if task_id == "affiliate_boinker":
        reward_coins = 1000
        user.coins += reward_coins
    elif task_id == "invite_friends":
        reward_ton = 0.02
        user.ton_credits = (user.ton_credits or 0) + reward_ton
    elif task_id == "turbo_task":
        # Turbo görevi → 10 dakika turbo
        now = datetime.utcnow()
        user.turbo_active = True
        user.turbo_expires_at = now + timedelta(seconds=TURBO_DURATION_SECONDS)

    row.status = "claimed"

    db.commit()
    db.refresh(user)
    return {
        "task_status": row.status,
        "user": user_to_dict(user),
        "reward_coins": reward_coins,
        "reward_ton": reward_ton,
    }


# Turbo endpoint alias (gerekirse başka yerden çağırmak için)
@app.post("/api/turbo/activate")
def activate_turbo(payload: dict, db: Session = Depends(get_db)):
    telegram_id = int(payload.get("telegram_id"))
    user = get_or_create_user(db, telegram_id)

    now = datetime.utcnow()

    # Günlük limit için user.daily_turbo_count gibi bir alanın olduğunu varsayıyoruz;
    # yoksa burayı ileride genişletiriz.
    if hasattr(user, "daily_turbo_count") and hasattr(user, "last_turbo_at"):
        if user.last_turbo_at is None or user.last_turbo_at.date() != now.date():
            user.daily_turbo_count = 0
        if user.daily_turbo_count >= DAILY_TURBO_LIMIT:
            raise HTTPException(status_code=400, detail="DAILY_TURBO_LIMIT")
        user.daily_turbo_count += 1
        user.last_turbo_at = now

    user.turbo_active = True
    user.turbo_expires_at = now + timedelta(seconds=TURBO_DURATION_SECONDS)

    db.commit()
    db.refresh(user)
    return {"user": user_to_dict(user)}


@app.post("/api/turbo/start")
def turbo_start(payload: dict, db: Session = Depends(get_db)):
    """Eski frontend /api/turbo/start çağırıyorsa bozulmasın diye alias."""
    return activate_turbo(payload, db)


# -------------------------------------------------
# Static files & root
# -------------------------------------------------

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEBAPP_DIR = os.path.join(BASE_DIR, "webapp")

app.mount("/static", StaticFiles(directory=WEBAPP_DIR), name="static")


@app.get("/", response_class=HTMLResponse)
def serve_index():
    index_path = os.path.join(WEBAPP_DIR, "index.html")
    return FileResponse(index_path)

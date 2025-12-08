from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from datetime import datetime, timedelta

import os

from .db import SessionLocal, engine, Base
from .models import User, TaskStatus

# -------------------------------------------------------------------
# APP INIT
# -------------------------------------------------------------------

app = FastAPI()

Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="webapp"), name="static")

# -------------------------------------------------------------------
# DB SESSION
# -------------------------------------------------------------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# -------------------------------------------------------------------
# USER INIT / GET
# -------------------------------------------------------------------

@app.get("/api/me")
def get_user(telegram_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(telegram_id=telegram_id).first()

    if not user:
        user = User(
            telegram_id=telegram_id,
            coins=0,
            total_coins=0,
            level=1,
            xp=0,
            next_level_xp=1000,
            tap_power=1,
            ton_credits=0.0,
            referrals=0,
            referred_by=None,
            last_tap=datetime.utcnow(),
            last_daily_chest=None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return user

# -------------------------------------------------------------------
# TAP API (Fix: çalışmama sorunu giderildi)
# -------------------------------------------------------------------

@app.post("/api/tap")
def tap(telegram_id: int, taps: int = 1, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(telegram_id=telegram_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="USER_NOT_FOUND")

    gained = taps * user.tap_power
    user.coins += gained
    user.total_coins += gained
    user.xp += gained

    # LEVEL-UP SYSTEM
    while user.xp >= user.next_level_xp:
        user.level += 1
        user.xp -= user.next_level_xp
        user.next_level_xp = int(user.next_level_xp * 1.5)

    db.commit()
    db.refresh(user)

    return {"user": user}

# -------------------------------------------------------------------
# UPGRADE TAP POWER
# -------------------------------------------------------------------

@app.post("/api/upgrade/tap_power")
def upgrade_tap_power(data: dict, db: Session = Depends(get_db)):
    telegram_id = data.get("telegram_id")
    user = db.query(User).filter_by(telegram_id=telegram_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="USER_NOT_FOUND")

    cost = user.tap_power * 100

    if user.coins < cost:
        raise HTTPException(status_code=400, detail="NOT_ENOUGH_COINS")

    user.coins -= cost
    user.tap_power += 1
    db.commit()
    db.refresh(user)

    return {"user": user}

# -------------------------------------------------------------------
# DAILY TON CHEST — günde 10 reklam izleme
# -------------------------------------------------------------------

@app.post("/api/reward/ad")
def reward_ad(data: dict, db: Session = Depends(get_db)):
    telegram_id = data.get("telegram_id")
    user = db.query(User).filter_by(telegram_id=telegram_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="USER_NOT_FOUND")

    now = datetime.utcnow()
    if not user.last_daily_chest:
        user.last_daily_chest = now
        user.daily_ads_count = 0

    # yeni güne geçtiyse resetle
    if user.last_daily_chest.date() != now.date():
        user.daily_ads_count = 0
        user.last_daily_chest = now

    if user.daily_ads_count >= 10:
        raise HTTPException(status_code=400, detail="DAILY_LIMIT_REACHED")

    user.daily_ads_count += 1
    user.ton_credits += 0.01

    db.commit()
    db.refresh(user)

    remaining = 10 - user.daily_ads_count
    return {
        "user": user,
        "remaining": remaining
    }

# -------------------------------------------------------------------
# REFERRAL SYSTEM (Invite Friends)
# -------------------------------------------------------------------

@app.get("/api/referral/use")
def referral_use(user_id: int, ref: int, db: Session = Depends(get_db)):
    if user_id == ref:
        return {"status": "ignored"}

    user = db.query(User).filter_by(telegram_id=user_id).first()
    ref_user = db.query(User).filter_by(telegram_id=ref).first()

    if not user or not ref_user:
        return {"status": "ignored"}

    # sadece 1 kez say
    if user.referred_by is None:
        user.referred_by = ref
        ref_user.referrals += 1
        ref_user.ton_credits += 0.02
        db.commit()

    return {"status": "ok"}

# -------------------------------------------------------------------
# DAILY TASK CHECK + CLAIM
# -------------------------------------------------------------------

@app.get("/api/tasks/status")
def get_task_status(telegram_id: int, db: Session = Depends(get_db)):
    tasks = db.query(TaskStatus).filter_by(telegram_id=telegram_id).all()
    return tasks


@app.post("/api/tasks/check")
def check_task(data: dict, db: Session = Depends(get_db)):
    telegram_id = data.get("telegram_id")
    task_id = data.get("task_id")

    record = db.query(TaskStatus).filter_by(
        telegram_id=telegram_id, task_id=task_id
    ).first()

    if not record:
        record = TaskStatus(
            telegram_id=telegram_id, task_id=task_id, status="checked"
        )
        db.add(record)
    else:
        record.status = "checked"

    db.commit()
    return {"task_status": "checked"}


@app.post("/api/tasks/claim")
def claim_task(data: dict, db: Session = Depends(get_db)):
    telegram_id = data.get("telegram_id")
    task_id = data.get("task_id")

    record = db.query(TaskStatus).filter_by(
        telegram_id=telegram_id, task_id=task_id
    ).first()

    if not record or record.status != "checked":
        raise HTTPException(status_code=400, detail="TASK_NOT_READY")

    record.status = "claimed"

    # ödül ver
    user = db.query(User).filter_by(telegram_id=telegram_id).first()
    user.coins += 1000

    db.commit()
    return {"task_status": "claimed", "reward_coins": 1000}

# -------------------------------------------------------------------
# LEADERBOARD (Top 10 + user rank) — %100 çalışan final sürüm
# -------------------------------------------------------------------

@app.get("/api/leaderboard")
def leaderboard(telegram_id: int, db: Session = Depends(get_db)):
    top10 = (
        db.query(User)
        .order_by(desc(User.total_coins))
        .limit(10)
        .all()
    )

    # user rank
    user_rank = (
        db.query(func.count(User.id))
        .filter(User.total_coins > db.query(User.total_coins).filter_by(telegram_id=telegram_id).scalar())
        .scalar()
    ) + 1

    return {
        "top10": top10,
        "user_rank": user_rank
    }

# -------------------------------------------------------------------
# ROOT (Serves the Mini App)
# -------------------------------------------------------------------

@app.get("/{full_path:path}", response_class=HTMLResponse)
def serve_app(full_path: str):
    return FileResponse("webapp/index.html")

from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import os

from .db import SessionLocal, engine, Base
from .models import User, TaskStatus

# ----------------------------------------------------------------------
# FASTAPI APP
# ----------------------------------------------------------------------
app = FastAPI()

# Statik dosyalar (app.js / styles.css)
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "webapp")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# ----------------------------------------------------------------------
# CORSMiddleware
# ----------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------------------------
# DB Dependency
# ----------------------------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ----------------------------------------------------------------------
# Utility – Level Calculation
# ----------------------------------------------------------------------
def get_level_requirements(level: int):
    """
    Level 0 → 1: 1000 coins
    Level 1 → 2: 2000 coins
    Level 2 → 3: 3000 coins ...
    """
    return (level + 1) * 1000


def try_level_up(user: User):
    required = get_level_requirements(user.level)
    if user.coins >= required:
        user.level += 1
        return True
    return False


# ----------------------------------------------------------------------
# ROUTE → GET /api/me
# ----------------------------------------------------------------------
@app.get("/api/me")
def get_me(telegram_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        # New user → create
        user = User(
            telegram_id=telegram_id,
            coins=0,
            tap_power=1,
            ton_credits=0.0,
            level=0,
            last_daily_reset=datetime.utcnow(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


# ----------------------------------------------------------------------
# ROUTE → POST /api/tap
# ----------------------------------------------------------------------
@app.post("/api/tap")
def tap(telegram_id: int, taps: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    user.coins += taps * user.tap_power

    # LEVEL UP CHECK
    try_level_up(user)

    db.commit()
    return {"user": user}


# ----------------------------------------------------------------------
# ROUTE → POST /api/upgrade/tap_power
# ----------------------------------------------------------------------
@app.post("/api/upgrade/tap_power")
def upgrade_tap_power(telegram_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    cost = user.tap_power * 100
    if user.coins < cost:
        raise HTTPException(400, "NOT_ENOUGH_COINS")

    user.coins -= cost
    user.tap_power += 1

    # Level check
    try_level_up(user)

    db.commit()
    return {"user": user}


# ----------------------------------------------------------------------
# DAILY TON CHEST → WATCH AD REWARD
# Limit = 10 per day
# Reward = +0.01 TON
# ----------------------------------------------------------------------
@app.post("/api/reward/ad")
def reward_ad(telegram_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    now = datetime.utcnow()
    last_reset = user.last_daily_reset or now

    # New day reset
    if (now - last_reset).days >= 1:
        user.daily_ad_count = 0
        user.last_daily_reset = now

    # Daily limit
    if user.daily_ad_count >= 10:
        raise HTTPException(400, "DAILY_LIMIT_REACHED")

    # Give reward
    user.daily_ad_count += 1
    user.ton_credits += 0.01

    db.commit()
    return {"user": user, "remaining": 10 - user.daily_ad_count}


# ----------------------------------------------------------------------
# TASK STATUS HELPERS
# ----------------------------------------------------------------------
@app.get("/api/tasks/status")
def get_task_status(telegram_id: int, db: Session = Depends(get_db)):
    entries = db.query(TaskStatus).filter(TaskStatus.telegram_id == telegram_id).all()
    return entries


@app.post("/api/tasks/check")
def check_task(data: dict, db: Session = Depends(get_db)):
    telegram_id = data["telegram_id"]
    task_id = data["task_id"]

    status = db.query(TaskStatus).filter(
        TaskStatus.telegram_id == telegram_id,
        TaskStatus.task_id == task_id
    ).first()

    if not status:
        status = TaskStatus(telegram_id=telegram_id, task_id=task_id, status="checked")
        db.add(status)
    else:
        status.status = "checked"

    db.commit()
    return {"task_status": status.status}


@app.post("/api/tasks/claim")
def claim_task(data: dict, db: Session = Depends(get_db)):
    telegram_id = data["telegram_id"]
    task_id = data["task_id"]

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    status = db.query(TaskStatus).filter(
        TaskStatus.telegram_id == telegram_id,
        TaskStatus.task_id == task_id
    ).first()

    if not status or status.status != "checked":
        raise HTTPException(400, "TASK_NOT_READY")

    reward = 1000  # default
    user.coins += reward
    status.status = "claimed"

    try_level_up(user)

    db.commit()
    return {"task_status": status.status, "reward_coins": reward, "user": user}


# ----------------------------------------------------------------------
# REFERRAL SYSTEM
# /api/ref/register?ref=CODE&telegram_id=123
# ----------------------------------------------------------------------
@app.post("/api/ref/register")
def register_ref(ref: str, telegram_id: int, db: Session = Depends(get_db)):
    # For now, just prepare the structure
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    user.referred_by = ref
    db.commit()
    return {"status": "ok"}


# ----------------------------------------------------------------------
# FRONTEND FILE SERVING
# ----------------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
def serve_index():
    file_path = os.path.join(STATIC_DIR, "index.html")
    return FileResponse(file_path)


@app.get("/{full_path:path}")
def catch_all(full_path: str):
    # Always return index.html for SPA behaviour
    file_path = os.path.join(STATIC_DIR, "index.html")
    return FileResponse(file_path)

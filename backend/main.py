# backend/main.py

from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.orm import Session
from .db import SessionLocal
from .models import User, TaskStatus
import os

# -----------------------------------------------------
# LEVEL SİSTEMİ AYARLARI
# -----------------------------------------------------

LEVEL_STEP = 1000  # 1000 total_coins = +1 level


def recalc_level(user: User):
    """toplam coin'e göre otomatik level hesaplama"""
    if user.total_coins is None:
        user.total_coins = 0

    new_level = 1 + (user.total_coins // LEVEL_STEP)

    if new_level < 1:
        new_level = 1

    # seviyeyi güncelle
    if user.level != new_level:
        user.level = int(new_level)


# -----------------------------------------------------
# FastAPI App
# -----------------------------------------------------

app = FastAPI()


# -----------------------------------------------------
# DATABASE DEPENDENCY
# -----------------------------------------------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -----------------------------------------------------
# STATIC FILES (index.html / styles.css / app.js)
# -----------------------------------------------------

@app.get("/", response_class=HTMLResponse)
def get_index():
    return FileResponse("webapp/index.html")


@app.get("/styles.css")
def get_css():
    return FileResponse("webapp/styles.css")


@app.get("/app.js")
def get_js():
    return FileResponse("webapp/app.js")


# -----------------------------------------------------
# USER: CREATE / GET
# -----------------------------------------------------

@app.get("/api/me")
def get_me(telegram_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.telegram_id == telegram_id).first()

    if not user:
        # Yeni kullanıcı oluştur
        user = User(
            telegram_id=telegram_id,
            coins=0,
            total_coins=0,
            level=1,
            tap_power=1,
            ton_credits=0.0,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Güvenlik
    if user.tap_power is None or user.tap_power < 1:
        user.tap_power = 1
        db.commit()

    return user


# -----------------------------------------------------
# TAP ✦ Kullanıcı tık yaptığında
# -----------------------------------------------------

@app.post("/api/tap")
def tap_action(data: dict, db: Session = Depends(get_db)):
    telegram_id = data["telegram_id"]
    taps = data.get("taps", 1)

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # tap_power asla 1’in altına düşmesin
    if user.tap_power is None or user.tap_power < 1:
        user.tap_power = 1

    gained = taps * user.tap_power

    # coin + total_coins güncelle
    user.coins += gained
    user.total_coins = (user.total_coins or 0) + gained

    # level hesapla
    recalc_level(user)

    db.commit()
    db.refresh(user)

    return {"user": user}


# -----------------------------------------------------
# TAP POWER UPGRADE
# -----------------------------------------------------

@app.post("/api/upgrade/tap_power")
def upgrade_tap_power(data: dict, db: Session = Depends(get_db)):
    telegram_id = data["telegram_id"]

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # güvenlik
    if user.tap_power is None or user.tap_power < 1:
        user.tap_power = 1

    cost = user.tap_power * 100

    if user.coins < cost:
        raise HTTPException(status_code=400, detail="NOT_ENOUGH_COINS")

    # satın alma işlemi
    user.coins -= cost
    user.tap_power += 1

    db.commit()
    db.refresh(user)
    return {"user": user}


# -----------------------------------------------------
# AD REWARD (0.01 TON credit)
# -----------------------------------------------------

@app.post("/api/reward/ad")
def reward_ad(data: dict, db: Session = Depends(get_db)):
    telegram_id = data["telegram_id"]

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # günlük limit kontrolü
    from datetime import datetime, date
    today = date.today()

    watched_today = db.query(TaskStatus).filter(
        TaskStatus.telegram_id == telegram_id,
        TaskStatus.task_id == "reward_video",
        TaskStatus.updated_date == str(today),
    ).first()

    if watched_today and watched_today.value >= 10:
        raise HTTPException(status_code=400, detail="DAILY_LIMIT_REACHED")

    # yeni kayıt
    if not watched_today:
        watched_today = TaskStatus(
            telegram_id=telegram_id,
            task_id="reward_video",
            value=0,
            updated_date=str(today),
            status="checked"
        )
        db.add(watched_today)

    watched_today.value += 1
    user.ton_credits += 0.01

    db.commit()
    db.refresh(user)

    return {
        "user": user,
        "remaining": 10 - watched_today.value
    }


# -----------------------------------------------------
# TASK STATUS GET
# -----------------------------------------------------

@app.get("/api/tasks/status")
def get_task_status(telegram_id: int, db: Session = Depends(get_db)):
    rows = db.query(TaskStatus).filter(TaskStatus.telegram_id == telegram_id).all()
    return rows


# -----------------------------------------------------
# TASK CHECK
# -----------------------------------------------------

@app.post("/api/tasks/check")
def task_check(data: dict, db: Session = Depends(get_db)):
    telegram_id = data["telegram_id"]
    task_id = data["task_id"]

    task = db.query(TaskStatus).filter(
        TaskStatus.telegram_id == telegram_id,
        TaskStatus.task_id == task_id
    ).first()

    if not task:
        task = TaskStatus(
            telegram_id=telegram_id,
            task_id=task_id,
            status="checked",
            value=0
        )
        db.add(task)
    else:
        task.status = "checked"

    db.commit()
    return {"task_status": "checked"}


# -----------------------------------------------------
# TASK CLAIM
# -----------------------------------------------------

@app.post("/api/tasks/claim")
def task_claim(data: dict, db: Session = Depends(get_db)):
    telegram_id = data["telegram_id"]
    task_id = data["task_id"]

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    task = db.query(TaskStatus).filter(
        TaskStatus.telegram_id == telegram_id,
        TaskStatus.task_id == task_id
    ).first()

    if not task or task.status != "checked":
        raise HTTPException(status_code=400, detail="TASK_NOT_READY")

    # Ödül
    reward = 1000
    user.coins += reward

    task.status = "claimed"

    db.commit()
    db.refresh(user)

    return {
        "task_status": "claimed",
        "reward_coins": reward,
        "user": user
    }

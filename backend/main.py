from fastapi import FastAPI, Depends, HTTPException, Body
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from sqlalchemy.orm import Session
import os

from .db import SessionLocal, engine, Base
from .models import User, TaskStatus

# -------------------------------------------------------------------
# Database
# -------------------------------------------------------------------
Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# -------------------------------------------------------------------
# FastAPI App
# -------------------------------------------------------------------
app = FastAPI()

# Static folder
app.mount("/static", StaticFiles(directory="webapp"), name="static")

# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------
def get_or_create_user(db: Session, telegram_id: int):
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        user = User(
            telegram_id=telegram_id,
            coins=0,
            tap_power=1,
            ton_credits=0.0,
            level=1,
            total_taps=0
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def user_to_dict(user: User):
    return {
        "telegram_id": user.telegram_id,
        "coins": user.coins,
        "tap_power": user.tap_power,
        "ton_credits": float(user.ton_credits or 0),
        "level": user.level,
        "total_taps": user.total_taps or 0,
    }

# -------------------------------------------------------------------
# Routes
# -------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
def index():
    return FileResponse("webapp/index.html")

@app.get("/api/me")
def get_me(telegram_id: int, db: Session = Depends(get_db)):
    user = get_or_create_user(db, telegram_id)
    return user_to_dict(user)

# -------------------------------------------------------------------
# FIXED TAP ENDPOINT
# -------------------------------------------------------------------
@app.post("/api/tap")
def tap(payload: dict = Body(...), db: Session = Depends(get_db)):
    telegram_id_raw = payload.get("telegram_id")
    taps_raw = payload.get("taps", 1)

    if telegram_id_raw is None:
        raise HTTPException(status_code=400, detail="telegram_id is required")

    try:
        telegram_id = int(telegram_id_raw)
    except:
        raise HTTPException(status_code=400, detail="invalid telegram_id")

    try:
        taps = int(taps_raw or 1)
    except:
        taps = 1

    if taps < 1:
        taps = 1
    if taps > 100:
        taps = 100

    user = get_or_create_user(db, telegram_id)

    gained = user.tap_power * taps
    user.coins += gained

    user.total_taps = (user.total_taps or 0) + taps

    db.commit()
    db.refresh(user)

    return {"user": user_to_dict(user)}

# -------------------------------------------------------------------
# Daily TON Chest (Rewarded Ads)
# -------------------------------------------------------------------
@app.post("/api/reward/ad")
def reward_ad(payload: dict = Body(...), db: Session = Depends(get_db)):
    telegram_id = payload.get("telegram_id")
    if telegram_id is None:
        raise HTTPException(status_code=400, detail="telegram_id required")

    user = get_or_create_user(db, telegram_id)

    # günlük limit
    if user.daily_ad_count >= 10:
        raise HTTPException(status_code=400, detail="DAILY_LIMIT_REACHED")

    user.daily_ad_count += 1
    user.ton_credits += 0.01

    db.commit()
    db.refresh(user)

    return {
        "user": user_to_dict(user),
        "remaining": 10 - user.daily_ad_count
    }

# -------------------------------------------------------------------
# LEADERBOARD (Top 10 + user's rank)
# -------------------------------------------------------------------
@app.get("/api/leaderboard")
def leaderboard(telegram_id: int, db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.coins.desc()).all()

    top10 = [
        {"telegram_id": u.telegram_id, "coins": u.coins}
        for u in users[:10]
    ]

    # Rank hesaplama
    rank = None
    for index, u in enumerate(users, start=1):
        if u.telegram_id == telegram_id:
            rank = index
            break

    return {"top10": top10, "rank": rank}


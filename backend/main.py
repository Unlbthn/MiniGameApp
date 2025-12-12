from __future__ import annotations

import os
from datetime import datetime, date
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, Depends, HTTPException, Body
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .db import SessionLocal, engine, Base
from .models import User

# --- DB init ---
Base.metadata.create_all(bind=engine)

app = FastAPI(title="TapToEarnTON API")

# --- Static (WebApp) ---
def _pick_static_dir() -> str:
    here = os.path.dirname(__file__)
    candidates = [
        os.path.join(here, "..", "webapp"),
        os.path.join(here, "webapp"),
        os.path.join(here, ".."),
        here,
    ]
    for d in candidates:
        if os.path.isfile(os.path.join(d, "index.html")):
            return os.path.abspath(d)
    # Son çare: ../webapp
    return os.path.abspath(os.path.join(here, "..", "webapp"))

static_dir = _pick_static_dir()
app.mount("/static", StaticFiles(directory=static_dir), name="static")


# ---------------------- DB SESSION ----------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------- Schemas ----------------------
class TapRequest(BaseModel):
    telegram_id: int


class MeResponse(BaseModel):
    telegram_id: int
    name: Optional[str] = None
    level: int
    coins: int
    total_coins: int
    tap_power: int
    ton_credits: float
    current_xp: int
    next_level_xp: int


def _user_to_payload(user: User) -> Dict[str, Any]:
    return {
        "telegram_id": user.telegram_id,
        "name": user.name,
        "level": user.level,
        "coins": user.coins,
        "total_coins": user.total_coins,
        "tap_power": user.tap_power,
        "ton_credits": float(user.ton_credits or 0.0),
        "current_xp": user.xp,
        "next_level_xp": user.next_level_xp,
    }


def _maybe_level_up(user: User) -> None:
    # Basit seviye mantığı: xp >= next_level_xp ise level atla,
    # hedef xp her levelda +1000 artıyor.
    while user.xp >= user.next_level_xp:
        user.xp -= user.next_level_xp
        user.level += 1
        user.next_level_xp += 1000


# ---------------------- USER CREATE / GET ----------------------
def get_or_create_user(db: Session, telegram_id: int, name: str | None = None) -> User:
    user = db.query(User).filter(User.telegram_id == telegram_id).first()

    if not user:
        user = User(
            telegram_id=telegram_id,
            name=name or "Player",
            level=1,
            xp=0,
            next_level_xp=1000,
            coins=0,
            total_coins=0,
            tap_power=1,
            ton_credits=0.0,
            last_tap_at=None,
            last_chest_date=None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    if name and user.name != name:
        user.name = name
        db.commit()
        db.refresh(user)

    return user


# ---------------------- ROUTES ----------------------
@app.get("/")
def serve_index():
    index_path = os.path.join(static_dir, "index.html")
    return FileResponse(index_path)


@app.get("/api/me")
def get_me(telegram_id: int, name: str | None = None, db: Session = Depends(get_db)):
    user = get_or_create_user(db, telegram_id=telegram_id, name=name)
    return _user_to_payload(user)


@app.post("/api/tap")
def tap(payload: TapRequest, db: Session = Depends(get_db)):
    user = get_or_create_user(db, telegram_id=payload.telegram_id)

    user.coins += user.tap_power
    user.total_coins += user.tap_power
    user.xp += 1
    user.last_tap_at = datetime.utcnow()

    _maybe_level_up(user)

    # İstersen ton_credits mantığını sonradan değiştirirsin
    # (şimdilik total_coins üzerinden örnek)
    user.ton_credits = float(user.total_coins) / 10000.0

    db.commit()
    db.refresh(user)
    return _user_to_payload(user)


@app.post("/api/upgrade_tap_power")
def upgrade_tap_power(payload: TapRequest, db: Session = Depends(get_db)):
    user = get_or_create_user(db, telegram_id=payload.telegram_id)

    cost = 100
    if user.coins < cost:
        raise HTTPException(status_code=400, detail="Not enough coins")

    user.coins -= cost
    user.tap_power += 1

    db.commit()
    db.refresh(user)
    return _user_to_payload(user)


@app.get("/api/leaderboard")
def leaderboard(telegram_id: int | None = None, db: Session = Depends(get_db)):
    top = db.query(User).order_by(User.total_coins.desc()).limit(10).all()
    leaderboard_rows = [
        {"name": (u.name or f"User {u.telegram_id}"), "total_coins": u.total_coins, "coins": u.coins}
        for u in top
    ]

    your_rank = None
    if telegram_id is not None:
        # rank = kaç kişi senden daha fazla total_coins'a sahip + 1
        me = db.query(User).filter(User.telegram_id == telegram_id).first()
        if me:
            higher = db.query(User).filter(User.total_coins > me.total_coins).count()
            your_rank = higher + 1

    return {"leaderboard": leaderboard_rows, "your_rank": your_rank}

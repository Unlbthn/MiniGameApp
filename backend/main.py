from __future__ import annotations

import os
import json
from datetime import datetime
from typing import Optional, Dict, Any, List

import requests
from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo

try:
    from .db import SessionLocal, engine, Base
    from .models import User, AppState
except ImportError:  # running as single-folder (no package)
    from db import SessionLocal, engine, Base
    from models import User, AppState

# -------------------- DB init --------------------
Base.metadata.create_all(bind=engine)

# -------------------- App --------------------
app = FastAPI(title="TapToEarnTON API (v2)")

# -------------------- Cache-Control (avoid Telegram Web caching static aggressively) --------------------
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class NoStoreStaticMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/static/"):
            # Telegram Web can cache aggressively; disable for rapid iteration
            response.headers["Cache-Control"] = "no-store"
        return response


app.add_middleware(NoStoreStaticMiddleware)


APP_TZ = os.getenv("APP_TZ", "Europe/Istanbul")


def _today() -> datetime.date:
    return datetime.now(ZoneInfo(APP_TZ)).date()


def _yearweek(d: datetime.date) -> int:
    iso = d.isocalendar()
    return int(iso.year) * 100 + int(iso.week)


# -------------------- Static (WebApp) --------------------
def _pick_static_dir() -> str:
    here = os.path.dirname(__file__)
    candidates = [
        os.path.abspath(os.path.join(here, "..", "webapp")),
        os.path.abspath(os.path.join(here, "webapp")),
        os.path.abspath(here),
        os.path.abspath(os.path.join(here, "..")),
    ]
    for d in candidates:
        if os.path.isfile(os.path.join(d, "index.html")):
            return d
    return os.path.abspath(os.path.join(here, "..", "webapp"))


static_dir = _pick_static_dir()
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
def serve_index():
    return FileResponse(os.path.join(static_dir, "index.html"))


# -------------------- DB Session --------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -------------------- Helpers --------------------
def _maybe_level_up(user: User) -> int:
    """Returns how many levels were gained."""
    gained = 0
    while user.xp >= user.next_level_xp:
        user.xp -= user.next_level_xp
        user.level += 1
        user.next_level_xp += 1000
        user.ton_credits = round(user.ton_credits + 0.1, 4)  # +0.1 TON credit per level
        gained += 1
    return gained


def get_or_create_user(db: Session, telegram_id: int, name: Optional[str] = None, language: Optional[str] = None) -> User:
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        user = User(telegram_id=telegram_id, name=name or None)
        if language:
            user.language = language
        user.daily_tasks_date = _today()
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # update name if provided and empty
        if name and (not user.name):
            user.name = name
        if language and user.language != language:
            user.language = language
        if user.daily_tasks_date is None:
            user.daily_tasks_date = _today()
        db.commit()
        db.refresh(user)
    return user


def _get_state_locked(db: Session) -> AppState:
    q = db.query(AppState).filter(AppState.id == 1)
    # On Postgres this locks row; on sqlite it's ignored (fine for single instance)
    state = q.with_for_update().first()
    if not state:
        state = AppState(id=1)
        db.add(state)
        db.commit()
        state = q.with_for_update().first()
    return state


def ensure_resets(db: Session) -> None:
    """Daily reset (tasks/adwatch) and Weekly reset (leaderboard + reward)."""
    today = _today()
    yw = _yearweek(today)

    state = _get_state_locked(db)

    # Daily reset (at first request after midnight)
    if state.last_daily_reset != today:
        # Reset per-user daily fields
        db.query(User).update(
            {
                User.daily_ad_watched: 0,
                User.daily_tasks_claimed: "[]",
                User.daily_tasks_date: today,
            }
        )
        state.last_daily_reset = today

    # Weekly reset (at first request of a new ISO week)
    if state.last_weekly_reset_yearweek != yw:
        # Award last week's winner BEFORE clearing scores
        winner = db.query(User).order_by(User.weekly_score.desc()).first()
        if winner and winner.weekly_score > 0:
            winner.ton_credits = round(winner.ton_credits + 0.5, 4)  # weekly prize
            state.last_weekly_winner_telegram_id = winner.telegram_id
            state.last_weekly_awarded_at = datetime.utcnow()

        # Reset weekly scores
        db.query(User).update({User.weekly_score: 0})
        state.last_weekly_reset_yearweek = yw

    db.commit()


def _user_payload(user: User) -> Dict[str, Any]:
    return {
        "telegram_id": user.telegram_id,
        "name": user.name,
        "language": user.language,
        "level": user.level,
        "xp": user.xp,
        "next_level_xp": user.next_level_xp,
        "coins": user.coins,
        "total_coins": user.total_coins,
        "tap_power": user.tap_power,
        "total_taps": user.total_taps,
        "weekly_score": user.weekly_score,
        "ton_credits": round(float(user.ton_credits), 4),
        "daily_ad_watched": user.daily_ad_watched,
        "sound_enabled": user.sound_enabled,
        "vibration_enabled": user.vibration_enabled,
        "notifications_enabled": user.notifications_enabled,
        "wallet_address": user.wallet_address,
    }


# -------------------- Telegram checks (for real task verification) --------------------
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")


def tg_get_chat_member(chat_id: int | str, user_id: int) -> Dict[str, Any]:
    if not BOT_TOKEN:
        raise HTTPException(500, "TELEGRAM_BOT_TOKEN is not set on the server")
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/getChatMember"
    r = requests.get(url, params={"chat_id": chat_id, "user_id": user_id}, timeout=8)
    data = r.json()
    if not data.get("ok"):
        raise HTTPException(400, f"Telegram API error: {data}")
    return data["result"]


# -------------------- Config: Daily Tasks --------------------
# NOTE:
# - join_chat tasks can be verified via getChatMember (REAL check).
# - open_link tasks are "soft" checks (click-based). For real check you'd need deep-link start params + bot-side logging.
QUOTE_PEER_ID = 3253869429
QUOTE_CHAT_ID = int(f"-100{QUOTE_PEER_ID}")

TASKS: List[Dict[str, Any]] = [
    {
        "id": "join_quote_channel",
        "title_tr": "Quote Masters kanalına katıl",
        "title_en": "Join Quote Masters channel",
        "type": "join_chat",
        "chat_id": QUOTE_CHAT_ID,
        "url": "https://web.telegram.org/k/#-3253869429",
        "reward_coins": 250,
    },
    {
        "id": "open_quotemasters_bot",
        "title_tr": "@QuoteMastersBot'u aç",
        "title_en": "Open @QuoteMastersBot",
        "type": "open_link",
        "url": "https://t.me/QuoteMastersBot",
        "reward_coins": 150,
    },
    {
        "id": "play_boinkers",
        "title_tr": "Boinkers oyna (@boinker_bot)",
        "title_en": "Play Boinkers (@boinker_bot)",
        "type": "open_link",
        "url": "https://t.me/boinker_bot",
        "reward_coins": 150,
    },
]

AD_WATCH_LIMIT = 10
AD_WATCH_REWARD_TON = 0.1


# -------------------- Schemas --------------------
class MeRequest(BaseModel):
    telegram_id: int
    name: Optional[str] = None
    language: Optional[str] = None


class TapRequest(BaseModel):
    telegram_id: int
    name: Optional[str] = None
    language: Optional[str] = None


class UpgradeRequest(BaseModel):
    telegram_id: int


class TaskCheckRequest(BaseModel):
    telegram_id: int
    task_id: str
    # for soft-check tasks
    open_age_sec: Optional[int] = None


class AdWatchedRequest(BaseModel):
    telegram_id: int


class SettingsRequest(BaseModel):
    telegram_id: int
    language: Optional[str] = None
    sound_enabled: Optional[bool] = None
    vibration_enabled: Optional[bool] = None
    notifications_enabled: Optional[bool] = None
    wallet_address: Optional[str] = None


# -------------------- API --------------------
@app.post("/api/me")
def me(payload: MeRequest, db: Session = Depends(get_db)):
    ensure_resets(db)
    user = get_or_create_user(db, telegram_id=payload.telegram_id, name=payload.name, language=payload.language)
    return {"user": _user_payload(user)}


@app.post("/api/tap")
def tap(payload: TapRequest, db: Session = Depends(get_db)):
    ensure_resets(db)
    user = get_or_create_user(db, telegram_id=payload.telegram_id, name=payload.name, language=payload.language)

    user.coins += user.tap_power
    user.total_coins += user.tap_power
    user.total_taps += 1
    user.weekly_score += user.tap_power

    user.xp += 1
    user.last_tap_at = datetime.utcnow()

    _maybe_level_up(user)

    db.commit()
    db.refresh(user)
    return {"user": _user_payload(user)}


@app.post("/api/upgrade_tap_power")
def upgrade_tap_power(payload: UpgradeRequest, db: Session = Depends(get_db)):
    ensure_resets(db)
    user = db.query(User).filter(User.telegram_id == payload.telegram_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    # Cost: 500, 1000, 1500 ... (based on current tap_power)
    cost = 500 * user.tap_power
    if user.coins < cost:
        raise HTTPException(400, "Not enough coins")

    user.coins -= cost
    user.tap_power += 1

    db.commit()
    db.refresh(user)
    return {"user": _user_payload(user), "upgrade_cost": 500 * user.tap_power}


@app.get("/api/leaderboard")
def leaderboard(scope: str = "weekly", telegram_id: Optional[int] = None, db: Session = Depends(get_db)):
    ensure_resets(db)

    scope = (scope or "weekly").lower()
    if scope not in ("weekly", "all_time"):
        raise HTTPException(400, "scope must be weekly or all_time")

    if scope == "weekly":
        top = db.query(User).order_by(User.weekly_score.desc()).limit(10).all()
        rows = [{"name": (u.name or f"User {u.telegram_id}"), "score": u.weekly_score, "level": u.level} for u in top]
        your_rank = None
        if telegram_id is not None:
            me_u = db.query(User).filter(User.telegram_id == telegram_id).first()
            if me_u:
                higher = db.query(User).filter(User.weekly_score > me_u.weekly_score).count()
                your_rank = higher + 1
        return {"scope": "weekly", "leaderboard": rows, "your_rank": your_rank}

    # all_time
    top = db.query(User).order_by(User.total_coins.desc()).limit(10).all()
    rows = [{"name": (u.name or f"User {u.telegram_id}"), "score": u.total_coins, "level": u.level} for u in top]
    your_rank = None
    if telegram_id is not None:
        me_u = db.query(User).filter(User.telegram_id == telegram_id).first()
        if me_u:
            higher = db.query(User).filter(User.total_coins > me_u.total_coins).count()
            your_rank = higher + 1
    return {"scope": "all_time", "leaderboard": rows, "your_rank": your_rank}


@app.get("/api/tasks")
def tasks(telegram_id: int, db: Session = Depends(get_db)):
    ensure_resets(db)
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    try:
        claimed = set(json.loads(user.daily_tasks_claimed or "[]"))
    except Exception:
        claimed = set()

    task_rows = []
    for t in TASKS:
        task_rows.append(
            {
                "id": t["id"],
                "title_tr": t["title_tr"],
                "title_en": t["title_en"],
                "type": t["type"],
                "url": t["url"],
                "reward_coins": t["reward_coins"],
                "claimed": t["id"] in claimed,
            }
        )

    return {
        "tasks": task_rows,
        "ad_watch": {
            "watched": user.daily_ad_watched,
            "limit": AD_WATCH_LIMIT,
            "reward_ton": AD_WATCH_REWARD_TON,
        },
    }


@app.post("/api/task/check")
def task_check(payload: TaskCheckRequest, db: Session = Depends(get_db)):
    ensure_resets(db)
    user = db.query(User).filter(User.telegram_id == payload.telegram_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    task = next((t for t in TASKS if t["id"] == payload.task_id), None)
    if not task:
        raise HTTPException(404, "Task not found")

    try:
        claimed = set(json.loads(user.daily_tasks_claimed or "[]"))
    except Exception:
        claimed = set()

    if payload.task_id in claimed:
        return {"success": False, "message": "Already claimed today", "user": _user_payload(user)}

    # REAL check for join_chat
    if task["type"] == "join_chat":
        member = tg_get_chat_member(task["chat_id"], user.telegram_id)
        status = member.get("status")
        if status in ("left", "kicked"):
            return {"success": False, "message": "Not a member yet. Join first, then Check.", "user": _user_payload(user)}

    # SOFT check for open_link
    if task["type"] == "open_link":
        # Require at least 8 seconds after opening (client sends open_age_sec)
        if payload.open_age_sec is None or payload.open_age_sec < 8:
            return {"success": False, "message": "Open the link and come back after a few seconds, then Check.", "user": _user_payload(user)}

    # Reward
    reward = int(task.get("reward_coins", 0))
    user.coins += reward
    user.total_coins += reward

    claimed.add(payload.task_id)
    user.daily_tasks_claimed = json.dumps(sorted(list(claimed)))

    db.commit()
    db.refresh(user)
    return {"success": True, "reward_coins": reward, "user": _user_payload(user)}


@app.post("/api/adwatched")
def ad_watched(payload: AdWatchedRequest, db: Session = Depends(get_db)):
    ensure_resets(db)
    user = db.query(User).filter(User.telegram_id == payload.telegram_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    if user.daily_ad_watched >= AD_WATCH_LIMIT:
        return {"success": False, "message": "Daily ad limit reached", "user": _user_payload(user)}

    user.daily_ad_watched += 1
    user.ton_credits = round(user.ton_credits + AD_WATCH_REWARD_TON, 4)

    db.commit()
    db.refresh(user)
    return {
        "success": True,
        "watched": user.daily_ad_watched,
        "remaining": AD_WATCH_LIMIT - user.daily_ad_watched,
        "user": _user_payload(user),
    }


@app.post("/api/settings")
def update_settings(payload: SettingsRequest, db: Session = Depends(get_db)):
    ensure_resets(db)
    user = get_or_create_user(db, telegram_id=payload.telegram_id)

    if payload.language is not None:
        user.language = payload.language
    if payload.sound_enabled is not None:
        user.sound_enabled = payload.sound_enabled
    if payload.vibration_enabled is not None:
        user.vibration_enabled = payload.vibration_enabled
    if payload.notifications_enabled is not None:
        user.notifications_enabled = payload.notifications_enabled
    if payload.wallet_address is not None:
        user.wallet_address = payload.wallet_address.strip() or None

    db.commit()
    db.refresh(user)
    return {"success": True, "user": _user_payload(user)}

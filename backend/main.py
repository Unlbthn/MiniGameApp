from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
import os

from .db import SessionLocal, engine, Base
from .models import User, TaskStatus

from .db import Base, engine

# --- AUTO CREATE TABLES ---
print("Creating tables if not exist...")
Base.metadata.create_all(bind=engine)


# -------------------------------------------------------------------
# FastAPI app init
# -------------------------------------------------------------------

app = FastAPI(title="Tap to Earn TON Backend")

# CORS (Telegram Mini App + local dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # istersen bunu domain bazlı kısıtlayabiliriz
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DB init
Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -------------------------------------------------------------------
# Paths / static
# -------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEBAPP_DIR = os.path.join(BASE_DIR, "webapp")

app.mount("/static", StaticFiles(directory=WEBAPP_DIR), name="static")


@app.get("/")
def serve_index():
    index_path = os.path.join(WEBAPP_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=500, detail="index.html not found")
    return FileResponse(index_path)


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------


def user_to_dict(user: User) -> dict:
    return {
        "telegram_id": user.telegram_id,
        "coins": user.coins,
        "level": user.level,
        "tap_power": user.tap_power,
        "ton_balance": user.ton_balance,
        "turbo_active": user.turbo_active,
        "turbo_until": user.turbo_until.isoformat() if user.turbo_until else None,
    }


def get_or_create_user(db: Session, telegram_id: str) -> User:
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if user:
        return user

    # yeni kullanıcı oluştur
    now = datetime.utcnow()
    user = User(
        telegram_id=telegram_id,
        coins=0,
        level=1,
        tap_power=1,
        ton_balance=0.0,
        turbo_active=False,
        turbo_until=None,
        referral_code=telegram_id,  # basit: kendi id'si referral code
        last_chest_reset=now,
        last_tap_time=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def reset_daily_chest_if_needed(user: User):
    """Günlük chest limitini gün başında sıfırla."""
    now = datetime.utcnow()
    if user.last_chest_reset is None:
        user.last_chest_reset = now
        user.daily_chest_used = 0
        return

    if user.last_chest_reset.date() < now.date():
        user.last_chest_reset = now
        user.daily_chest_used = 0


def compute_level_from_coins(coins: int) -> int:
    """
    Basit level mantığı:
    Level 1: 0 - 999
    Level 2: 1000 - 2999
    Level 3: 3000 - 5999
    Level 4: 6000 - 9999
    10k üstüne her +5k coin → level +1
    """
    if coins < 1000:
        return 1
    elif coins < 3000:
        return 2
    elif coins < 6000:
        return 3
    elif coins < 10000:
        return 4
    else:
        extra = coins - 10000
        return 5 + extra // 5000


def update_user_level(user: User):
    new_level = compute_level_from_coins(user.coins)
    if new_level != user.level:
        user.level = new_level


def get_task_status(user: User, task_key: str, db: Session) -> TaskStatus:
    ts = (
        db.query(TaskStatus)
        .filter(TaskStatus.user_id == user.id, TaskStatus.task_key == task_key)
        .first()
    )
    if not ts:
        ts = TaskStatus(
            user_id=user.id,
            task_key=task_key,
            completed=False,
            claimed=False,
            progress=0,
            required=1,
            updated_at=datetime.utcnow(),
        )
        db.add(ts)
        db.commit()
        db.refresh(ts)
    return ts


def task_status_to_str(ts: TaskStatus) -> str:
    if ts.claimed:
        return "claimed"
    if ts.completed:
        return "checked"
    return "pending"


# -------------------------------------------------------------------
# Pydantic Schemas
# -------------------------------------------------------------------


class TapRequest(BaseModel):
    telegram_id: str | int
    taps: int = 1


class SimpleUserBody(BaseModel):
    telegram_id: str | int


class TaskBody(BaseModel):
    telegram_id: str | int
    task_id: str


# -------------------------------------------------------------------
# API ENDPOINTS
# -------------------------------------------------------------------


@app.get("/api/me")
def get_me(telegram_id: str = Query(...), db: Session = Depends(get_db)):
    user = get_or_create_user(db, telegram_id=str(telegram_id))
    update_user_level(user)
    db.commit()
    db.refresh(user)
    return user_to_dict(user)


@app.post("/api/tap")
def tap(req: TapRequest, db: Session = Depends(get_db)):
    telegram_id = str(req.telegram_id)
    user = get_or_create_user(db, telegram_id)

    if req.taps <= 0:
        raise HTTPException(status_code=400, detail="INVALID_TAPS")

    gained = req.taps * user.tap_power
    user.coins += gained
    user.updated_at = datetime.utcnow()
    update_user_level(user)

    db.commit()
    db.refresh(user)

    return {"user": user_to_dict(user)}


@app.post("/api/upgrade/tap_power")
def upgrade_tap_power(req: SimpleUserBody, db: Session = Depends(get_db)):
    telegram_id = str(req.telegram_id)
    user = get_or_create_user(db, telegram_id)

    # cost: current tap_power * 100 (1→2:100, 2→3:200 ... )
    cost = user.tap_power * 100
    if user.coins < cost:
        raise HTTPException(status_code=400, detail="NOT_ENOUGH_COINS")

    user.coins -= cost
    user.tap_power += 1
    update_user_level(user)
    user.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(user)

    return {"user": user_to_dict(user)}


# ---------------------- Daily Chest / Rewarded Ad --------------------


def _grant_ad_reward(user: User, db: Session):
    reset_daily_chest_if_needed(user)
    DAILY_LIMIT = 10
    REWARD_TON = 0.01

    if user.daily_chest_used >= DAILY_LIMIT:
        raise HTTPException(status_code=400, detail="DAILY_LIMIT_REACHED")

    user.daily_chest_used += 1
    user.ton_balance += REWARD_TON
    user.updated_at = datetime.utcnow()

    # opsiyonel: chest task status güncelle
    ts = get_task_status(user, "daily_ton_chest", db)
    ts.progress += 1
    if ts.progress >= ts.required:
        ts.completed = True
    ts.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(user)
    db.refresh(ts)

    remaining = DAILY_LIMIT - user.daily_chest_used
    return {"user": user_to_dict(user), "remaining": remaining, "reward_ton": REWARD_TON}


@app.post("/api/reward/ad")
def reward_ad_web(req: SimpleUserBody, db: Session = Depends(get_db)):
    """
    WebApp içinden çağrılan ödüllü reklam endpoint'i.
    Body: { "telegram_id": ... }
    """
    telegram_id = str(req.telegram_id)
    user = get_or_create_user(db, telegram_id)
    return _grant_ad_reward(user, db)


@app.post("/api/reward/ad/{user_id}")
def reward_ad_adsgram(user_id: str, db: Session = Depends(get_db)):
    """
    AdsGram Rewarded Block callback URL:
    Örn: https://.../api/reward/ad/[userId]
    """
    telegram_id = user_id
    user = get_or_create_user(db, telegram_id)
    return _grant_ad_reward(user, db)


# --------------------------- Tasks API -------------------------------


@app.get("/api/tasks/status")
def get_tasks_status(telegram_id: str = Query(...), db: Session = Depends(get_db)):
    user = get_or_create_user(db, telegram_id=str(telegram_id))
    rows = db.query(TaskStatus).filter(TaskStatus.user_id == user.id).all()
    return [
        {
            "task_id": ts.task_key,
            "status": task_status_to_str(ts),
            "progress": ts.progress,
            "required": ts.required,
        }
        for ts in rows
    ]


@app.post("/api/tasks/check")
def check_task(body: TaskBody, db: Session = Depends(get_db)):
    """
    Basit versiyon:
    - Şimdilik gerçek doğrulama yerine, sadece 'completed' işaretliyoruz.
    - Invite gibi daha kompleks görevleri ileride genişletebiliriz.
    """
    telegram_id = str(body.telegram_id)
    task_key = body.task_id

    user = get_or_create_user(db, telegram_id)
    ts = get_task_status(user, task_key, db)

    # Örnek basit kural:
    # Eğer invite_friend ise, burada ileride gerçek referans sayısını kontrol edeceğiz.
    if task_key == "invite_friend":
        # TODO: referans sayısı kontrolü
        ts.completed = True
    else:
        ts.completed = True

    ts.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(ts)

    return {"task_id": task_key, "task_status": task_status_to_str(ts)}


@app.post("/api/tasks/claim")
def claim_task(body: TaskBody, db: Session = Depends(get_db)):
    telegram_id = str(body.telegram_id)
    task_key = body.task_id

    user = get_or_create_user(db, telegram_id)
    ts = get_task_status(user, task_key, db)

    if not ts.completed:
        raise HTTPException(status_code=400, detail="TASK_NOT_READY")
    if ts.claimed:
        raise HTTPException(status_code=400, detail="TASK_ALREADY_CLAIMED")

    reward_coins = 0
    reward_ton = 0.0

    if task_key == "daily_ton_chest":
        reward_coins = 100
    elif task_key == "watch_ad_bonus":
        reward_coins = 200
    elif task_key == "invite_friend":
        reward_ton = 0.02
    else:
        # genel fallback
        reward_coins = 100

    user.coins += reward_coins
    user.ton_balance += reward_ton
    update_user_level(user)
    user.updated_at = datetime.utcnow()

    ts.claimed = True
    ts.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(user)
    db.refresh(ts)

    return {
        "task_id": task_key,
        "task_status": task_status_to_str(ts),
        "reward_coins": reward_coins,
        "reward_ton": reward_ton,
        "user": user_to_dict(user),
    }


# --------------------------- Leaderboard ------------------------------


@app.get("/api/leaderboard")
def leaderboard(
    telegram_id: str | None = Query(None), db: Session = Depends(get_db)
):
    # en çok coin'e göre top 10
    top_users = (
        db.query(User)
        .order_by(User.coins.desc(), User.id.asc())
        .limit(10)
        .all()
    )

    top_list = [
        {
            "rank": idx + 1,
            "telegram_id": u.telegram_id,
            "coins": u.coins,
            "level": u.level,
        }
        for idx, u in enumerate(top_users)
    ]

    you_info = None
    if telegram_id is not None:
        telegram_id = str(telegram_id)
        user = db.query(User).filter(User.telegram_id == telegram_id).first()
        if user:
            # global rank hesapla
            higher_count = (
                db.query(User).filter(User.coins > user.coins).count()
            )
            global_rank = higher_count + 1
            you_info = {
                "telegram_id": user.telegram_id,
                "coins": user.coins,
                "level": user.level,
                "global_rank": global_rank,
            }

    return {"top": top_list, "you": you_info}

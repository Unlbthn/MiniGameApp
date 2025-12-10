from pathlib import Path
from datetime import date, datetime

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import User, TaskStatus

# -------------------------------------------------------------------
# App & DB init
# -------------------------------------------------------------------

app = FastAPI(title="Tap to Earn TON")

Base.metadata.create_all(bind=engine)

BASE_DIR = Path(__file__).resolve().parent.parent
WEBAPP_DIR = BASE_DIR / "webapp"

app.mount("/static", StaticFiles(directory=str(WEBAPP_DIR)), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Telegram WebApp farklı hostlardan gelebiliyor
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------


def user_to_dict(user: User) -> dict:
    return {
        "telegram_id": user.telegram_id,
        "display_name": user.display_name,
        "level": user.level,
        "xp": user.xp,
        "next_level_xp": user.next_level_xp,
        "coins": user.coins,
        "total_coins": user.total_coins,
        "tap_power": user.tap_power,
        "ton_credits": round(user.ton_credits, 4),
    }


TASK_REWARDS = {
    "visit_boinker": 1000,
    "visit_dotcoin": 800,
    "visit_bbqcoin": 800,
    "invite_friends": 2000,
}


def get_or_create_user(db: Session, telegram_id: int, name: str | None = None) -> User:
    user = db.query(User).filter_by(telegram_id=telegram_id).first()
    if not user:
        user = User(
            telegram_id=telegram_id,
            display_name=name or f"User {telegram_id}",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # İsim güncelle (varsa)
        if name and user.display_name != name:
            user.display_name = name
            db.commit()
            db.refresh(user)
    return user


def get_task_status(db: Session, user: User, task_id: str) -> TaskStatus:
    ts = (
        db.query(TaskStatus)
        .filter(TaskStatus.user_id == user.id, TaskStatus.task_id == task_id)
        .first()
    )
    if not ts:
        ts = TaskStatus(user_id=user.id, task_id=task_id, status="pending")
        db.add(ts)
        db.commit()
        db.refresh(ts)
    return ts


# -------------------------------------------------------------------
# Routes: frontend
# -------------------------------------------------------------------


@app.get("/", response_class=HTMLResponse)
def index():
    index_path = WEBAPP_DIR / "index.html"
    return index_path.read_text(encoding="utf-8")


@app.get("/health")
def health():
    return {"status": "ok"}


# -------------------------------------------------------------------
# Routes: user & tap
# -------------------------------------------------------------------


@app.get("/api/me")
def get_me(
    telegram_id: int = Query(...),
    name: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """
    Kullanıcı yoksa oluşturur, varsa döner.
    """
    user = get_or_create_user(db, telegram_id=telegram_id, name=name)
    return user_to_dict(user)


# main.py içinde uygun yere (diğer endpointlerin yanına) koy
from datetime import datetime
from fastapi import Body, Depends, HTTPException
from sqlalchemy.orm import Session

# ... get_db ve User model importları zaten var

def serialize_user(user: User):
    """Kullanıcıyı frontend'in anlayacağı formata çevirir."""
    return {
        "telegram_id": user.telegram_id,
        "level": user.level,
        "coins": user.coins,
        "tap_power": user.tap_power,
        "ton_credits": float(user.ton_credits or 0),
        "xp": user.total_coins,
        "next_level_xp": user.next_level_xp,
    }


def get_or_create_user(db: Session, telegram_id: int) -> User:
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        user = User(
            telegram_id=telegram_id,
            level=1,
            coins=0,
            tap_power=1,
            ton_credits=0,
            total_coins=0,
            next_level_xp=1000,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@app.post("/api/tap")
def tap(telegram_id: int = Body(..., embed=True), db: Session = Depends(get_db)):
    """
    Her tap:
      - coins += tap_power
      - total_coins += tap_power
      - level / next_level_xp güncellenir
    ve güncel user state JSON olarak döner.
    """
    user = get_or_create_user(db, telegram_id)

    # coin & xp artışı
    user.coins += user.tap_power
    user.total_coins += user.tap_power
    user.last_tap = datetime.utcnow()

    # basit level up mantığı
    # level 1 → 1000, level 2 → 2000, level 3 → 3000 gibi
    while user.total_coins >= user.next_level_xp:
        user.level += 1
        user.next_level_xp += 1000 * user.level

    db.commit()
    db.refresh(user)

    return serialize_user(user)



@app.post("/api/upgrade/tap_power")
async def upgrade_tap_power(payload: dict, db: Session = Depends(get_db)):
    """
    Tap gücü artışı: cost = tap_power * 100 coins
    """
    telegram_id = payload.get("telegram_id")
    if not isinstance(telegram_id, int):
        raise HTTPException(status_code=400, detail="telegram_id required")

    user = get_or_create_user(db, telegram_id=telegram_id)

    cost = user.tap_power * 100
    if user.coins < cost:
        raise HTTPException(status_code=400, detail="NOT_ENOUGH_COINS")

    user.coins -= cost
    user.tap_power += 1
    db.commit()
    db.refresh(user)

    return {
        "user": user_to_dict(user),
        "cost": cost,
    }


# -------------------------------------------------------------------
# Routes: Daily TON Chest (günde 1 kez)
# -------------------------------------------------------------------


@app.post("/api/reward/chest")
async def reward_chest(payload: dict, db: Session = Depends(get_db)):
    """
    Daily TON Chest:
      - Günde 1 kez
      - +0.01 TON credits
      - +500 coins (örnek)
    """
    telegram_id = payload.get("telegram_id")
    if not isinstance(telegram_id, int):
        raise HTTPException(status_code=400, detail="telegram_id required")

    user = get_or_create_user(db, telegram_id=telegram_id)
    today = date.today()

    if user.last_chest_date == today:
        raise HTTPException(status_code=400, detail="CHEST_ALREADY_OPENED")

    reward_ton = 0.01
    reward_coins = 500

    user.last_chest_date = today
    user.ton_credits += reward_ton
    user.coins += reward_coins
    user.total_coins += reward_coins

    db.commit()
    db.refresh(user)

    return {
        "user": user_to_dict(user),
        "reward_ton": reward_ton,
        "reward_coins": reward_coins,
    }


# -------------------------------------------------------------------
# Routes: Tasks (visit / invite)
# -------------------------------------------------------------------


@app.get("/api/tasks/status")
def tasks_status(telegram_id: int, db: Session = Depends(get_db)):
    user = get_or_create_user(db, telegram_id=telegram_id)

    task_ids = list(TASK_REWARDS.keys())
    out = []
    for tid in task_ids:
        ts = get_task_status(db, user, tid)
        out.append(
            {
                "task_id": tid,
                "status": ts.status,
            }
        )
    return out


@app.post("/api/tasks/check")
def task_check(payload: dict, db: Session = Depends(get_db)):
    telegram_id = payload.get("telegram_id")
    task_id = payload.get("task_id")

    if not isinstance(telegram_id, int) or not task_id:
        raise HTTPException(status_code=400, detail="INVALID_PAYLOAD")

    user = get_or_create_user(db, telegram_id=telegram_id)
    ts = get_task_status(db, user, task_id)

    if ts.status == "claimed":
        # Zaten claim edilmiş
        return {"task_id": task_id, "task_status": ts.status}

    ts.status = "checked"
    db.commit()
    db.refresh(ts)

    return {"task_id": task_id, "task_status": ts.status}


@app.post("/api/tasks/claim")
def task_claim(payload: dict, db: Session = Depends(get_db)):
    telegram_id = payload.get("telegram_id")
    task_id = payload.get("task_id")

    if not isinstance(telegram_id, int) or not task_id:
        raise HTTPException(status_code=400, detail="INVALID_PAYLOAD")

    user = get_or_create_user(db, telegram_id=telegram_id)
    ts = get_task_status(db, user, task_id)

    if ts.status != "checked":
        raise HTTPException(status_code=400, detail="TASK_NOT_READY")

    reward = TASK_REWARDS.get(task_id, 0)
    user.coins += reward
    user.total_coins += reward

    ts.status = "claimed"
    db.commit()
    db.refresh(user)
    db.refresh(ts)

    return {
        "task_id": task_id,
        "task_status": ts.status,
        "reward_coins": reward,
        "user": user_to_dict(user),
    }


# -------------------------------------------------------------------
# Routes: Leaderboard (Top 10 + benim sıram)
# -------------------------------------------------------------------


@app.get("/api/leaderboard")
def leaderboard(telegram_id: int, db: Session = Depends(get_db)):
    """
    total_coins'e göre top10 + kullanıcının gerçek sırası.
    """
    user = get_or_create_user(db, telegram_id=telegram_id)

    top_users = (
        db.query(User)
        .order_by(User.total_coins.desc())
        .limit(10)
        .all()
    )

    top = []
    for idx, u in enumerate(top_users, start=1):
        top.append(
            {
                "rank": idx,
                "telegram_id": u.telegram_id,
                "display_name": u.display_name or f"User {u.telegram_id}",
                "total_coins": u.total_coins,
            }
        )

    # Kullanıcının genel sırası
    # SELECT COUNT(*) WHERE total_coins > user.total_coins
    better_count = (
        db.query(User)
        .filter(User.total_coins > user.total_coins)
        .count()
    )
    my_rank = better_count + 1

    me_block = {
        "rank": my_rank,
        "telegram_id": user.telegram_id,
        "display_name": user.display_name or f"User {user.telegram_id}",
        "total_coins": user.total_coins,
    }

    return {"top": top, "me": me_block}

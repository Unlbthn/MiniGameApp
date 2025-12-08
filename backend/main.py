from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
import os

from .db import SessionLocal, Base, engine
from .models import User, TaskStatus

# -------------------------------------------------------------------
# DB init
# -------------------------------------------------------------------
Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -------------------------------------------------------------------
# FastAPI app
# -------------------------------------------------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Telegram Mini App için geniş bırakıyoruz
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------------
# Static files (webapp)
# -------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEBAPP_DIR = os.path.join(BASE_DIR, "webapp")

app.mount("/static", StaticFiles(directory=WEBAPP_DIR), name="static")


@app.get("/", response_class=HTMLResponse)
async def index():
    index_path = os.path.join(WEBAPP_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="index.html not found")
    return FileResponse(index_path)


# -------------------------------------------------------------------
# Pydantic şemalar
# -------------------------------------------------------------------
class UserOut(BaseModel):
    telegram_id: int
    coins: int
    total_coins: int
    level: int
    tap_power: int
    ton_credits: float = 0.0

    class Config:
        orm_mode = True


class TapRequest(BaseModel):
    telegram_id: int
    taps: int = 1


class UpgradeTapPowerRequest(BaseModel):
    telegram_id: int


class RewardAdRequest(BaseModel):
    telegram_id: int


class TaskCheckRequest(BaseModel):
    telegram_id: int
    task_id: str


class TaskClaimRequest(BaseModel):
    telegram_id: int
    task_id: str


class TaskStatusOut(BaseModel):
    task_id: str
    status: str


class LeaderboardEntry(BaseModel):
    telegram_id: int
    coins: int
    total_coins: int
    level: int
    tap_power: int
    rank: int


class LeaderboardResponse(BaseModel):
    top: List[LeaderboardEntry]
    my_rank: Optional[int] = None


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------
def get_or_create_user(db: Session, telegram_id: int) -> User:
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
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
    return user


def get_task_status_row(db: Session, telegram_id: int, task_id: str) -> TaskStatus:
    row = (
        db.query(TaskStatus)
        .filter(TaskStatus.telegram_id == telegram_id, TaskStatus.task_id == task_id)
        .first()
    )
    if not row:
        row = TaskStatus(telegram_id=telegram_id, task_id=task_id, status="pending")
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


# Basit görev tanımları (backend tarafında ödül tablosu)
TASK_DEFS = {
    # Günlük TON Chest – backend'den TON kredi veriyoruz.
    "daily_ton_chest": {
        "reward_coins": 0,
        "reward_ton": 0.1,
    },
    # Invite Friends – referans başına sabit coin, TON isteğe bağlı
    "invite_friends": {
        "reward_coins": 2000,
        "reward_ton": 0.02,
    },
    # Partner ziyaret görevi örnekleri
    "visit_boinker": {
        "reward_coins": 1000,
        "reward_ton": 0.0,
    },
    "visit_dotcoin": {
        "reward_coins": 1000,
        "reward_ton": 0.0,
    },
    "visit_bbqcoin": {
        "reward_coins": 1000,
        "reward_ton": 0.0,
    },
}


# -------------------------------------------------------------------
# API: /api/me
# -------------------------------------------------------------------
@app.get("/api/me", response_model=UserOut)
def get_me(telegram_id: int, db: Session = Depends(get_db)):
    user = get_or_create_user(db, telegram_id)
    return user


# -------------------------------------------------------------------
# API: /api/tap
# -------------------------------------------------------------------
@app.post("/api/tap")
def tap(req: TapRequest, db: Session = Depends(get_db)):
    """
    Tek tık / çoklu tık.
    coins ve total_coins, tap_power * taps kadar artar.
    """
    user = get_or_create_user(db, req.telegram_id)

    if req.taps <= 0:
        raise HTTPException(status_code=400, detail="Invalid taps")

    gained = req.taps * user.tap_power
    user.coins += gained
    user.total_coins += gained

    db.commit()
    db.refresh(user)
    return {"user": user}


# -------------------------------------------------------------------
# API: /api/upgrade/tap_power (şimdilik eski haliyle korunuyor)
# -------------------------------------------------------------------
@app.post("/api/upgrade/tap_power")
def upgrade_tap_power(req: UpgradeTapPowerRequest, db: Session = Depends(get_db)):
    user = get_or_create_user(db, req.telegram_id)
    # Basit mantık: yeni güç maliyeti = tap_power * 100
    cost = user.tap_power * 100

    if user.coins < cost:
        raise HTTPException(status_code=400, detail="NOT_ENOUGH_COINS")

    user.coins -= cost
    user.tap_power += 1

    db.commit()
    db.refresh(user)
    return {"user": user}


# -------------------------------------------------------------------
# API: /api/reward/ad (Rewarded video sonrası TON kredisi)
# -------------------------------------------------------------------
@app.post("/api/reward/ad")
def reward_ad(req: RewardAdRequest, db: Session = Depends(get_db)):
    """
    AdsGram Rewarded video başarılı oynatıldığında çağrılır.
    Şimdilik günlük limit vs. yok – her çağrıda 0.1 TON Credits ekler.
    """
    user = get_or_create_user(db, req.telegram_id)
    if user.ton_credits is None:
        user.ton_credits = 0.0

    user.ton_credits += 0.1

    db.commit()
    db.refresh(user)
    return {"user": user}


# -------------------------------------------------------------------
# API: /api/tasks/status
# -------------------------------------------------------------------
@app.get("/api/tasks/status", response_model=List[TaskStatusOut])
def get_tasks_status(telegram_id: int, db: Session = Depends(get_db)):
    """
    Frontend'deki görev ID'leri için status döner.
    Bilinmeyen task_id gelirse 'pending' kabul ediyoruz.
    """
    rows = (
        db.query(TaskStatus).filter(TaskStatus.telegram_id == telegram_id).all()
    )

    status_map = {row.task_id: row.status for row in rows}

    result = []
    for task_id in TASK_DEFS.keys():
        result.append(
            TaskStatusOut(
                task_id=task_id, status=status_map.get(task_id, "pending")
            )
        )

    return result


# -------------------------------------------------------------------
# API: /api/tasks/check
# -------------------------------------------------------------------
@app.post("/api/tasks/check", response_model=TaskStatusOut)
def check_task(req: TaskCheckRequest, db: Session = Depends(get_db)):
    """
    GO tuşuna bastıktan sonra CHECK çağrılır.
    Şimdilik 'gerçek doğrulama' yok, sadece status 'checked' yapıyoruz.
    """
    if req.task_id not in TASK_DEFS:
        raise HTTPException(status_code=400, detail="UNKNOWN_TASK")

    row = get_task_status_row(db, req.telegram_id, req.task_id)

    # Zaten claimed ise tekrar check etmeyelim
    if row.status == "claimed":
        return TaskStatusOut(task_id=req.task_id, status=row.status)

    row.status = "checked"
    db.commit()
    db.refresh(row)
    return TaskStatusOut(task_id=req.task_id, status=row.status)


# -------------------------------------------------------------------
# API: /api/tasks/claim
# -------------------------------------------------------------------
@app.post("/api/tasks/claim")
def claim_task(req: TaskClaimRequest, db: Session = Depends(get_db)):
    """
    CHECK sonrası CLAM çağrılır.
    status 'checked' ise ödül verip 'claimed' yapar.
    """
    if req.task_id not in TASK_DEFS:
        raise HTTPException(status_code=400, detail="UNKNOWN_TASK")

    user = get_or_create_user(db, req.telegram_id)
    row = get_task_status_row(db, req.telegram_id, req.task_id)

    if row.status != "checked":
        raise HTTPException(status_code=400, detail="TASK_NOT_READY")

    # Zaten claimed ise tekrar ödül verme
    if row.status == "claimed":
        return {"task_status": "claimed", "user": user, "reward_coins": 0, "reward_ton": 0.0}

    config = TASK_DEFS[req.task_id]
    reward_coins = int(config.get("reward_coins", 0) or 0)
    reward_ton = float(config.get("reward_ton", 0.0) or 0.0)

    user.coins += reward_coins
    user.total_coins += reward_coins
    if user.ton_credits is None:
        user.ton_credits = 0.0
    user.ton_credits += reward_ton

    row.status = "claimed"

    db.commit()
    db.refresh(user)
    db.refresh(row)

    return {
        "task_status": row.status,
        "user": user,
        "reward_coins": reward_coins,
        "reward_ton": reward_ton,
    }


# -------------------------------------------------------------------
# API: /api/leaderboard
# -------------------------------------------------------------------
@app.get("/api/leaderboard", response_model=LeaderboardResponse)
def leaderboard(telegram_id: Optional[int] = None, db: Session = Depends(get_db)):
    """
    En çok total_coins'e sahip ilk 10 kullanıcı + isteğe bağlı my_rank.
    """
    # Top 10
    top_users = (
        db.query(User)
        .order_by(User.total_coins.desc())
        .limit(10)
        .all()
    )

    top_entries: List[LeaderboardEntry] = []
    for idx, u in enumerate(top_users, start=1):
        top_entries.append(
            LeaderboardEntry(
                telegram_id=u.telegram_id,
                coins=u.coins,
                total_coins=u.total_coins,
                level=u.level,
                tap_power=u.tap_power,
                rank=idx,
            )
        )

    my_rank = None
    if telegram_id is not None:
        # Tüm kullanıcılar içinde sıralama
        all_users = (
            db.query(User)
            .order_by(User.total_coins.desc())
            .all()
        )
        for idx, u in enumerate(all_users, start=1):
            if u.telegram_id == telegram_id:
                my_rank = idx
                break

    return LeaderboardResponse(top=top_entries, my_rank=my_rank)

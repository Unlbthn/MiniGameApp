# backend/main.py

from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

# ---- SENİN VAR OLAN DB YAPINA GÖRE IMPORTLAR ----
# db.py dosyanda büyük ihtimalle Base, engine, SessionLocal var.
from .db import Base, engine, SessionLocal
from .models import User, TaskStatus  # models.py

# ---- Path Ayarları ----
BASE_DIR = Path(__file__).resolve().parent.parent
WEBAPP_DIR = BASE_DIR / "webapp"

# ---- FastAPI App ----
app = FastAPI(title="TapToEarnTON API")

# ---- CORS ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Static Files ----
# index.html içinde app.js ve styles.css'yi /static/... diye çağırıyoruz
app.mount("/static", StaticFiles(directory=WEBAPP_DIR), name="static")

# ---- DB INIT ----
Base.metadata.create_all(bind=engine)


# ==========================================================
#                    DB DEPENDENCY
# ==========================================================

def get_db():
    """db.py içindeki SessionLocal'den bir session üretir."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================================================
#                    API ENDPOINTS
# ==========================================================

@app.get("/api/me")
def get_me(telegram_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        user = User(
            telegram_id=telegram_id,
            coins=0,
            tap_power=1,
            level=1,
            ton_credits=0.0,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@app.post("/api/tap")
def tap_action(data: dict, db: Session = Depends(get_db)):
    telegram_id = data["telegram_id"]
    taps = data.get("taps", 1)

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.coins += taps * user.tap_power
    db.commit()
    db.refresh(user)

    return {"user": user}


@app.post("/api/upgrade/tap_power")
def upgrade_tap_power(data: dict, db: Session = Depends(get_db)):
    telegram_id = data["telegram_id"]

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    cost = user.tap_power * 100
    if user.coins < cost:
        raise HTTPException(status_code=400, detail="NOT_ENOUGH_COINS")

    user.coins -= cost
    user.tap_power += 1
    db.commit()
    db.refresh(user)

    return {"user": user}


# ==========================================================
#                     TASK SYSTEM (MINI)
# ==========================================================

@app.get("/api/tasks/status")
def task_status(telegram_id: int, db: Session = Depends(get_db)):
    statuses = db.query(TaskStatus).filter(TaskStatus.telegram_id == telegram_id).all()
    return [{"task_id": t.task_id, "status": t.status} for t in statuses]


@app.post("/api/tasks/check")
def task_check(data: dict, db: Session = Depends(get_db)):
    telegram_id = data["telegram_id"]
    task_id = data["task_id"]

    status = db.query(TaskStatus).filter(
        TaskStatus.telegram_id == telegram_id,
        TaskStatus.task_id == task_id,
    ).first()

    if not status:
        status = TaskStatus(
            telegram_id=telegram_id,
            task_id=task_id,
            status="checked",
        )
        db.add(status)
    else:
        status.status = "checked"

    db.commit()
    return {"task_id": task_id, "task_status": "checked"}


@app.post("/api/tasks/claim")
def task_claim(data: dict, db: Session = Depends(get_db)):
    telegram_id = data["telegram_id"]
    task_id = data["task_id"]

    status = db.query(TaskStatus).filter(
        TaskStatus.telegram_id == telegram_id,
        TaskStatus.task_id == task_id,
    ).first()

    if not status or status.status != "checked":
        raise HTTPException(status_code=400, detail="TASK_NOT_READY")

    status.status = "claimed"

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    reward = 1000
    user.coins += reward

    db.commit()
    return {
        "task_id": task_id,
        "task_status": "claimed",
        "reward_coins": reward,
        "user": user,
    }


# ==========================================================
#            AdsGram Daily Reward Endpoint
# ==========================================================

@app.post("/api/reward/ad")
def reward_ad(data: dict, db: Session = Depends(get_db)):
    telegram_id = data["telegram_id"]

    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # günlük limit 10
    # models.User içinde daily_ads (Integer, default=0) olduğunu varsayıyoruz
    if getattr(user, "daily_ads", 0) >= 10:
        raise HTTPException(status_code=400, detail="DAILY_LIMIT_REACHED")

    user.daily_ads = getattr(user, "daily_ads", 0) + 1
    user.ton_credits = (user.ton_credits or 0) + 0.01

    db.commit()
    db.refresh(user)

    remaining = 10 - user.daily_ads
    return {"user": user, "remaining": remaining}


# ==========================================================
#                 STATIC FILE ROUTING / MINI APP
# ==========================================================

@app.get("/favicon.ico")
async def favicon():
    # Şimdilik ikon yok; 204 ile boş dönüyoruz
    return Response(status_code=204)


@app.get("/", response_class=HTMLResponse)
async def index():
    """
    Ana root → webapp/index.html
    """
    index_file = WEBAPP_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return Response("index.html not found", status_code=404)


@app.get("/{full_path:path}", response_class=HTMLResponse)
async def catch_all(full_path: str):
    """
    Telegram mini-app içindeki /start vs. tüm pathleri SPA olarak index.html'e döndür.
    """
    index_file = WEBAPP_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return Response("index.html not found", status_code=404)

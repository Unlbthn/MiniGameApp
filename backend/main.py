from pathlib import Path

from fastapi import FastAPI, Depends
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import SessionLocal, init_db, User

# FastAPI uygulaması
app = FastAPI(title="Tap To Earn Backend + WebApp")

# Veritabanını oluştur
init_db()


# --- DB Bağlantısı ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- Pydantic Modelleri ---

class UserOut(BaseModel):
    telegram_id: int
    coins: int
    total_coins: int
    level: int
    tap_power: int

    class Config:
        orm_mode = True


class TapRequest(BaseModel):
    telegram_id: int
    taps: int = 1


class UpgradeTapPowerRequest(BaseModel):
    telegram_id: int
    # istersen ileride birden fazla level arttırma için amount ekleyebilirsin


# --- API Endpoint'leri ---

@app.get("/api/me", response_model=UserOut)
def get_or_create_user(telegram_id: int, db: Session = Depends(get_db)):
    """
    Kullanıcı yoksa oluşturur, varsa getirir.
    """
    user = db.query(User).filter_by(telegram_id=telegram_id).first()
    if not user:
        user = User(telegram_id=telegram_id)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@app.post("/api/tap", response_model=UserOut)
def tap(req: TapRequest, db: Session = Depends(get_db)):
    """
    Tap işlemi: taps kadar tıklama yapar, coin ve level günceller.
    """
    user = db.query(User).filter_by(telegram_id=req.telegram_id).first()
    if not user:
        user = User(telegram_id=req.telegram_id)
        db.add(user)
        db.commit()
        db.refresh(user)

    gained = user.tap_power * req.taps
    user.coins += gained
    user.total_coins += gained

    # Basit level-up mantığı
    required = user.level * 1000
    while user.total_coins >= required:
        user.level += 1
        required = user.level * 1000

    db.commit()
    db.refresh(user)
    return user


@app.post("/api/upgrade/tap_power", response_model=UserOut)
def upgrade_tap_power(req: UpgradeTapPowerRequest, db: Session = Depends(get_db)):
    """
    Tap gücünü arttırmak için basit upgrade endpoint'i.
    Örnek kural: 50 coin karşılığında +1 tap_power
    """
    COST = 50

    user = db.query(User).filter_by(telegram_id=req.telegram_id).first()
    if not user:
        user = User(telegram_id=req.telegram_id)
        db.add(user)
        db.commit()
        db.refresh(user)

    if user.coins >= COST:
        user.coins -= COST
        user.tap_power += 1
        db.commit()
        db.refresh(user)

    return user


# --- Statik Web Uygulaması ---

# Proje kök dizini = backend klasörünün 1 üstü
BASE_DIR = Path(__file__).resolve().parent.parent
WEBAPP_DIR = BASE_DIR / "webapp"

# webapp klasörünü root URL'den servis et (index.html varsayılan)
app.mount(
    "/",
    StaticFiles(directory=str(WEBAPP_DIR), html=True),
    name="webapp",
)

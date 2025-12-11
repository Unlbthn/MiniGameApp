from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import os

from .db import SessionLocal, engine, Base
from .models import User

Base.metadata.create_all(bind=engine)

app = FastAPI()

# Static directory
static_dir = os.path.join(os.path.dirname(__file__), "..", "webapp")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


# ---------------------- DB SESSION ----------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------- USER CREATOR ----------------------
def get_or_create_user(db: Session, telegram_id: str, name: str | None = None):
    """
    Kullanıcıyı telegram_id ile bulur, yoksa oluşturur.
    `name` şu an DB modelinde olmadığından sadece parametre olarak alıyoruz ama kaydetmiyoruz.
    Böylece hem frontend tarafında name göndermeye devam edebilirsin
    hem de SQLAlchemy 'invalid keyword argument' hatası vermez.
    """
    user = db.query(User).filter(User.telegram_id == telegram_id).first()
    if user:
        return user

    # Sadece modelde olduğundan emin olduğumuz alanları set ediyoruz
    user = User(
        telegram_id=telegram_id,
        level=1,
        coins=0,
        tap_power=1,
        ton_credits=0,
    )

    db.add(user)
    db.commit()
    db.refresh(user)
    return user



# ---------------------- ROUTES ----------------------
@app.get("/")
def serve_index():
    index_path = os.path.join(static_dir, "index.html")
    return FileResponse(index_path)


@app.get("/api/me")
def get_me(telegram_id: str, name: str = None, db: Session = Depends(get_db)):
    """
    Kullanıcıyı telegram_id ile getirir, yoksa oluşturur.
    name parametresi şu an DB'de tutulmuyor, sadece ileride kullanmak istersen için
    fonksiyon imzasında bırakıldı.
    """
    # telegram_id'yi string olarak kullanıyoruz (DB'de genelde String kolon oluyor)
    user = get_or_create_user(db, telegram_id=telegram_id, name=name)

    return {
        "telegram_id": user.telegram_id,
        # "name": user.name,  # <- DB modelinde name kolonu olmadığı için şimdilik göndermiyoruz
        "level": user.level,
        "coins": user.coins,
        "tap_power": user.tap_power,
        "ton_credits": user.ton_credits,
        "xp": user.xp,
    }


@app.post("/api/tap")
def tap(telegram_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.telegram_id == telegram_id).first()

    if not user:
        raise HTTPException(404, "User not found")

    user.coins += user.tap_power
    user.xp += 1

    db.commit()
    db.refresh(user)

    return {"coins": user.coins, "xp": user.xp}


@app.post("/api/upgrade_tap_power")
def upgrade_tap_power(telegram_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.telegram_id == telegram_id).first()

    if not user:
        raise HTTPException(404, "User not found")

    cost = 100

    if user.coins < cost:
        raise HTTPException(400, "Not enough coins")

    user.coins -= cost
    user.tap_power += 1

    db.commit()
    db.refresh(user)

    return {"tap_power": user.tap_power, "coins": user.coins}


@app.get("/api/leaderboard")
def leaderboard(db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.coins.desc()).limit(10).all()
    return [{"name": u.name, "coins": u.coins} for u in users]

import os
from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker

# ── DATABASE URL ─────────────────────────────────────────────
# Railway'de env değişkeni olarak DATABASE_URL tanımlıysa onu kullanır,
# yoksa local için sqlite dosyası oluşturur.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./taptoearnton.db")

# SQLite ise check_same_thread ayarı gerekiyor
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


# ── MODELLER ────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(Integer, unique=True, index=True, nullable=False)

    # BUG DÜZELTME: 'name' alanı eklendi
    # main.py içindeki get_or_create_user() fonksiyonu User(name=...) ile çalışıyor.
    name = Column(String(255), nullable=True)

    level = Column(Integer, default=1, nullable=False)
    coins = Column(Integer, default=0, nullable=False)
    tap_power = Column(Integer, default=1, nullable=False)
    ton_credits = Column(Float, default=0.0, nullable=False)
    xp = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


# ── YARDIMCI FONKSİYONLAR ───────────────────────────────────
def init_db() -> None:
    """
    Tüm tabloları oluşturur (yoksa).
    """
    Base.metadata.create_all(bind=engine)


def get_db():
    """
    main.py içinde Depends(get_db) ile kullanılan session generator.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

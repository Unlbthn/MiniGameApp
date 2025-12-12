import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Railway'de env değişkeni olarak DATABASE_URL tanımlıysa onu kullanır,
# yoksa local için sqlite dosyası oluşturur.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./taptoearnton.db")

# SQLite ise check_same_thread ayarı gerekiyor
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_db() -> None:
    """Tüm tabloları oluşturur (yoksa)."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI Depends(get_db) için session generator."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

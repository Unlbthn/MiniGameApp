from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# ---------------------------
# DATABASE URL
# ---------------------------
# Railway / Render otomatik DATABASE_URL değişkeni verir
import os
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./game.db")

# ---------------------------
# Engine
# ---------------------------
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(DATABASE_URL)


# ---------------------------
# SessionLocal
# ---------------------------
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ---------------------------
# Base
# ---------------------------
Base = declarative_base()


# ---------------------------
# Dependency (FastAPI)
# ---------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

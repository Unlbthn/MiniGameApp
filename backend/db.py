# backend/db.py

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# --------------------------------------------------------------------
# DATABASE_URL
# --------------------------------------------------------------------
# Railway'de genelde DATABASE_URL bir Postgres connection string’i oluyor.
# Lokal geliştirmede ise varsayılan olarak SQLite kullanıyoruz.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./taptoearnton.db")

# Eski format "postgres://" gelirse SQLAlchemy için düzelt
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLite ise extra connect_args gerekiyor, diğerlerinde gerek yok
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """
    FastAPI dependency:
    Her request için ayrı bir DB session açar, iş bitince kapatır.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

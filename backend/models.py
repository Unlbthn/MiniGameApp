# backend/models.py
from datetime import date, datetime
from sqlalchemy import Column, Integer, BigInteger, Float, String, Date, DateTime, UniqueConstraint
from .db import Base   # <<< BURASI ÖNEMLİ

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(BigInteger, index=True, unique=True)

    coins = Column(Integer, default=0)
    total_coins = Column(Integer, default=0)
    level = Column(Integer, default=1)
    tap_power = Column(Integer, default=1)

    ton_credits = Column(Float, default=0.0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TaskStatus(Base):
    __tablename__ = "task_statuses"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(BigInteger, index=True)
    task_id = Column(String, index=True)
    status = Column(String, default="pending")  # pending | checked | claimed

    __table_args__ = (UniqueConstraint("telegram_id", "task_id", name="uq_user_task"),)


class AdReward(Base):
    __tablename__ = "ad_rewards"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(BigInteger, index=True)
    reward_date = Column(Date, index=True)
    count = Column(Integer, default=0)

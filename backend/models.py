# backend/models.py

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from .db import Base


# --------------------------------------------------------------------
# USER MODEL
# --------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(String, unique=True, index=True, nullable=False)

    coins = Column(Integer, default=0)
    level = Column(Integer, default=1)
    tap_power = Column(Integer, default=1)

    ton_balance = Column(Float, default=0.0)

    # TURBO BOOST (kaldırıldı ama gelecekte gerekirse kalsın)
    turbo_active = Column(Boolean, default=False)
    turbo_until = Column(DateTime, nullable=True)

    # REFERRAL
    referral_code = Column(String, unique=True)
    referred_by = Column(String, ForeignKey("users.referral_code"), nullable=True)

    # DAILY CHEST limit
    daily_chest_used = Column(Integer, default=0)

    # DAILY WATCHED ADS FOR CHEST
    last_chest_reset = Column(DateTime, default=datetime.utcnow)

    # Tap cooldown
    last_tap_time = Column(DateTime, default=datetime.utcnow)

    # Leaderboard caching (opsiyonel)
    updated_at = Column(DateTime, default=datetime.utcnow)

    tasks = relationship("TaskStatus", back_populates="user")


# --------------------------------------------------------------------
# TASK STATUS — daily tasks / invite / visit / claim tracking
# --------------------------------------------------------------------
class TaskStatus(Base):
    __tablename__ = "task_status"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))

    task_key = Column(String, index=True)       # example: "daily_chest", "visit_website", "invite_friend"
    completed = Column(Boolean, default=False)
    claimed = Column(Boolean, default=False)

    # Extra logic (visit link, click check, etc.)
    progress = Column(Integer, default=0)
    required = Column(Integer, default=1)

    updated_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="tasks")

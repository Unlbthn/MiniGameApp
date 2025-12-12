from __future__ import annotations

from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import relationship

try:
    from .db import Base
except ImportError:
    from db import Base



class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(Integer, unique=True, index=True, nullable=False)

    # Profile
    name = Column(String, nullable=True)
    language = Column(String, default="en", nullable=False)

    # Progress
    level = Column(Integer, default=1, nullable=False)
    xp = Column(Integer, default=0, nullable=False)
    next_level_xp = Column(Integer, default=1000, nullable=False)

    # Economy
    coins = Column(Integer, default=0, nullable=False)
    total_coins = Column(Integer, default=0, nullable=False)

    # Tapping
    tap_power = Column(Integer, default=1, nullable=False)
    total_taps = Column(Integer, default=0, nullable=False)

    # Weekly leaderboard
    weekly_score = Column(Integer, default=0, nullable=False)

    # TON credits (ONLY: level-up, ad-watch, weekly reward)
    ton_credits = Column(Float, default=0.0, nullable=False)

    # Daily limits
    daily_ad_watched = Column(Integer, default=0, nullable=False)  # 0..10
    daily_tasks_claimed = Column(Text, default="[]", nullable=False)  # JSON list of task ids claimed today
    daily_tasks_date = Column(Date, nullable=True)

    # Settings
    sound_enabled = Column(Boolean, default=True, nullable=False)
    vibration_enabled = Column(Boolean, default=True, nullable=False)
    notifications_enabled = Column(Boolean, default=True, nullable=False)

    # Wallet
    wallet_address = Column(String, nullable=True)

    # Meta
    last_tap_at = Column(DateTime, nullable=True)
    last_chest_date = Column(Date, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Legacy relation (optional usage)
    tasks = relationship("TaskStatus", back_populates="user")


class TaskStatus(Base):
    __tablename__ = "task_status"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    task_id = Column(String, index=True, nullable=False)  # e.g. "watch_ad"
    status = Column(String, default="pending", nullable=False)  # pending/checked/claimed
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="tasks")


class AppState(Base):
    """Singleton table to avoid double daily/weekly resets."""

    __tablename__ = "app_state"

    id = Column(Integer, primary_key=True, default=1)

    last_daily_reset = Column(Date, nullable=True)  # date of last daily reset
    last_weekly_reset_yearweek = Column(Integer, nullable=True)  # ISO year*100 + ISO week number

    last_weekly_winner_telegram_id = Column(Integer, nullable=True)
    last_weekly_awarded_at = Column(DateTime, nullable=True)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

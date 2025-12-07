from sqlalchemy import Column, Integer, Float, String, Boolean, Date, DateTime
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    telegram_id = Column(Integer, primary_key=True, index=True)

    # Game stats
    coins = Column(Integer, default=0)
    total_coins = Column(Integer, default=0)

    level = Column(Integer, default=1)
    xp = Column(Integer, default=0)               # NEW: XP bar için
    next_level_xp = Column(Integer, default=1000) # NEW: 1→2:1000, 2→3:2000...

    tap_power = Column(Integer, default=1)

    # TON earnings
    ton_credits = Column(Float, default=0.0)

    # Turbo boost
    turbo_end = Column(DateTime, nullable=True)
    daily_turbo_count = Column(Integer, default=0)
    last_turbo_date = Column(Date, nullable=True)

    # NEW → Extra Coins Boost (x2 / x3 / x5)
    boost_end = Column(DateTime, nullable=True)
    current_boost = Column(Integer, default=1)  # 1=no boost, 2=x2, 3=x3, etc.
    daily_boost_count = Column(Integer, default=0)
    last_boost_date = Column(Date, nullable=True)

    # Reward ads
    daily_ads_count = Column(Integer, default=0)
    last_ad_date = Column(Date, nullable=True)

    # Referral system
    referrals = Column(Integer, default=0)
    referred_by = Column(Integer, nullable=True)

    # NEW Anti-Cheat: last tap timestamp
    last_tap = Column(DateTime, nullable=True)
    tap_streak = Column(Integer, default=0)   # çok hızlı farm’ı sınırlamak için


class TaskStatus(Base):
    __tablename__ = "task_status"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(Integer, index=True)
    task_id = Column(String)
    status = Column(String)  # pending / checked / claimed

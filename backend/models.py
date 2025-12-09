from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from .db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(Integer, unique=True, index=True, nullable=False)

    # Profil
    display_name = Column(String, nullable=True)

    # Oyun state
    level = Column(Integer, default=1, nullable=False)
    xp = Column(Integer, default=0, nullable=False)
    next_level_xp = Column(Integer, default=1000, nullable=False)

    coins = Column(Integer, default=0, nullable=False)
    total_coins = Column(Integer, default=0, nullable=False)
    tap_power = Column(Integer, default=1, nullable=False)

    ton_credits = Column(Float, default=0.0, nullable=False)

    last_tap_at = Column(DateTime, nullable=True)

    # Daily chest (günde 1)
    last_chest_date = Column(Date, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    tasks = relationship("TaskStatus", back_populates="user")


class TaskStatus(Base):
    __tablename__ = "task_status"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    task_id = Column(String, index=True, nullable=False)  # e.g. "visit_boinker"
    status = Column(String, default="pending", nullable=False)  # pending/checked/claimed
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="tasks")

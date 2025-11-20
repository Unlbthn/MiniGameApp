from sqlalchemy import create_engine, Column, Integer, BigInteger
from sqlalchemy.orm import declarative_base, sessionmaker

# SQLite veritabanı dosyası (proje köküne tapgame.db oluşturur)
DATABASE_URL = "sqlite:///../tapgame.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(BigInteger, unique=True, index=True)
    coins = Column(Integer, default=0)
    total_coins = Column(Integer, default=0)
    level = Column(Integer, default=1)
    tap_power = Column(Integer, default=1)


def init_db():
    Base.metadata.create_all(bind=engine)

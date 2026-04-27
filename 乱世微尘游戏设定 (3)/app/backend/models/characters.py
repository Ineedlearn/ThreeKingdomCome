from core.database import Base
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String


class Characters(Base):
    __tablename__ = "characters"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    gender = Column(String, nullable=True)
    identity = Column(String, nullable=True)
    birthplace = Column(String, nullable=True)
    current_year = Column(Integer, nullable=True)
    reputation = Column(String, nullable=True)
    relations = Column(String, nullable=True)
    situation = Column(String, nullable=True)
    is_alive = Column(Boolean, nullable=True)
    death_story = Column(String, nullable=True)
    play_count = Column(Integer, nullable=True)
    resources = Column(String, nullable=True)
    companions = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)
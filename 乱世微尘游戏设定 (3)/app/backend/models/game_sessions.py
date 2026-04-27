from core.database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime, Integer, String


class Game_sessions(Base):
    __tablename__ = "game_sessions"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    character_id = Column(Integer, nullable=False)
    messages = Column(String, nullable=True)
    npc_states = Column(String, nullable=True)
    world_events = Column(String, nullable=True)
    scene_npcs = Column(String, nullable=True)
    current_location = Column(String, nullable=True)
    session_summary = Column(String, nullable=True)
    resources = Column(String, nullable=True)
    companions = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.now)
    updated_at = Column(DateTime(timezone=True), default=datetime.now, onupdate=datetime.now)
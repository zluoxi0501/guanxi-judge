from sqlalchemy import Column, String, Text, DateTime, JSON
from sqlalchemy.sql import func
import uuid
from database import Base


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, server_default=func.now())

    pain_points = Column(Text, nullable=True)
    custom_pain_point = Column(Text, nullable=True)
    story = Column(Text, nullable=False)
    main_question = Column(String(200), nullable=True)

    core_judgment = Column(Text, nullable=True)
    real_need = Column(Text, nullable=True)
    relationship_structure = Column(Text, nullable=True)
    future_trend = Column(Text, nullable=True)
    final_advice = Column(Text, nullable=True)
    advice_type = Column(String(20), nullable=True)
    closing_words = Column(Text, nullable=True)

    selected_question = Column(String(100), nullable=True)
    selected_question_answer = Column(JSON, nullable=True)
    other_perspectives = Column(JSON, nullable=True)

    prompt_version = Column(String(10), default="2.0")
    raw_input = Column(JSON, nullable=True)
    raw_output = Column(Text, nullable=True)

    user_feedback = Column(String(20), nullable=True)


class Event(Base):
    __tablename__ = "events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, server_default=func.now())
    analysis_id = Column(String(36), nullable=True)
    event = Column(String(100), nullable=False)

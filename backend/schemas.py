from pydantic import BaseModel
from typing import Optional


class AnalyzeRequest(BaseModel):
    pain_points: list[str]
    custom_pain_point: Optional[str] = None
    story: str
    main_question: str  # question id: what_he_thinks | continue_or_not | will_he_change | am_i_sensitive | any_future


class PerspectiveAnswer(BaseModel):
    id: str           # question id
    title: str        # original question label
    hook: str         # evocative angle description shown in paywall
    content: str


class AnalysisResult(BaseModel):
    core_judgment: str
    real_need: str
    relationship_structure: str
    future_trend: str
    final_advice: str
    advice_type: str  # continue | observe | stop
    closing_words: str
    selected_question: str
    selected_question_answer: PerspectiveAnswer
    other_perspectives: list[PerspectiveAnswer]


class AnalyzeResponse(BaseModel):
    id: str
    result: AnalysisResult


class FeedbackRequest(BaseModel):
    feedback: str  # helpful | not_helpful

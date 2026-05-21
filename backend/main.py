import json
import logging
import os
import re
import traceback
import uuid
from contextlib import asynccontextmanager

import anthropic
from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, init_db
from models import Analysis, Event
from prompt import PROMPT_VERSION, SYSTEM_PROMPT, PERSPECTIVE_HOOKS, QUESTION_LABELS, build_user_prompt
from schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    AnalysisResult,
    FeedbackRequest,
    PerspectiveAnswer,
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("guanxi")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(lifespan=lifespan)

origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = anthropic.AsyncAnthropic(
    api_key=os.getenv("ANTHROPIC_API_KEY"),
    base_url=os.getenv("ANTHROPIC_BASE_URL"),
)


def make_fallback_result(req: AnalyzeRequest) -> dict:
    """Return a structurally valid result when Claude output cannot be parsed."""
    selected_label = QUESTION_LABELS.get(req.main_question, req.main_question)
    other_ids = [k for k in QUESTION_LABELS if k != req.main_question]
    return {
        "core_judgment": "这段关系让你很累。\n\n不是因为你想太多，而是因为它一直没有真正稳定下来。",
        "real_need": "你想要的不是更多联系。\n\n你想要的是，不用靠猜来判断这段关系还在不在。",
        "relationship_structure": "这段关系消耗你，是因为它的状态从来不稳定。\n\n你一直在用自己的稳定，去填补它的不稳定。",
        "future_trend": "如果现在的模式不变，这段关系会继续在原地循环。\n\n真正的改变需要他主动做出选择。",
        "final_advice": "先停止主动填补空白，看他在你安静下来之后会不会主动出现。\n\n那个答案，比他说的任何话都真实。",
        "advice_type": "observe",
        "closing_words": "你不是不知道关系有问题。\n\n你只是一直希望，这次会和以前不一样。",
        "selected_question_answer": {
            "title": selected_label,
            "content": "这个问题的答案，藏在他平时的行为里，不在他说的话里。\n\n他靠近你的时候，是因为他需要你。\n\n他消失的时候，是因为他还没准备好承担这段关系的重量。",
        },
        "other_perspectives": [
            {
                "title": QUESTION_LABELS[k],
                "content": "基于这段关系的整体状态，这个问题的答案需要时间来验证。\n\n你现在能做的，是先看清楚自己真正想要什么。",
            }
            for k in other_ids
        ],
    }


def extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        inner = lines[1:] if lines[0].startswith("```") else lines
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        text = "\n".join(inner).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        raise ValueError(f"Cannot parse JSON from Claude output (len={len(text)})")


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest, db: AsyncSession = Depends(get_db)):
    log.info("=== /api/analyze request ===")
    log.info("pain_points: %s", req.pain_points)
    log.info("main_question: %s", req.main_question)
    log.info("story length: %d", len(req.story))

    user_prompt = build_user_prompt(
        req.pain_points,
        req.custom_pain_point,
        req.story,
        req.main_question,
    )

    raw_output = ""
    parsed: dict | None = None

    for attempt in range(2):
        try:
            log.info("Calling Claude API (attempt %d)...", attempt + 1)
            message = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=3000,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )
            raw_output = message.content[0].text
            log.info("Claude raw output (first 200): %s", raw_output[:200])
            parsed = extract_json(raw_output)
            log.info("JSON parsed successfully, keys: %s", list(parsed.keys()))
            break
        except Exception as e:
            log.warning("Attempt %d failed: %s", attempt + 1, e)
            if attempt == 1:
                log.error("Both attempts failed, using fallback result")
                log.error(traceback.format_exc())
                parsed = make_fallback_result(req)

    label_to_id = {v: k for k, v in QUESTION_LABELS.items()}

    sqa_raw = parsed.get("selected_question_answer", {})
    selected_question_answer = PerspectiveAnswer(
        id=req.main_question,
        title=sqa_raw.get("title", QUESTION_LABELS.get(req.main_question, "")),
        hook=PERSPECTIVE_HOOKS.get(req.main_question, ""),
        content=sqa_raw.get("content", ""),
    )

    other_raw = parsed.get("other_perspectives", [])
    other_perspectives = []
    for p in other_raw:
        title = p.get("title", "")
        qid = label_to_id.get(title, title)
        other_perspectives.append(PerspectiveAnswer(
            id=qid,
            title=title,
            hook=PERSPECTIVE_HOOKS.get(qid, title),
            content=p.get("content", ""),
        ))

    result = AnalysisResult(
        core_judgment=parsed.get("core_judgment", ""),
        real_need=parsed.get("real_need", ""),
        relationship_structure=parsed.get("relationship_structure", ""),
        future_trend=parsed.get("future_trend", ""),
        final_advice=parsed.get("final_advice", ""),
        advice_type=parsed.get("advice_type", "observe"),
        closing_words=parsed.get("closing_words", ""),
        selected_question=req.main_question,
        selected_question_answer=selected_question_answer,
        other_perspectives=other_perspectives,
    )

    analysis = Analysis(
        pain_points=",".join(req.pain_points),
        custom_pain_point=req.custom_pain_point,
        story=req.story,
        main_question=req.main_question,
        core_judgment=result.core_judgment,
        real_need=result.real_need,
        relationship_structure=result.relationship_structure,
        future_trend=result.future_trend,
        final_advice=result.final_advice,
        advice_type=result.advice_type,
        closing_words=result.closing_words,
        selected_question=result.selected_question,
        selected_question_answer=sqa_raw,
        other_perspectives=other_raw,
        prompt_version=PROMPT_VERSION,
        raw_input=req.model_dump(),
        raw_output=raw_output,
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    log.info("=== /api/analyze done, id=%s ===", analysis.id)
    return AnalyzeResponse(id=str(analysis.id), result=result)


@app.post("/api/feedback/{analysis_id}")
async def feedback(analysis_id: str, req: FeedbackRequest, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    result = await db.execute(select(Analysis).where(Analysis.id == analysis_id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        return {"ok": False}
    analysis.user_feedback = req.feedback
    await db.commit()
    return {"ok": True}


@app.post("/api/event/{analysis_id}")
async def track_event(analysis_id: str, req: dict, db: AsyncSession = Depends(get_db)):
    event_name = req.get("event", "")
    log.info("EVENT analysis=%s event=%s", analysis_id, event_name)
    ev = Event(analysis_id=analysis_id, event=event_name)
    db.add(ev)
    await db.commit()
    return {"ok": True}


@app.get("/api/analytics")
async def analytics(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select, func as sqlfunc

    # event counts
    event_names = [
        "payment_modal_open",
        "payment_qrcode_viewed",
        "continue_after_qrcode_clicked",
        "paid_content_unlocked",
    ]
    counts: dict[str, int] = {}
    for name in event_names:
        result = await db.execute(
            select(sqlfunc.count()).where(Event.event == name)
        )
        counts[name] = result.scalar() or 0

    # per-session event log (analysis_id + events + selected_question)
    analyses_result = await db.execute(
        select(Analysis.id, Analysis.created_at, Analysis.selected_question, Analysis.advice_type)
        .order_by(Analysis.created_at.desc())
        .limit(100)
    )
    analyses_rows = analyses_result.all()

    events_result = await db.execute(
        select(Event.analysis_id, Event.event, Event.created_at)
        .order_by(Event.created_at.asc())
    )
    events_rows = events_result.all()

    # group events by analysis_id
    from collections import defaultdict
    events_by_session: dict[str, list] = defaultdict(list)
    for row in events_rows:
        events_by_session[row.analysis_id].append({
            "event": row.event,
            "time": row.created_at.isoformat() if row.created_at else "",
        })

    sessions = []
    for row in analyses_rows:
        sessions.append({
            "id": row.id,
            "created_at": row.created_at.isoformat() if row.created_at else "",
            "selected_question": row.selected_question or "",
            "advice_type": row.advice_type or "",
            "events": events_by_session.get(row.id, []),
        })

    return {
        "counts": counts,
        "sessions": sessions,
    }


@app.post("/api/pay/{analysis_id}")
async def mock_pay(analysis_id: str):
    """Mock payment endpoint — always succeeds. Replace with real payment gateway later."""
    log.info("PAYMENT analysis=%s", analysis_id)
    return {"ok": True, "unlocked": True}


@app.get("/health")
async def health():
    return {"status": "ok"}

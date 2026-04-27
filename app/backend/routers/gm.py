import json
import logging
import re
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from services.aihub import AIHubService
from schemas.aihub import GenTxtRequest, ChatMessage
from models.game_sessions import Game_sessions
from models.characters import Characters

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/gm", tags=["gm"])

GM_SYSTEM_PROMPT = """你是《乱世微尘》的游戏主持人（GM）。背景设定于汉末乱世（公元184-220年）。
核心基调：乱世之下小人物的悲凉与坚韧，活命本身就是英雄主义。
历史准确性：遵循《三国志》及《三国演义》，不杜撰历史人物私密言论，不破坏历史事件走向。
NPC规则：每个NPC具备身份层（姓名、年龄、职业、性格）、记忆层（与玩家的交互历史）、目标层（短期/长期目标）、反应层（符合性格与处境的反应）。
行动裁定：采用"描述-意图-结果"三段式，偏向拟真而非戏剧化。小人物不能凭一己之力扭转大势，成功往往伴随代价。
叙事风格：参考《三国志》简洁克制，借《三国演义》生动描写塑造场景氛围。使用符合汉代语境的称谓，保持现代可读性。每次叙事以开放式情境收束，留给玩家选择空间。
禁止：让玩家轻松成为历史名将义弟/军师；杜撰历史人物私密言论；为爽感破坏历史走向；主动提供最优解；使用"经验值"等现代游戏化语言。
回复格式：纯叙事文本，可用【】标注重要信息，每次回复控制在400字以内。"""


# ---------- Pydantic Schemas ----------

class StartGameRequest(BaseModel):
    character_id: int
    name: str
    identity: str
    birthplace: str
    current_year: int = 184


class SaveSessionRequest(BaseModel):
    character_id: int
    messages: str = "[]"
    npc_states: str = "[]"
    world_events: str = "[]"
    scene_npcs: str = "[]"
    current_location: str = ""
    session_summary: str = ""


class DeathRequest(BaseModel):
    character_id: int
    death_context: str


# ---------- Routes ----------

@router.post("/start_game")
async def start_game(
    req: StartGameRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate opening scene for a new game"""
    try:
        service = AIHubService()
        user_message = (
            f"请为以下角色生成开场场景：\n"
            f"姓名：{req.name}\n"
            f"身份：{req.identity}\n"
            f"出生地：{req.birthplace}\n"
            f"当前年份：{req.current_year}年\n\n"
            f"要求：\n"
            f"1. 以第二人称叙述\n"
            f"2. 包含当前年份与具体地点\n"
            f"3. 简短描述天下大势（通过路人对话或布告体现）\n"
            f"4. 生成2-4个NPC，每个NPC用JSON格式在叙事后附上：\n"
            f"[NPC_DATA]\n"
            f'[{{"name":"姓名","profession":"职业","emotion":"当前情绪","hidden_goal":"隐藏目的","attitude":"对玩家态度"}},...]\n'
            f"[/NPC_DATA]\n"
            f"5. 以开放式情境结束，给玩家留下选择空间"
        )

        gm_request = GenTxtRequest(
            messages=[
                ChatMessage(role="system", content=GM_SYSTEM_PROMPT),
                ChatMessage(role="user", content=user_message),
            ],
            model="claude-opus-4.6",
        )

        response = await service.gentxt(gm_request)
        full_text = response.content

        # Parse NPC data
        npcs = []
        npc_match = re.search(r"\[NPC_DATA\](.*?)\[/NPC_DATA\]", full_text, re.DOTALL)
        if npc_match:
            try:
                npcs = json.loads(npc_match.group(1).strip())
            except Exception:
                npcs = []

        # Clean narrative (remove NPC_DATA block)
        opening_narrative = re.sub(r"\[NPC_DATA\].*?\[/NPC_DATA\]", "", full_text, flags=re.DOTALL).strip()

        # Extract location from narrative (simple heuristic)
        location = req.birthplace

        return {
            "opening_narrative": opening_narrative,
            "npcs": npcs,
            "current_year": req.current_year,
            "location": location,
        }

    except Exception as e:
        logger.error(f"Error in start_game: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save_session")
async def save_session(
    req: SaveSessionRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save or update a game session"""
    try:
        # Check if session exists for this character
        result = await db.execute(
            select(Game_sessions)
            .where(Game_sessions.character_id == req.character_id)
            .where(Game_sessions.user_id == str(current_user.id))
            .order_by(desc(Game_sessions.updated_at))
            .limit(1)
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.messages = req.messages
            existing.npc_states = req.npc_states
            existing.world_events = req.world_events
            existing.scene_npcs = req.scene_npcs
            existing.current_location = req.current_location
            existing.session_summary = req.session_summary
            await db.commit()
            await db.refresh(existing)
            return {"session_id": existing.id, "success": True}
        else:
            new_session = Game_sessions(
                user_id=str(current_user.id),
                character_id=req.character_id,
                messages=req.messages,
                npc_states=req.npc_states,
                world_events=req.world_events,
                scene_npcs=req.scene_npcs,
                current_location=req.current_location,
                session_summary=req.session_summary,
            )
            db.add(new_session)
            await db.commit()
            await db.refresh(new_session)
            return {"session_id": new_session.id, "success": True}

    except Exception as e:
        logger.error(f"Error in save_session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/load_session/{character_id}")
async def load_session(
    character_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Load the latest game session for a character"""
    try:
        result = await db.execute(
            select(Game_sessions)
            .where(Game_sessions.character_id == character_id)
            .where(Game_sessions.user_id == str(current_user.id))
            .order_by(desc(Game_sessions.updated_at))
            .limit(1)
        )
        session = result.scalar_one_or_none()

        if not session:
            raise HTTPException(status_code=404, detail="No session found for this character")

        return {
            "session_id": session.id,
            "messages": session.messages or "[]",
            "npc_states": session.npc_states or "[]",
            "world_events": session.world_events or "[]",
            "scene_npcs": session.scene_npcs or "[]",
            "current_location": session.current_location or "",
            "session_summary": session.session_summary or "",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in load_session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/death")
async def handle_death(
    req: DeathRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Handle character death - generate death narrative and update character"""
    try:
        service = AIHubService()
        death_request = GenTxtRequest(
            messages=[
                ChatMessage(role="system", content=GM_SYSTEM_PROMPT),
                ChatMessage(
                    role="user",
                    content=(
                        f"角色在以下情境中死去：\n{req.death_context}\n\n"
                        f"请用200字以内，以第三人称写一段悲凉而克制的死亡叙事，"
                        f"体现乱世小人物的命运无常。结尾可以有一句简短的感慨。"
                        f"不要使用'游戏结束'等现代语言。"
                    ),
                ),
            ],
            model="claude-opus-4.6",
        )

        response = await service.gentxt(death_request)
        death_narrative = response.content

        # Update character: is_alive=False, death_story=narrative
        result = await db.execute(
            select(Characters)
            .where(Characters.id == req.character_id)
            .where(Characters.user_id == str(current_user.id))
        )
        character = result.scalar_one_or_none()
        if character:
            character.is_alive = False
            character.death_story = death_narrative
            await db.commit()

        return {"death_narrative": death_narrative}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in handle_death: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.game_sessions import Game_sessionsService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/game_sessions", tags=["game_sessions"])


# ---------- Pydantic Schemas ----------
class Game_sessionsData(BaseModel):
    """Entity data schema (for create/update)"""
    character_id: int
    messages: str = None
    npc_states: str = None
    world_events: str = None
    scene_npcs: str = None
    current_location: str = None
    session_summary: str = None


class Game_sessionsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    character_id: Optional[int] = None
    messages: Optional[str] = None
    npc_states: Optional[str] = None
    world_events: Optional[str] = None
    scene_npcs: Optional[str] = None
    current_location: Optional[str] = None
    session_summary: Optional[str] = None


class Game_sessionsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    character_id: int
    messages: Optional[str] = None
    npc_states: Optional[str] = None
    world_events: Optional[str] = None
    scene_npcs: Optional[str] = None
    current_location: Optional[str] = None
    session_summary: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Game_sessionsListResponse(BaseModel):
    """List response schema"""
    items: List[Game_sessionsResponse]
    total: int
    skip: int
    limit: int


class Game_sessionsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Game_sessionsData]


class Game_sessionsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Game_sessionsUpdateData


class Game_sessionsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Game_sessionsBatchUpdateItem]


class Game_sessionsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Game_sessionsListResponse)
async def query_game_sessionss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query game_sessionss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying game_sessionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Game_sessionsService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")
        
        result = await service.get_list(
            skip=skip, 
            limit=limit,
            query_dict=query_dict,
            sort=sort,
            user_id=str(current_user.id),
        )
        logger.debug(f"Found {result['total']} game_sessionss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying game_sessionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Game_sessionsListResponse)
async def query_game_sessionss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query game_sessionss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying game_sessionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Game_sessionsService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")

        result = await service.get_list(
            skip=skip,
            limit=limit,
            query_dict=query_dict,
            sort=sort
        )
        logger.debug(f"Found {result['total']} game_sessionss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying game_sessionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Game_sessionsResponse)
async def get_game_sessions(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single game_sessions by ID (user can only see their own records)"""
    logger.debug(f"Fetching game_sessions with id: {id}, fields={fields}")
    
    service = Game_sessionsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Game_sessions with id {id} not found")
            raise HTTPException(status_code=404, detail="Game_sessions not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching game_sessions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Game_sessionsResponse, status_code=201)
async def create_game_sessions(
    data: Game_sessionsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new game_sessions"""
    logger.debug(f"Creating new game_sessions with data: {data}")
    
    service = Game_sessionsService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create game_sessions")
        
        logger.info(f"Game_sessions created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating game_sessions: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating game_sessions: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Game_sessionsResponse], status_code=201)
async def create_game_sessionss_batch(
    request: Game_sessionsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple game_sessionss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} game_sessionss")
    
    service = Game_sessionsService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} game_sessionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Game_sessionsResponse])
async def update_game_sessionss_batch(
    request: Game_sessionsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple game_sessionss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} game_sessionss")
    
    service = Game_sessionsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} game_sessionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Game_sessionsResponse)
async def update_game_sessions(
    id: int,
    data: Game_sessionsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing game_sessions (requires ownership)"""
    logger.debug(f"Updating game_sessions {id} with data: {data}")

    service = Game_sessionsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Game_sessions with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Game_sessions not found")
        
        logger.info(f"Game_sessions {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating game_sessions {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating game_sessions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_game_sessionss_batch(
    request: Game_sessionsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple game_sessionss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} game_sessionss")
    
    service = Game_sessionsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} game_sessionss successfully")
        return {"message": f"Successfully deleted {deleted_count} game_sessionss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_game_sessions(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single game_sessions by ID (requires ownership)"""
    logger.debug(f"Deleting game_sessions with id: {id}")
    
    service = Game_sessionsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Game_sessions with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Game_sessions not found")
        
        logger.info(f"Game_sessions {id} deleted successfully")
        return {"message": "Game_sessions deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting game_sessions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
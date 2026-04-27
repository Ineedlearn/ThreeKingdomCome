import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.characters import CharactersService
from dependencies.auth import get_current_user
from schemas.auth import UserResponse

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/characters", tags=["characters"])


# ---------- Pydantic Schemas ----------
class CharactersData(BaseModel):
    """Entity data schema (for create/update)"""
    name: str
    gender: str = None
    identity: str
    birthplace: str
    current_year: int = None
    reputation: str = None
    relations: str = None
    situation: str = None
    is_alive: bool = None
    death_story: str = None
    play_count: int = None


class CharactersUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    name: Optional[str] = None
    gender: Optional[str] = None
    identity: Optional[str] = None
    birthplace: Optional[str] = None
    current_year: Optional[int] = None
    reputation: Optional[str] = None
    relations: Optional[str] = None
    situation: Optional[str] = None
    is_alive: Optional[bool] = None
    death_story: Optional[str] = None
    play_count: Optional[int] = None


class CharactersResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    name: str
    gender: Optional[str] = None
    identity: str
    birthplace: str
    current_year: Optional[int] = None
    reputation: Optional[str] = None
    relations: Optional[str] = None
    situation: Optional[str] = None
    is_alive: Optional[bool] = None
    death_story: Optional[str] = None
    play_count: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CharactersListResponse(BaseModel):
    """List response schema"""
    items: List[CharactersResponse]
    total: int
    skip: int
    limit: int


class CharactersBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[CharactersData]


class CharactersBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: CharactersUpdateData


class CharactersBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[CharactersBatchUpdateItem]


class CharactersBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=CharactersListResponse)
async def query_characterss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query characterss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying characterss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = CharactersService(db)
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
        logger.debug(f"Found {result['total']} characterss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying characterss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=CharactersListResponse)
async def query_characterss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query characterss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying characterss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = CharactersService(db)
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
        logger.debug(f"Found {result['total']} characterss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying characterss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=CharactersResponse)
async def get_characters(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single characters by ID (user can only see their own records)"""
    logger.debug(f"Fetching characters with id: {id}, fields={fields}")
    
    service = CharactersService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Characters with id {id} not found")
            raise HTTPException(status_code=404, detail="Characters not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching characters {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=CharactersResponse, status_code=201)
async def create_characters(
    data: CharactersData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new characters"""
    logger.debug(f"Creating new characters with data: {data}")
    
    service = CharactersService(db)
    try:
        result = await service.create(data.model_dump(), user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create characters")
        
        logger.info(f"Characters created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating characters: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating characters: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[CharactersResponse], status_code=201)
async def create_characterss_batch(
    request: CharactersBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple characterss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} characterss")
    
    service = CharactersService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump(), user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} characterss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[CharactersResponse])
async def update_characterss_batch(
    request: CharactersBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple characterss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} characterss")
    
    service = CharactersService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} characterss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=CharactersResponse)
async def update_characters(
    id: int,
    data: CharactersUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing characters (requires ownership)"""
    logger.debug(f"Updating characters {id} with data: {data}")

    service = CharactersService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Characters with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Characters not found")
        
        logger.info(f"Characters {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating characters {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating characters {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_characterss_batch(
    request: CharactersBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple characterss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} characterss")
    
    service = CharactersService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} characterss successfully")
        return {"message": f"Successfully deleted {deleted_count} characterss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_characters(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single characters by ID (requires ownership)"""
    logger.debug(f"Deleting characters with id: {id}")
    
    service = CharactersService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Characters with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Characters not found")
        
        logger.info(f"Characters {id} deleted successfully")
        return {"message": "Characters deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting characters {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ========== Note Image Schemas ==========

class NoteImageBase(BaseModel):
    """Базовые поля изображения"""
    image_url: str = Field(..., max_length=500)
    order: int = Field(0, ge=0)


class NoteImageCreate(NoteImageBase):
    """Создание изображения"""
    file_id: str


class NoteImageUpdate(BaseModel):
    """Обновление изображения"""
    order: Optional[int] = Field(None, ge=0)


class NoteImageResponse(NoteImageBase):
    """Ответ с данными изображения"""
    id: str
    file_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# ========== Note File Schemas ==========

class NoteFileBase(BaseModel):
    """Базовые поля файла заметки"""
    name: str = Field(..., min_length=1, max_length=200)
    content: Optional[str] = ""
    order: int = Field(0, ge=0)


class NoteFileCreate(NoteFileBase):
    """Создание файла заметки"""
    pass


class NoteFileUpdate(BaseModel):
    """Обновление файла заметки"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = None
    order: Optional[int] = Field(None, ge=0)


class NoteFileResponse(NoteFileBase):
    """Ответ с данными файла заметки"""
    id: str
    folder_id: str
    created_at: datetime
    updated_at: datetime
    images: List[NoteImageResponse] = []

    class Config:
        from_attributes = True


# ========== Note Folder Schemas ==========

class NoteFolderBase(BaseModel):
    """Базовые поля папки"""
    name: str = Field(..., min_length=1, max_length=200)
    order: int = Field(0, ge=0)


class NoteFolderCreate(NoteFolderBase):
    """Создание папки"""
    pass


class NoteFolderUpdate(BaseModel):
    """Обновление папки"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    order: Optional[int] = Field(None, ge=0)


class NoteFolderResponse(NoteFolderBase):
    """Ответ с данными папки"""
    id: str
    area_id: str
    created_at: datetime
    updated_at: datetime
    files: List[NoteFileResponse] = []

    class Config:
        from_attributes = True


# ========== Note Area Schemas ==========

class NoteAreaBase(BaseModel):
    """Базовые поля области знаний"""
    name: str = Field(..., min_length=1, max_length=200)
    order: int = Field(0, ge=0)


class NoteAreaCreate(NoteAreaBase):
    """Создание области знаний"""
    pass


class NoteAreaUpdate(BaseModel):
    """Обновление области знаний"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    order: Optional[int] = Field(None, ge=0)


class NoteAreaResponse(NoteAreaBase):
    """Ответ с данными области знаний"""
    id: str
    created_at: datetime
    updated_at: datetime
    folders: List[NoteFolderResponse] = []

    class Config:
        from_attributes = True


# ========== Full Tree Response ==========

class NoteFilePreviewResponse(BaseModel):
    """Краткая информация о файле для дерева"""
    id: str
    name: str
    content_preview: str = Field(..., description="First 200 characters of content")
    order: int
    updated_at: datetime
    images_count: int

    class Config:
        from_attributes = True


class NoteFolderTreeResponse(BaseModel):
    """Папка в дереве"""
    id: str
    name: str
    order: int
    files: List[NoteFilePreviewResponse]

    class Config:
        from_attributes = True


class NoteAreaTreeResponse(BaseModel):
    """Область в дереве"""
    id: str
    name: str
    order: int
    folders: List[NoteFolderTreeResponse]

    class Config:
        from_attributes = True


class NoteFullTreeResponse(BaseModel):
    """Полное дерево заметок"""
    areas: List[NoteAreaTreeResponse]

    class Config:
        from_attributes = True
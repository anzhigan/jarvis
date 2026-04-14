from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
import shutil
import os
from uuid import uuid4
from datetime import datetime

from app.dependencies.db import get_db
from app.models.note import NoteArea, NoteFolder, NoteFile, NoteImage
from app.schemas.note import (
    NoteAreaResponse, NoteAreaCreate, NoteAreaUpdate,
    NoteFolderResponse, NoteFolderCreate, NoteFolderUpdate,
    NoteFileResponse, NoteFileCreate, NoteFileUpdate,
    NoteImageResponse, NoteImageCreate
)
from app.core.config import settings

router = APIRouter(prefix="/notes", tags=["Notes"])


# ========== AREAS (Области знаний) ==========

@router.get("/areas", response_model=List[NoteAreaResponse])
def get_areas(
        db: Session = Depends(get_db),
        skip: int = 0,
        limit: int = 100
):
    """
    Получить все области знаний (Career, Science, EQ и т.д.)
    """
    areas = db.query(NoteArea).order_by(NoteArea.order).offset(skip).limit(limit).all()
    return areas


@router.post("/areas", response_model=NoteAreaResponse, status_code=201)
def create_area(
        area: NoteAreaCreate,
        db: Session = Depends(get_db)
):
    """
    Создать новую область знаний
    """
    # Проверяем, существует ли область с таким именем
    existing = db.query(NoteArea).filter(NoteArea.name == area.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Area '{area.name}' already exists")

    new_area = NoteArea(
        name=area.name,
        order=area.order
    )
    db.add(new_area)
    db.commit()
    db.refresh(new_area)
    return new_area


@router.get("/areas/{area_id}", response_model=NoteAreaResponse)
def get_area(
        area_id: str,
        db: Session = Depends(get_db)
):
    """
    Получить область знаний по ID
    """
    area = db.query(NoteArea).filter(NoteArea.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")
    return area


@router.put("/areas/{area_id}", response_model=NoteAreaResponse)
def update_area(
        area_id: str,
        area_update: NoteAreaUpdate,
        db: Session = Depends(get_db)
):
    """
    Обновить область знаний
    """
    area = db.query(NoteArea).filter(NoteArea.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    if area_update.name is not None:
        area.name = area_update.name
    if area_update.order is not None:
        area.order = area_update.order

    db.commit()
    db.refresh(area)
    return area


@router.delete("/areas/{area_id}")
def delete_area(
        area_id: str,
        db: Session = Depends(get_db)
):
    """
    Удалить область знаний (все папки и файлы внутри удалятся автоматически)
    """
    area = db.query(NoteArea).filter(NoteArea.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    db.delete(area)
    db.commit()
    return {"message": "Area deleted successfully", "area_id": area_id}


# ========== FOLDERS (Папки) ==========

@router.post("/folders", response_model=NoteFolderResponse, status_code=201)
def create_folder(
        folder: NoteFolderCreate,
        area_id: str,
        db: Session = Depends(get_db)
):
    """
    Создать новую папку в области знаний
    """
    # Проверяем, существует ли область
    area = db.query(NoteArea).filter(NoteArea.id == area_id).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    # Проверяем, существует ли папка с таким именем в этой области
    existing = db.query(NoteFolder).filter(
        NoteFolder.name == folder.name,
        NoteFolder.area_id == area_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Folder '{folder.name}' already exists in this area")

    new_folder = NoteFolder(
        name=folder.name,
        area_id=area_id,
        order=folder.order
    )
    db.add(new_folder)
    db.commit()
    db.refresh(new_folder)
    return new_folder


@router.get("/folders/{folder_id}", response_model=NoteFolderResponse)
def get_folder(
        folder_id: str,
        db: Session = Depends(get_db)
):
    """
    Получить папку по ID
    """
    folder = db.query(NoteFolder).filter(NoteFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


@router.put("/folders/{folder_id}", response_model=NoteFolderResponse)
def update_folder(
        folder_id: str,
        folder_update: NoteFolderUpdate,
        db: Session = Depends(get_db)
):
    """
    Обновить папку
    """
    folder = db.query(NoteFolder).filter(NoteFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    if folder_update.name is not None:
        folder.name = folder_update.name
    if folder_update.order is not None:
        folder.order = folder_update.order

    db.commit()
    db.refresh(folder)
    return folder


@router.delete("/folders/{folder_id}")
def delete_folder(
        folder_id: str,
        db: Session = Depends(get_db)
):
    """
    Удалить папку (все файлы внутри удалятся автоматически)
    """
    folder = db.query(NoteFolder).filter(NoteFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    db.delete(folder)
    db.commit()
    return {"message": "Folder deleted successfully", "folder_id": folder_id}


# ========== FILES (Файлы с заметками) ==========

@router.post("/files", response_model=NoteFileResponse, status_code=201)
def create_file(
        file: NoteFileCreate,
        folder_id: str,
        db: Session = Depends(get_db)
):
    """
    Создать новый файл заметки в папке
    """
    # Проверяем, существует ли папка
    folder = db.query(NoteFolder).filter(NoteFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    # Проверяем, существует ли файл с таким именем в этой папке
    existing = db.query(NoteFile).filter(
        NoteFile.name == file.name,
        NoteFile.folder_id == folder_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"File '{file.name}' already exists in this folder")

    new_file = NoteFile(
        name=file.name,
        content=file.content or "",
        folder_id=folder_id,
        order=file.order
    )
    db.add(new_file)
    db.commit()
    db.refresh(new_file)
    return new_file


@router.get("/files", response_model=List[NoteFileResponse])
def get_files(
        folder_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
        db: Session = Depends(get_db)
):
    """
    Получить список файлов (можно фильтровать по folder_id)
    """
    query = db.query(NoteFile)
    if folder_id:
        query = query.filter(NoteFile.folder_id == folder_id)

    files = query.order_by(NoteFile.order).offset(skip).limit(limit).all()
    return files


@router.get("/files/{file_id}", response_model=NoteFileResponse)
def get_file(
        file_id: str,
        db: Session = Depends(get_db)
):
    """
    Получить файл заметки по ID
    """
    file = db.query(NoteFile).filter(NoteFile.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    return file


@router.put("/files/{file_id}", response_model=NoteFileResponse)
def update_file(
        file_id: str,
        file_update: NoteFileUpdate,
        db: Session = Depends(get_db)
):
    """
    Обновить файл заметки (содержимое, имя, порядок)
    """
    file = db.query(NoteFile).filter(NoteFile.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    if file_update.name is not None:
        file.name = file_update.name
    if file_update.content is not None:
        file.content = file_update.content
    if file_update.order is not None:
        file.order = file_update.order

    file.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(file)
    return file


@router.patch("/files/{file_id}/content")
def update_file_content(
        file_id: str,
        content: str,
        db: Session = Depends(get_db)
):
    """
    Быстрое обновление только содержимого файла
    """
    file = db.query(NoteFile).filter(NoteFile.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    file.content = content
    file.updated_at = datetime.utcnow()

    db.commit()
    return {"message": "Content updated successfully", "file_id": file_id}


@router.delete("/files/{file_id}")
def delete_file(
        file_id: str,
        db: Session = Depends(get_db)
):
    """
    Удалить файл заметки (все изображения внутри удалятся автоматически)
    """
    file = db.query(NoteFile).filter(NoteFile.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    # Удаляем все связанные изображения с диска
    for image in file.images:
        filepath = os.path.join(settings.UPLOAD_DIR, "notes", os.path.basename(image.image_url))
        if os.path.exists(filepath):
            os.remove(filepath)

    db.delete(file)
    db.commit()
    return {"message": "File deleted successfully", "file_id": file_id}


# ========== IMAGES (Изображения) ==========

@router.post("/files/{file_id}/images", response_model=NoteImageResponse, status_code=201)
async def upload_image(
        file_id: str,
        image: UploadFile = File(...),
        db: Session = Depends(get_db)
):
    """
    Загрузить изображение для файла заметки
    """
    # Проверяем, существует ли файл
    file = db.query(NoteFile).filter(NoteFile.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    # Проверяем расширение файла
    file_extension = os.path.splitext(image.filename)[1].lower()
    if file_extension not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File extension {file_extension} not allowed. Allowed: {settings.ALLOWED_EXTENSIONS}"
        )

    # Создаем директорию, если её нет
    upload_dir = os.path.join(settings.UPLOAD_DIR, "notes")
    os.makedirs(upload_dir, exist_ok=True)

    # Сохраняем файл
    filename = f"{uuid4()}{file_extension}"
    filepath = os.path.join(upload_dir, filename)

    try:
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save image: {str(e)}")

    # Сохраняем запись в БД
    image_url = f"/uploads/notes/{filename}"
    new_image = NoteImage(
        file_id=file_id,
        image_url=image_url,
        order=0
    )
    db.add(new_image)
    db.commit()
    db.refresh(new_image)

    return new_image


@router.get("/files/{file_id}/images", response_model=List[NoteImageResponse])
def get_file_images(
        file_id: str,
        db: Session = Depends(get_db)
):
    """
    Получить все изображения для файла
    """
    images = db.query(NoteImage).filter(NoteImage.file_id == file_id).order_by(NoteImage.order).all()
    return images


@router.delete("/images/{image_id}")
def delete_image(
        image_id: str,
        db: Session = Depends(get_db)
):
    """
    Удалить изображение
    """
    image = db.query(NoteImage).filter(NoteImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Удаляем файл с диска
    filepath = os.path.join(settings.UPLOAD_DIR, "notes", os.path.basename(image.image_url))
    if os.path.exists(filepath):
        os.remove(filepath)

    db.delete(image)
    db.commit()
    return {"message": "Image deleted successfully", "image_id": image_id}


# ========== BULK OPERATIONS (Массовые операции) ==========

@router.get("/full-tree")
def get_full_tree(db: Session = Depends(get_db)):
    """
    Получить полную структуру заметок (все области, папки, файлы)
    """
    areas = db.query(NoteArea).order_by(NoteArea.order).all()

    result = []
    for area in areas:
        area_data = {
            "id": area.id,
            "name": area.name,
            "order": area.order,
            "folders": []
        }

        for folder in area.folders:
            folder_data = {
                "id": folder.id,
                "name": folder.name,
                "order": folder.order,
                "files": []
            }

            for file in folder.files:
                file_data = {
                    "id": file.id,
                    "name": file.name,
                    "content": file.content[:200] if file.content else "",  # превью содержимого
                    "order": file.order,
                    "updated_at": file.updated_at,
                    "images_count": len(file.images)
                }
                folder_data["files"].append(file_data)

            area_data["folders"].append(folder_data)

        result.append(area_data)

    return result
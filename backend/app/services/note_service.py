from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict, Any
from fastapi import HTTPException, status, UploadFile

from app.models.note import NoteArea, NoteFolder, NoteFile, NoteImage
from app.schemas.note import (
    NoteAreaCreate, NoteAreaUpdate,
    NoteFolderCreate, NoteFolderUpdate,
    NoteFileCreate, NoteFileUpdate,
    NoteImageCreate,
)
from app.services.upload_service import UploadService


class NoteService:
    """
    Сервис для работы с заметками
    """

    def __init__(self, db: Session):
        self.db = db
        self.upload_service = UploadService(db)

    # ========== AREA OPERATIONS ==========

    def get_areas(
            self,
            skip: int = 0,
            limit: int = 100
    ) -> List[NoteArea]:
        """Получить все области знаний"""
        return self.db.query(NoteArea).order_by(NoteArea.order).offset(skip).limit(limit).all()

    def get_area(self, area_id: str) -> NoteArea:
        """Получить область по ID"""
        area = self.db.query(NoteArea).filter(NoteArea.id == area_id).first()
        if not area:
            raise HTTPException(status_code=404, detail=f"Area {area_id} not found")
        return area

    def create_area(self, area_data: NoteAreaCreate) -> NoteArea:
        """Создать область знаний"""
        existing = self.db.query(NoteArea).filter(NoteArea.name == area_data.name).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Area '{area_data.name}' already exists")

        area = NoteArea(
            name=area_data.name,
            order=area_data.order
        )
        self.db.add(area)
        self.db.commit()
        self.db.refresh(area)
        return area

    def update_area(self, area_id: str, area_data: NoteAreaUpdate) -> NoteArea:
        """Обновить область знаний"""
        area = self.get_area(area_id)

        if area_data.name is not None:
            # Проверяем уникальность имени
            existing = self.db.query(NoteArea).filter(
                NoteArea.name == area_data.name,
                NoteArea.id != area_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Area '{area_data.name}' already exists")
            area.name = area_data.name

        if area_data.order is not None:
            area.order = area_data.order

        self.db.commit()
        self.db.refresh(area)
        return area

    def delete_area(self, area_id: str) -> Dict[str, Any]:
        """Удалить область знаний"""
        area = self.get_area(area_id)

        # Удаляем все связанные изображения с диска
        for folder in area.folders:
            for file in folder.files:
                for image in file.images:
                    self.upload_service.delete_file(image.image_url)

        self.db.delete(area)
        self.db.commit()
        return {"message": "Area deleted", "area_id": area_id}

    # ========== FOLDER OPERATIONS ==========

    def get_folders(
            self,
            area_id: Optional[str] = None,
            skip: int = 0,
            limit: int = 100
    ) -> List[NoteFolder]:
        """Получить папки"""
        query = self.db.query(NoteFolder)
        if area_id:
            query = query.filter(NoteFolder.area_id == area_id)
        return query.order_by(NoteFolder.order).offset(skip).limit(limit).all()

    def get_folder(self, folder_id: str) -> NoteFolder:
        """Получить папку по ID"""
        folder = self.db.query(NoteFolder).filter(NoteFolder.id == folder_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail=f"Folder {folder_id} not found")
        return folder

    def create_folder(self, folder_data: NoteFolderCreate, area_id: str) -> NoteFolder:
        """Создать папку"""
        # Проверяем существование области
        area = self.get_area(area_id)

        # Проверяем уникальность имени в области
        existing = self.db.query(NoteFolder).filter(
            NoteFolder.name == folder_data.name,
            NoteFolder.area_id == area_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Folder '{folder_data.name}' already exists in this area")

        folder = NoteFolder(
            name=folder_data.name,
            area_id=area_id,
            order=folder_data.order
        )
        self.db.add(folder)
        self.db.commit()
        self.db.refresh(folder)
        return folder

    def update_folder(self, folder_id: str, folder_data: NoteFolderUpdate) -> NoteFolder:
        """Обновить папку"""
        folder = self.get_folder(folder_id)

        if folder_data.name is not None:
            # Проверяем уникальность имени в области
            existing = self.db.query(NoteFolder).filter(
                NoteFolder.name == folder_data.name,
                NoteFolder.area_id == folder.area_id,
                NoteFolder.id != folder_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Folder '{folder_data.name}' already exists in this area")
            folder.name = folder_data.name

        if folder_data.order is not None:
            folder.order = folder_data.order

        self.db.commit()
        self.db.refresh(folder)
        return folder

    def delete_folder(self, folder_id: str) -> Dict[str, Any]:
        """Удалить папку"""
        folder = self.get_folder(folder_id)

        # Удаляем все связанные изображения с диска
        for file in folder.files:
            for image in file.images:
                self.upload_service.delete_file(image.image_url)

        self.db.delete(folder)
        self.db.commit()
        return {"message": "Folder deleted", "folder_id": folder_id}

    # ========== FILE OPERATIONS ==========

    def get_files(
            self,
            folder_id: Optional[str] = None,
            skip: int = 0,
            limit: int = 100
    ) -> List[NoteFile]:
        """Получить файлы заметок"""
        query = self.db.query(NoteFile)
        if folder_id:
            query = query.filter(NoteFile.folder_id == folder_id)
        return query.order_by(NoteFile.order).offset(skip).limit(limit).all()

    def get_file(self, file_id: str) -> NoteFile:
        """Получить файл заметки по ID"""
        file = self.db.query(NoteFile).filter(NoteFile.id == file_id).first()
        if not file:
            raise HTTPException(status_code=404, detail=f"File {file_id} not found")
        return file

    def create_file(self, file_data: NoteFileCreate, folder_id: str) -> NoteFile:
        """Создать файл заметки"""
        # Проверяем существование папки
        folder = self.get_folder(folder_id)

        # Проверяем уникальность имени в папке
        existing = self.db.query(NoteFile).filter(
            NoteFile.name == file_data.name,
            NoteFile.folder_id == folder_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"File '{file_data.name}' already exists in this folder")

        file = NoteFile(
            name=file_data.name,
            content=file_data.content or "",
            folder_id=folder_id,
            order=file_data.order
        )
        self.db.add(file)
        self.db.commit()
        self.db.refresh(file)
        return file

    def update_file(self, file_id: str, file_data: NoteFileUpdate) -> NoteFile:
        """Обновить файл заметки"""
        file = self.get_file(file_id)

        if file_data.name is not None:
            # Проверяем уникальность имени в папке
            existing = self.db.query(NoteFile).filter(
                NoteFile.name == file_data.name,
                NoteFile.folder_id == file.folder_id,
                NoteFile.id != file_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"File '{file_data.name}' already exists in this folder")
            file.name = file_data.name

        if file_data.content is not None:
            file.content = file_data.content

        if file_data.order is not None:
            file.order = file_data.order

        self.db.commit()
        self.db.refresh(file)
        return file

    def update_file_content(self, file_id: str, content: str) -> NoteFile:
        """Быстрое обновление содержимого файла"""
        file = self.get_file(file_id)
        file.content = content
        self.db.commit()
        self.db.refresh(file)
        return file

    def delete_file(self, file_id: str) -> Dict[str, Any]:
        """Удалить файл заметки"""
        file = self.get_file(file_id)

        # Удаляем все связанные изображения с диска
        for image in file.images:
            self.upload_service.delete_file(image.image_url)

        self.db.delete(file)
        self.db.commit()
        return {"message": "File deleted", "file_id": file_id}

    # ========== IMAGE OPERATIONS ==========

    def add_image(self, file_id: str, image_url: str, order: int = 0) -> NoteImage:
        """Добавить изображение к файлу"""
        file = self.get_file(file_id)

        image = NoteImage(
            file_id=file_id,
            image_url=image_url,
            order=order
        )
        self.db.add(image)
        self.db.commit()
        self.db.refresh(image)
        return image

    def delete_image(self, image_id: str) -> Dict[str, Any]:
        """Удалить изображение"""
        image = self.db.query(NoteImage).filter(NoteImage.id == image_id).first()
        if not image:
            raise HTTPException(status_code=404, detail=f"Image {image_id} not found")

        # Удаляем файл с диска
        self.upload_service.delete_file(image.image_url)

        self.db.delete(image)
        self.db.commit()
        return {"message": "Image deleted", "image_id": image_id}

    def get_file_images(self, file_id: str) -> List[NoteImage]:
        """Получить все изображения файла"""
        return self.db.query(NoteImage).filter(NoteImage.file_id == file_id).order_by(NoteImage.order).all()

    # ========== TREE OPERATIONS ==========

    def get_full_tree(self) -> List[Dict[str, Any]]:
        """Получить полное дерево заметок"""
        areas = self.db.query(NoteArea).order_by(NoteArea.order).all()

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
                        "content_preview": file.content[:200] if file.content else "",
                        "order": file.order,
                        "updated_at": file.updated_at,
                        "images_count": len(file.images)
                    }
                    folder_data["files"].append(file_data)

                area_data["folders"].append(folder_data)

            result.append(area_data)

        return result

    # ========== SEARCH OPERATIONS ==========

    def search_files(
            self,
            query: str,
            folder_id: Optional[str] = None,
            limit: int = 50
    ) -> List[NoteFile]:
        """Поиск по файлам заметок"""
        search_query = self.db.query(NoteFile).filter(
            NoteFile.name.ilike(f"%{query}%") | NoteFile.content.ilike(f"%{query}%")
        )

        if folder_id:
            search_query = search_query.filter(NoteFile.folder_id == folder_id)

        return search_query.limit(limit).all()

    # ========== STATISTICS ==========

    def get_statistics(self) -> Dict[str, Any]:
        """Получить статистику по заметкам"""
        areas_count = self.db.query(func.count(NoteArea.id)).scalar()
        folders_count = self.db.query(func.count(NoteFolder.id)).scalar()
        files_count = self.db.query(func.count(NoteFile.id)).scalar()
        images_count = self.db.query(func.count(NoteImage.id)).scalar()

        # Общий объем текста
        total_content_length = self.db.query(func.sum(func.length(NoteFile.content))).scalar() or 0

        return {
            "areas": areas_count,
            "folders": folders_count,
            "files": files_count,
            "images": images_count,
            "total_content_length": total_content_length,
            "total_content_length_kb": round(total_content_length / 1024, 2)
        }
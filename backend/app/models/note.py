import uuid
from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.models.base import Base


class NoteArea(Base):
    """
    Область знаний (Career, Science, EQ и т.д.)
    """
    __tablename__ = "note_areas"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(200), nullable=False)
    order = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Отношения
    folders = relationship(
        "NoteFolder",
        back_populates="area",
        cascade="all, delete-orphan",
        order_by="NoteFolder.order"
    )

    def __repr__(self):
        return f"<NoteArea {self.name}>"


class NoteFolder(Base):
    """
    Папка внутри области знаний (ML, DE, Physics и т.д.)
    """
    __tablename__ = "note_folders"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(200), nullable=False)
    area_id = Column(String(36), ForeignKey("note_areas.id", ondelete="CASCADE"))
    order = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Отношения
    area = relationship("NoteArea", back_populates="folders")
    files = relationship(
        "NoteFile",
        back_populates="folder",
        cascade="all, delete-orphan",
        order_by="NoteFile.order"
    )

    def __repr__(self):
        return f"<NoteFolder {self.name}>"


class NoteFile(Base):
    """
    Файл заметки с содержимым
    """
    __tablename__ = "note_files"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(200), nullable=False)
    content = Column(Text, default="")
    folder_id = Column(String(36), ForeignKey("note_folders.id", ondelete="CASCADE"))
    order = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Отношения
    folder = relationship("NoteFolder", back_populates="files")
    images = relationship(
        "NoteImage",
        back_populates="file",
        cascade="all, delete-orphan",
        order_by="NoteImage.order"
    )

    def __repr__(self):
        return f"<NoteFile {self.name}>"


class NoteImage(Base):
    """
    Изображение для заметки
    """
    __tablename__ = "note_images"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    file_id = Column(String(36), ForeignKey("note_files.id", ondelete="CASCADE"))
    image_url = Column(String(500), nullable=False)
    order = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Отношения
    file = relationship("NoteFile", back_populates="images")

    def __repr__(self):
        return f"<NoteImage {self.image_url}>"
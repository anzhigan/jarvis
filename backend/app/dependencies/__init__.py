# DB
from app.dependencies.db import get_db, get_read_only_db

# Auth
from app.dependencies.auth import (
    get_current_user,
    get_current_active_user,
    get_current_admin_user,
    get_current_user_optional,
    check_owner_or_admin,
    check_admin_only,
    check_active_only,
)

# Pagination
from app.dependencies.pagination import (
    PaginationParams,
    get_pagination,
    paginate_query,
    PaginatedResponse,
    SortDirection,
    apply_sorting,
)

# Upload
from app.dependencies.upload import (
    FileUploadHandler,
    get_file_upload_handler,
    validate_file_upload,
    save_note_image,
    save_task_attachment,
    save_user_avatar,
    file_upload_handler,
)

# Rate Limit
from app.dependencies.rate_limit import (
    rate_limit_dependency,
    rate_limit,
    strict_rate_limit,
    medium_rate_limit,
    relaxed_rate_limit,
    no_rate_limit,
    get_client_key,
    get_user_key,
)

__all__ = [
    # DB
    "get_db",
    "get_read_only_db",

    # Auth
    "get_current_user",
    "get_current_active_user",
    "get_current_admin_user",
    "get_current_user_optional",
    "check_owner_or_admin",
    "check_admin_only",
    "check_active_only",

    # Pagination
    "PaginationParams",
    "get_pagination",
    "paginate_query",
    "PaginatedResponse",
    "SortDirection",
    "apply_sorting",

    # Upload
    "FileUploadHandler",
    "get_file_upload_handler",
    "validate_file_upload",
    "save_note_image",
    "save_task_attachment",
    "save_user_avatar",
    "file_upload_handler",

    # Rate Limit
    "rate_limit_dependency",
    "rate_limit",
    "strict_rate_limit",
    "medium_rate_limit",
    "relaxed_rate_limit",
    "no_rate_limit",
    "get_client_key",
    "get_user_key",
]
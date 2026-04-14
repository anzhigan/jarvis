import re
from typing import Tuple, Optional
from datetime import date
from urllib.parse import urlparse
import html


def validate_email(email: str) -> bool:
    """
    Проверка валидности email адреса
    """
    if not email:
        return False

    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_phone(phone: str) -> bool:
    """
    Проверка валидности номера телефона
    Поддерживает международный формат: +7 (123) 456-78-90
    """
    if not phone:
        return False

    # Удаляем все нецифровые символы
    digits = re.sub(r'\D', '', phone)

    # Проверяем длину (от 10 до 15 цифр)
    return 10 <= len(digits) <= 15


def validate_url(url: str) -> bool:
    """
    Проверка валидности URL
    """
    if not url:
        return False

    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except Exception:
        return False


def validate_date_range(
        start_date: date,
        end_date: date,
        allow_equal: bool = True
) -> Tuple[bool, Optional[str]]:
    """
    Проверка диапазона дат

    Returns:
        (is_valid, error_message)
    """
    if not start_date or not end_date:
        return False, "Both start_date and end_date are required"

    if allow_equal:
        if start_date > end_date:
            return False, "Start date cannot be later than end date"
    else:
        if start_date >= end_date:
            return False, "Start date must be before end date"

    return True, None


def validate_password_strength(
        password: str,
        min_length: int = 8,
        require_upper: bool = True,
        require_lower: bool = True,
        require_digit: bool = True,
        require_special: bool = False
) -> Tuple[bool, Optional[str]]:
    """
    Проверка сложности пароля

    Returns:
        (is_valid, error_message)
    """
    if len(password) < min_length:
        return False, f"Password must be at least {min_length} characters long"

    if require_upper and not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"

    if require_lower and not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"

    if require_digit and not re.search(r'\d', password):
        return False, "Password must contain at least one digit"

    if require_special and not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return False, "Password must contain at least one special character"

    return True, None


def sanitize_html(text: str, allowed_tags: Optional[list] = None) -> str:
    """
    Очистка HTML от опасных тегов
    """
    if not text:
        return ""

    if allowed_tags is None:
        allowed_tags = ['b', 'i', 'u', 'strong', 'em', 'p', 'br', 'a']

    # Экранируем HTML
    escaped = html.escape(text)

    # Разрешаем определенные теги
    for tag in allowed_tags:
        escaped = escaped.replace(f'&lt;{tag}&gt;', f'<{tag}>')
        escaped = escaped.replace(f'&lt;/{tag}&gt;', f'</{tag}>')

    return escaped


def sanitize_input(text: str, max_length: Optional[int] = None) -> str:
    """
    Очистка пользовательского ввода
    """
    if not text:
        return ""

    # Удаляем лишние пробелы
    text = ' '.join(text.split())

    # Ограничиваем длину
    if max_length and len(text) > max_length:
        text = text[:max_length]

    return text


def is_valid_priority(priority: str) -> bool:
    """
    Проверка валидности приоритета задачи
    """
    return priority in ['high', 'medium', 'low']


def is_valid_status(status: str) -> bool:
    """
    Проверка валидности статуса задачи
    """
    return status in ['todo', 'in_progress', 'done']


def validate_file_extension(
        filename: str,
        allowed_extensions: set
) -> bool:
    """
    Проверка расширения файла
    """
    if not filename:
        return False

    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    return f".{ext}" in allowed_extensions


def validate_file_size(
        file_size: int,
        max_size: int
) -> bool:
    """
    Проверка размера файла
    """
    return file_size <= max_size


def validate_username(username: str) -> Tuple[bool, Optional[str]]:
    """
    Проверка username
    """
    if not username:
        return False, "Username is required"

    if len(username) < 3:
        return False, "Username must be at least 3 characters"

    if len(username) > 50:
        return False, "Username must be less than 50 characters"

    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        return False, "Username can only contain letters, numbers and underscore"

    return True, None


def validate_title(title: str, max_length: int = 500) -> Tuple[bool, Optional[str]]:
    """
    Проверка заголовка задачи/заметки
    """
    if not title:
        return False, "Title is required"

    if len(title) > max_length:
        return False, f"Title must be less than {max_length} characters"

    return True, None
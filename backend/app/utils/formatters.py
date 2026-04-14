from typing import Optional
from datetime import timedelta


def format_duration(seconds: int, short: bool = False) -> str:
    """
    Форматирование длительности в человеко-читаемый формат

    Examples:
        format_duration(3665) -> "1h 1m 5s"
        format_duration(3665, short=True) -> "1h 1m"
    """
    if not seconds:
        return "0s"

    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60

    parts = []
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0 and not (short and hours > 0):
        parts.append(f"{minutes}m")
    if secs > 0 and not short:
        parts.append(f"{secs}s")

    return " ".join(parts) if parts else "0s"


def format_file_size(size_bytes: int) -> str:
    """
    Форматирование размера файла

    Examples:
        format_file_size(1024) -> "1.00 KB"
        format_file_size(1048576) -> "1.00 MB"
    """
    if size_bytes == 0:
        return "0 B"

    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    size = float(size_bytes)

    while size >= 1024 and i < len(size_names) - 1:
        size /= 1024
        i += 1

    return f"{size:.2f} {size_names[i]}"


def format_currency(
        amount: float,
        currency: str = "USD",
        locale: str = "en_US"
) -> str:
    """
    Форматирование валюты
    """
    try:
        import locale
        locale.setlocale(locale.LC_ALL, locale)
        return locale.currency(amount, symbol=True, grouping=True)
    except Exception:
        symbols = {"USD": "$", "EUR": "€", "GBP": "£", "RUB": "₽"}
        symbol = symbols.get(currency, currency)
        return f"{symbol}{amount:,.2f}"


def format_percentage(
        value: float,
        total: float,
        decimals: int = 1
) -> str:
    """
    Форматирование процента
    """
    if total == 0:
        return "0%"

    percentage = (value / total) * 100
    return f"{percentage:.{decimals}f}%"


def format_phone(phone: str, country_code: str = "+7") -> str:
    """
    Форматирование номера телефона
    """
    # Удаляем все нецифровые символы
    digits = re.sub(r'\D', '', phone)

    if len(digits) == 10:
        return f"{country_code} ({digits[:3]}) {digits[3:6]}-{digits[6:8]}-{digits[8:10]}"
    elif len(digits) == 11:
        return f"+{digits[0]} ({digits[1:4]}) {digits[4:7]}-{digits[7:9]}-{digits[9:11]}"

    return phone


def truncate_text(text: str, max_length: int = 100, suffix: str = "...") -> str:
    """
    Обрезание текста до указанной длины
    """
    if not text:
        return ""

    if len(text) <= max_length:
        return text

    return text[:max_length - len(suffix)] + suffix


def capitalize_words(text: str) -> str:
    """
    Капитализация каждого слова в строке
    """
    if not text:
        return ""

    return ' '.join(word.capitalize() for word in text.split())


def to_camel_case(snake_str: str) -> str:
    """
    Преобразование snake_case в camelCase
    """
    components = snake_str.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


def to_snake_case(camel_str: str) -> str:
    """
    Преобразование camelCase в snake_case
    """
    import re
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', camel_str)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()


def format_list(items: list, separator: str = ", ", last_separator: str = " and ") -> str:
    """
    Форматирование списка в строку

    Example:
        format_list(['a', 'b', 'c']) -> "a, b and c"
    """
    if not items:
        return ""

    if len(items) == 1:
        return str(items[0])

    if len(items) == 2:
        return f"{items[0]}{last_separator}{items[1]}"

    return f"{separator.join(items[:-1])}{last_separator}{items[-1]}"


def format_plural(count: int, singular: str, plural: Optional[str] = None) -> str:
    """
    Форматирование множественного числа
    """
    if plural is None:
        plural = singular + "s"

    return singular if count == 1 else plural


def format_json(data: dict, indent: int = 2) -> str:
    """
    Форматирование JSON для вывода
    """
    import json
    return json.dumps(data, indent=indent, ensure_ascii=False)
from datetime import datetime, date, timedelta
from typing import Tuple, Optional, List, Dict, Any


def get_date_range(
        period: str,
        reference_date: Optional[date] = None
) -> Tuple[Optional[date], Optional[date]]:
    """
    Получение диапазона дат для указанного периода

    Args:
        period: today, yesterday, week, month, year, all
        reference_date: опорная дата (по умолчанию сегодня)

    Returns:
        (start_date, end_date)
    """
    if reference_date is None:
        reference_date = date.today()

    if period == "today":
        return reference_date, reference_date

    elif period == "yesterday":
        yesterday = reference_date - timedelta(days=1)
        return yesterday, yesterday

    elif period == "week":
        start = reference_date - timedelta(days=reference_date.weekday())
        end = start + timedelta(days=6)
        return start, end

    elif period == "month":
        start = reference_date.replace(day=1)
        # Получаем последний день месяца
        next_month = start.replace(day=28) + timedelta(days=4)
        end = next_month - timedelta(days=next_month.day)
        return start, end

    elif period == "year":
        start = reference_date.replace(month=1, day=1)
        end = reference_date.replace(month=12, day=31)
        return start, end

    elif period == "all":
        return None, None

    else:
        return None, None


def get_week_range(
        week_number: int,
        year: Optional[int] = None
) -> Tuple[date, date]:
    """
    Получение диапазона дат для недели
    """
    if year is None:
        year = date.today().year

    # Находим первый день года
    first_day = date(year, 1, 1)

    # Находим первый понедельник года
    days_to_monday = (7 - first_day.weekday()) % 7
    first_monday = first_day + timedelta(days=days_to_monday)

    # Вычисляем даты недели
    week_start = first_monday + timedelta(days=(week_number - 1) * 7)
    week_end = week_start + timedelta(days=6)

    return week_start, week_end


def get_month_range(
        month: int,
        year: Optional[int] = None
) -> Tuple[date, date]:
    """
    Получение диапазона дат для месяца
    """
    if year is None:
        year = date.today().year

    start = date(year, month, 1)

    # Получаем последний день месяца
    if month == 12:
        end = date(year, 12, 31)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)

    return start, end


def get_year_range(year: Optional[int] = None) -> Tuple[date, date]:
    """
    Получение диапазона дат для года
    """
    if year is None:
        year = date.today().year

    start = date(year, 1, 1)
    end = date(year, 12, 31)

    return start, end


def get_days_between(start_date: date, end_date: date) -> int:
    """
    Получение количества дней между датами
    """
    delta = end_date - start_date
    return delta.days


def is_overdue(due_date: date, status: str = "pending") -> bool:
    """
    Проверка, просрочена ли задача
    """
    if status == "done":
        return False

    return date.today() > due_date


def get_remaining_days(due_date: date) -> int:
    """
    Получение количества дней до дедлайна
    """
    delta = due_date - date.today()
    return max(0, delta.days)


def format_relative_date(
        target_date: date,
        reference_date: Optional[date] = None
) -> str:
    """
    Форматирование даты в относительном виде

    Examples:
        today -> "Today"
        yesterday -> "Yesterday"
        3 days ago -> "3 days ago"
        in 5 days -> "In 5 days"
    """
    if reference_date is None:
        reference_date = date.today()

    delta = (target_date - reference_date).days

    if delta == 0:
        return "Today"
    elif delta == -1:
        return "Yesterday"
    elif delta == 1:
        return "Tomorrow"
    elif delta < 0:
        return f"{abs(delta)} days ago"
    else:
        return f"In {delta} days"


def parse_date_string(date_str: str, formats: Optional[List[str]] = None) -> Optional[date]:
    """
    Парсинг строки в дату с поддержкой нескольких форматов
    """
    if formats is None:
        formats = [
            "%Y-%m-%d",
            "%d.%m.%Y",
            "%d/%m/%Y",
            "%m/%d/%Y",
            "%Y%m%d",
        ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue

    return None


def get_date_range_for_period(
        period: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
) -> Tuple[Optional[date], Optional[date]]:
    """
    Получение диапазона дат на основе периода или явных дат
    """
    if start_date and end_date:
        return start_date, end_date

    return get_date_range(period)


def get_week_dates(reference_date: Optional[date] = None) -> List[date]:
    """
    Получение списка дат текущей недели
    """
    if reference_date is None:
        reference_date = date.today()

    week_start = reference_date - timedelta(days=reference_date.weekday())

    return [week_start + timedelta(days=i) for i in range(7)]


def get_month_dates(
        year: int,
        month: int
) -> List[date]:
    """
    Получение списка дат месяца
    """
    start, end = get_month_range(month, year)
    delta = end - start

    return [start + timedelta(days=i) for i in range(delta.days + 1)]


def is_same_day(date1: date, date2: date) -> bool:
    """
    Проверка, что даты относятся к одному дню
    """
    return date1.year == date2.year and date1.month == date2.month and date1.day == date2.day


def is_weekend(check_date: date) -> bool:
    """
    Проверка, является ли дата выходным днем
    """
    return check_date.weekday() >= 5  # 5 = Saturday, 6 = Sunday


def get_quarter_dates(
        quarter: int,
        year: Optional[int] = None
) -> Tuple[date, date]:
    """
    Получение диапазона дат для квартала
    """
    if year is None:
        year = date.today().year

    quarters = {
        1: (1, 3),
        2: (4, 6),
        3: (7, 9),
        4: (10, 12),
    }

    start_month, end_month = quarters.get(quarter, (1, 12))

    start = date(year, start_month, 1)

    if end_month == 12:
        end = date(year, 12, 31)
    else:
        end = date(year, end_month + 1, 1) - timedelta(days=1)

    return start, end
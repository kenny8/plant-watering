"""
Утилиты для генерации графиков анализа данных датчиков.
Использует matplotlib для построения графиков в буфере io.BytesIO.
"""
import io
from datetime import datetime, timedelta
from typing import Literal, Optional

import matplotlib
matplotlib.use('Agg')  # Не-GUI бэкенд для серверного использования
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from sqlalchemy import text

from utils.logger import setup_logger

logger = setup_logger(__name__)

PeriodType = Literal['day', 'week', 'month', 'quarter', 'year']


def _get_period_sql(period: PeriodType) -> tuple[str, str]:
    """
    Возвращает SQL-выражение для группировки по периоду и формат для подписи.
    
    Returns:
        Кортеж (sql_expression, date_format_for_label)
    """
    period_sql_map = {
        'day': ("DATE(created_at)", "%Y-%m-%d"),
        'week': ("YEARWEEK(created_at)", "%Y-W%v"),
        'month': ("DATE_FORMAT(created_at, '%Y-%m')", "%Y-%m"),
        'quarter': ("CONCAT(YEAR(created_at), '-Q', QUARTER(created_at))", "%Y-Q%q"),
        'year': ("YEAR(created_at)", "%Y"),
    }
    return period_sql_map.get(period, period_sql_map['month'])


def _detect_period(min_date: datetime, max_date: datetime) -> PeriodType:
    """
    Авто-определение периода агрегации на основе диапазона дат.
    
    Rules:
        - < 7 дней → 'day'
        - < 30 дней → 'week'
        - < 90 дней → 'month'
        - иначе → 'month'
    """
    if min_date is None or max_date is None:
        return 'month'
    
    delta = max_date - min_date
    days = delta.days
    
    logger.debug(f"[CHARTS] Диапазон данных: {days} дней (с {min_date} по {max_date})")
    
    if days < 7:
        return 'day'
    elif days < 30:
        return 'week'
    elif days < 90:
        return 'month'
    else:
        return 'month'


def _generate_no_data_image() -> io.BytesIO:
    """
    Генерирует изображение с текстом "Недостаточно данных".
    """
    logger.debug("[CHARTS] Генерация изображения 'Недостаточно данных'")
    
    buffer = io.BytesIO()
    
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.set_facecolor('#f5f5f5')
    fig.patch.set_facecolor('#f5f5f5')
    
    ax.text(
        0.5, 0.5,
        "📭 Недостаточно данных\nдля построения графика",
        ha='center',
        va='center',
        fontsize=16,
        color='#666666',
        fontfamily='sans-serif'
    )
    
    ax.axis('off')
    plt.tight_layout()
    plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight', facecolor=fig.get_facecolor())
    buffer.seek(0)
    
    plt.close(fig)
    logger.info("[CHARTS] Изображение 'Недостаточно данных' сгенерировано")
    
    return buffer


def generate_analysis_chart(
    session: object,
    device_id: int,
    build_id: int,
    field_name: str,
    period: Optional[PeriodType] = None
) -> io.BytesIO:
    """
    Генерирует линейный график показаний датчика с агрегацией по времени.
    
    Args:
        session: SQLAlchemy session
        device_id: ID устройства
        build_id: ID сборки
        field_name: Имя поля (датчика)
        period: Период агрегации ('day', 'week', 'month', 'quarter', 'year').
                Если None, определяется автоматически.
    
    Returns:
        io.BytesIO: Буфер с PNG-изображением графика
    
    SQL: SELECT created_at, field_value FROM device_data 
         WHERE device_id=? AND build_id=? AND field_name=? 
         ORDER BY created_at ASC
    
    Агрегация по времени (группировка + усреднение):
        - 'day': DATE(created_at) → среднее за день
        - 'week': YEARWEEK(created_at) → среднее за неделю
        - 'month': DATE_FORMAT(created_at, '%Y-%m') → среднее за месяц
        - 'quarter': CONCAT(YEAR(created_at), '-Q', QUARTER(created_at)) → среднее за квартал
        - 'year': YEAR(created_at) → среднее за год
    """
    logger.info(f"[CHARTS] Начало генерации графика: device={device_id}, build={build_id}, field='{field_name}', period={period}")
    
    # Получаем данные из БД
    try:
        query = text("""
            SELECT created_at, field_value
            FROM device_data
            WHERE device_id = :device_id 
              AND build_id = :build_id 
              AND field_name = :field_name
            ORDER BY created_at ASC
        """)
        
        result = session.execute(
            query,
            {
                "device_id": device_id,
                "build_id": build_id,
                "field_name": field_name
            }
        )
        rows = result.fetchall()
        logger.info(f"[CHARTS] Получено {len(rows)} записей из БД")
        
    except Exception as e:
        logger.error(f"[CHARTS] Ошибка выполнения SQL-запроса: {e}")
        raise
    
    if len(rows) < 2:
        logger.warning(f"[CHARTS] Недостаточно данных для графика ({len(rows)} точек)")
        return _generate_no_data_image()
    
    # Определяем мин/макс даты для авто-выбора периода
    dates = [row[0] for row in rows if row[0] is not None]
    if dates:
        min_date = min(dates)
        max_date = max(dates)
        if period is None:
            period = _detect_period(min_date, max_date)
            logger.info(f"[CHARTS] Авто-определён период: {period}")
    else:
        period = period or 'month'
    
    # Агрегируем данные по периоду
    period_sql, date_format = _get_period_sql(period)
    
    try:
        aggregate_query = text(f"""
            SELECT {period_sql} as period_key, 
                   MIN(created_at) as period_date,
                   AVG(CAST(field_value AS DECIMAL(10,4))) as avg_value
            FROM device_data
            WHERE device_id = :device_id 
              AND build_id = :build_id 
              AND field_name = :field_name
            GROUP BY period_key
            ORDER BY period_date ASC
        """)
        
        agg_result = session.execute(
            aggregate_query,
            {
                "device_id": device_id,
                "build_id": build_id,
                "field_name": field_name
            }
        )
        agg_rows = agg_result.fetchall()
        logger.info(f"[CHARTS] Агрегировано до {len(agg_rows)} точек")
        
    except Exception as e:
        logger.error(f"[CHARTS] Ошибка агрегации данных: {e}")
        # Fallback: используем исходные данные без агрегации
        agg_rows = [(row[0], row[0], row[1]) for row in rows if row[0] is not None and row[1] is not None]
        try:
            agg_rows = [(r[0], r[1], float(r[2])) for r in agg_rows]
        except (ValueError, TypeError):
            logger.warning("[CHARTS] Не удалось преобразовать значения в float, используем как есть")
            agg_rows = rows
    
    if len(agg_rows) < 2:
        logger.warning(f"[CHARTS] После агрегации недостаточно данных ({len(agg_rows)} точек)")
        return _generate_no_data_image()
    
    # Подготовка данных для графика
    x_dates = []
    y_values = []
    x_labels = []
    
    for row in agg_rows:
        period_date = row[1]  # MIN(created_at) для периода
        avg_value = row[2]    # Среднее значение
        
        if period_date is None or avg_value is None:
            continue
        
        try:
            # Преобразуем в float
            avg_value = float(avg_value)
        except (ValueError, TypeError):
            continue
        
        x_dates.append(period_date)
        y_values.append(avg_value)
        
        # Форматируем подпись для оси X
        if isinstance(period_date, datetime):
            label = period_date.strftime(date_format)
        else:
            label = str(period_date)[:10]
        x_labels.append(label)
    
    if len(x_dates) < 2:
        logger.warning(f"[CHARTS] После обработки недостаточно валидных данных")
        return _generate_no_data_image()
    
    # Построение графика
    logger.debug(f"[CHARTS] Построение графика с {len(x_dates)} точками")
    
    buffer = io.BytesIO()
    
    fig, ax = plt.subplots(figsize=(12, 6))
    fig.patch.set_facecolor('#ffffff')
    ax.set_facecolor('#f8f9fa')
    
    # Линейный график
    ax.plot(x_dates, y_values, marker='o', linestyle='-', linewidth=2, markersize=6, color='#2196F3')
    
    # Заголовок и подписи осей
    field_display = " ".join(word.capitalize() for word in field_name.replace('_', ' ').split())
    period_names = {
        'day': 'День',
        'week': 'Неделя',
        'month': 'Месяц',
        'quarter': 'Квартал',
        'year': 'Год'
    }
    period_name_ru = period_names.get(period, period)
    
    ax.set_title(f"{field_display} — по {period_name_ru}", fontsize=14, fontweight='bold', pad=15)
    ax.set_xlabel("Дата", fontsize=11)
    ax.set_ylabel(f"Значение {field_display}", fontsize=11)
    
    # Сетка
    ax.grid(True, linestyle='--', alpha=0.7)
    
    # Форматирование оси X
    if period == 'day':
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%d.%m'))
    elif period == 'week':
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%d.%m.%Y'))
    elif period == 'month':
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%m.%Y'))
    elif period == 'quarter':
        # Для кварталов используем текстовые метки
        ax.set_xticks(range(len(x_dates)))
        ax.set_xticklabels(x_labels, rotation=45, ha='right')
    elif period == 'year':
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y'))
    
    # Отступы
    plt.tight_layout()
    
    # Сохранение в буфер
    plt.savefig(buffer, format='png', dpi=100, bbox_inches='tight', facecolor=fig.get_facecolor())
    buffer.seek(0)
    
    file_size = buffer.tell()
    logger.info(f"[CHARTS] График сгенерирован успешно (размер: {file_size} байт)")
    
    plt.close(fig)
    
    return buffer

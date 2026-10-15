"""Celery configuration shared by the Flask API and worker."""
import os

from celery import Celery
from celery.schedules import crontab

redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

celery = Celery(
    'placement_portal',
    broker=redis_url,
    backend=redis_url,
    include=['tasks'],
)
celery.conf.update(
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='Asia/Kolkata',
    task_track_started=True,
    result_expires=60 * 60 * 24,
    beat_schedule={
        # 09:00 every day (Asia/Kolkata): remind students about drives closing soon.
        'send-daily-deadline-reminders': {
            'task': 'placement_portal.send_daily_deadline_reminders',
            'schedule': crontab(hour=9, minute=0),
        },
        # 00:05 on the first day of each month: report on the full prior month.
        'send-monthly-placement-activity-report': {
            'task': 'placement_portal.send_monthly_activity_report',
            'schedule': crontab(day_of_month='1', hour=0, minute=5),
            'args': ('previous',),
        },
    },
)

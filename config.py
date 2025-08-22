#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
from dotenv import load_dotenv

# Загружаем переменные окружения из .env файла
load_dotenv()

# Конфигурация бота
BOT_TOKEN = os.getenv('BOT_TOKEN', '8331497095:AAGc-Esw3Meuu-a7xyaxuc2GyEJsL37htas')
WEBAPP_URL = os.getenv('WEBAPP_URL', 'http://localhost:8000')  # Локальный сервер для разработки
TIMEZONE = os.getenv('TIMEZONE', 'Europe/Moscow')

# Настройки базы данных
DATABASE_PATH = os.getenv('DATABASE_PATH', 'lumo_bot.db')

# Настройки напоминаний
WATER_REMINDER_HOURS = [8, 10, 12, 14, 16, 18, 20, 22]  # Каждые 2 часа
MOVEMENT_REMINDER_HOURS = list(range(9, 22))  # Каждый час с 9 до 21
DIARY_REMINDER_HOURS = [10, 14, 18, 22]  # Каждые 4 часа
HABITS_REMINDER_HOUR = 20  # 20:00
EVENING_REPORT_HOUR = 21  # 21:00

# Логирование
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
LOG_FILE = os.getenv('LOG_FILE', 'lumo_bot.log')

# Настройки веб-приложения
WEBAPP_TITLE = "Lumo - Health Tracker"
WEBAPP_DESCRIPTION = "Отслеживание здоровья и привычек"
WEBAPP_SHORT_NAME = "Lumo"
WEBAPP_VERSION = "1.0.0"

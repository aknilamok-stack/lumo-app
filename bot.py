#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import json
import logging
import random
import sqlite3
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import aioschedule
from aiogram import Bot, Dispatcher, types
from aiogram.contrib.fsm_storage.memory import MemoryStorage
from aiogram.dispatcher import FSMContext
from aiogram.dispatcher.filters.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton, WebAppInfo
from aiogram.utils import executor

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Импорт конфигурации
from config import *

# Конфигурация
BOT_TOKEN = BOT_TOKEN
WEBAPP_URL = WEBAPP_URL
TIMEZONE = TIMEZONE

# Инициализация бота
bot = Bot(token=BOT_TOKEN)
storage = MemoryStorage()
dp = Dispatcher(bot, storage=storage)

# Состояния для FSM
class ReminderStates(StatesGroup):
    waiting_for_reminder_choice = State()

# База данных пользователей
def init_db():
    conn = sqlite3.connect('lumo_bot.db')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            reminders_enabled BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_data (
            user_id INTEGER,
            date TEXT,
            kcal INTEGER DEFAULT 0,
            protein INTEGER DEFAULT 0,
            fat INTEGER DEFAULT 0,
            carbs INTEGER DEFAULT 0,
            water_ml INTEGER DEFAULT 0,
            steps INTEGER DEFAULT 0,
            sleep_hours INTEGER DEFAULT 0,
            habits_done INTEGER DEFAULT 0,
            habits_total INTEGER DEFAULT 0,
            note TEXT,
            PRIMARY KEY (user_id, date)
        )
    ''')
    conn.commit()
    conn.close()

# Мотивационные цитаты
MOTIVATION_QUOTES = [
    "🐰 Маленькие шаги каждый день приводят к большим результатам!",
    "💪 Ты сильнее, чем думаешь. Каждый день - новая возможность!",
    "🌟 Здоровье - это не пункт назначения, а способ путешествия",
    "🍎 Яблоко в день - и врач не нужен. Но лучше съесть два!",
    "💧 Вода - источник жизни. Не забывай пить!",
    "🚶‍♂️ Движение - это жизнь. Даже 10 минут в день имеют значение!",
    "😴 Хороший сон - залог успешного дня",
    "🎯 Цель без плана - просто желание. У тебя есть план!",
    "🌈 Каждый день - это новая страница твоей истории успеха",
    "🔥 Ты на правильном пути. Продолжай в том же духе!"
]

# Клавиатуры
def get_main_keyboard():
    keyboard = ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=False)
    keyboard.add(KeyboardButton("📱 Открыть приложение", web_app=WebAppInfo(url=WEBAPP_URL)))
    keyboard.add(KeyboardButton("🔔 Напоминания"), KeyboardButton("📊 Прогресс"))
    keyboard.add(KeyboardButton("💪 Мотивация"), KeyboardButton("❓ Помощь"))
    return keyboard

def get_reminders_keyboard():
    keyboard = InlineKeyboardMarkup(row_width=2)
    keyboard.add(
        InlineKeyboardButton("🔔 Включить", callback_data="reminders_on"),
        InlineKeyboardButton("🔕 Выключить", callback_data="reminders_off")
    )
    keyboard.add(InlineKeyboardButton("⚙️ Настройки", callback_data="reminder_settings"))
    keyboard.add(InlineKeyboardButton("🔙 Назад", callback_data="back_to_main"))
    return keyboard

def get_help_keyboard():
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton("📱 Открыть приложение", web_app=WebAppInfo(url=WEBAPP_URL)))
    keyboard.add(InlineKeyboardButton("🔙 Назад", callback_data="back_to_main"))
    return keyboard

# Обработчики команд
@dp.message_handler(commands=['start'])
async def cmd_start(message: types.Message):
    user_id = message.from_user.id
    username = message.from_user.username
    first_name = message.from_user.first_name
    
    # Регистрируем пользователя
    conn = sqlite3.connect('lumo_bot.db')
    cursor = conn.cursor()
    cursor.execute('''
        INSERT OR REPLACE INTO users (user_id, username, first_name, last_name)
        VALUES (?, ?, ?, ?)
    ''', (user_id, username, first_name, message.from_user.last_name))
    conn.commit()
    conn.close()
    
    welcome_text = f"""
👋 Привет, {first_name}! Я Lumo 🐰 твой ассистент в создании лучшей версии себя.

Вместе будем отслеживать:
🍽 Питание и калории
💧 Воду и гидратацию  
😴 Сон и восстановление
🚶‍♂️ Шаги и активность
✅ Привычки и цели

Нажми «Открыть приложение» чтобы начать! 🚀
    """
    
    await message.answer(welcome_text, reply_markup=get_main_keyboard())

@dp.message_handler(commands=['open'])
async def cmd_open(message: types.Message):
    await message.answer("📱 Открываю приложение...", reply_markup=get_main_keyboard())

@dp.message_handler(commands=['progress'])
async def cmd_progress(message: types.Message):
    await show_progress(message.from_user.id)

@dp.message_handler(commands=['motivation'])
async def cmd_motivation(message: types.Message):
    quote = random.choice(MOTIVATION_QUOTES)
    await message.answer(f"💪 {quote}")

@dp.message_handler(commands=['reminders_on'])
async def cmd_reminders_on(message: types.Message):
    user_id = message.from_user.id
    conn = sqlite3.connect('lumo_bot.db')
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET reminders_enabled = TRUE WHERE user_id = ?', (user_id,))
    conn.commit()
    conn.close()
    await message.answer("🔔 Напоминания включены! Буду напоминать о важных делах.")

@dp.message_handler(commands=['reminders_off'])
async def cmd_reminders_off(message: types.Message):
    user_id = message.from_user.id
    conn = sqlite3.connect('lumo_bot.db')
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET reminders_enabled = FALSE WHERE user_id = ?', (user_id,))
    conn.commit()
    conn.close()
    await message.answer("🔕 Напоминания выключены. Можешь включить командой /reminders_on")

# Обработчики текстовых сообщений
@dp.message_handler(lambda message: message.text == "📱 Открыть приложение")
async def open_app(message: types.Message):
    await message.answer("🚀 Открываю Lumo приложение...", reply_markup=get_main_keyboard())

@dp.message_handler(lambda message: message.text == "🔔 Напоминания")
async def reminders_menu(message: types.Message):
    await message.answer("🔔 Управление напоминаниями:", reply_markup=get_reminders_keyboard())

@dp.message_handler(lambda message: message.text == "📊 Прогресс")
async def progress_menu(message: types.Message):
    await show_progress(message.from_user.id)

@dp.message_handler(lambda message: message.text == "💪 Мотивация")
async def motivation_menu(message: types.Message):
    quote = random.choice(MOTIVATION_QUOTES)
    await message.answer(f"💪 {quote}")

@dp.message_handler(lambda message: message.text == "❓ Помощь")
async def help_menu(message: types.Message):
    help_text = """
❓ Что я умею?

📱 Открыть приложение - запуск веб-приложения
🔔 Напоминания - управление уведомлениями
📊 Прогресс - ваша статистика за вчера
💪 Мотивация - случайная мотивационная цитата

Команды:
/start - приветствие
/open - открыть приложение  
/progress - показать прогресс
/motivation - мотивация
/reminders_on - включить напоминания
/reminders_off - выключить напоминания
    """
    await message.answer(help_text, reply_markup=get_help_keyboard())

# Обработчики callback
@dp.callback_query_handler(lambda c: c.data == "reminders_on")
async def enable_reminders(callback_query: types.CallbackQuery):
    user_id = callback_query.from_user.id
    conn = sqlite3.connect('lumo_bot.db')
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET reminders_enabled = TRUE WHERE user_id = ?', (user_id,))
    conn.commit()
    conn.close()
    await callback_query.message.edit_text("🔔 Напоминания включены!")
    await callback_query.answer()

@dp.callback_query_handler(lambda c: c.data == "reminders_off")
async def disable_reminders(callback_query: types.CallbackQuery):
    user_id = callback_query.from_user.id
    conn = sqlite3.connect('lumo_bot.db')
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET reminders_enabled = FALSE WHERE user_id = ?', (user_id,))
    conn.commit()
    conn.close()
    await callback_query.message.edit_text("🔕 Напоминания выключены!")
    await callback_query.answer()

@dp.callback_query_handler(lambda c: c.data == "back_to_main")
async def back_to_main(callback_query: types.CallbackQuery):
    await callback_query.message.delete()
    await callback_query.answer()

# Функции для работы с данными
async def show_progress(user_id: int):
    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    
    conn = sqlite3.connect('lumo_bot.db')
    cursor = conn.cursor()
    cursor.execute('''
        SELECT kcal, protein, fat, carbs, water_ml, steps, sleep_hours, habits_done, habits_total, note
        FROM user_data WHERE user_id = ? AND date = ?
    ''', (user_id, yesterday))
    
    result = cursor.fetchone()
    conn.close()
    
    if result:
        kcal, protein, fat, carbs, water_ml, steps, sleep_hours, habits_done, habits_total, note = result
        date_str = datetime.strptime(yesterday, '%Y-%m-%d').strftime('%d %B')
        
        progress_text = f"""
📊 Вчера ({date_str}):

🍽 {kcal or 0} ккал · Б {protein or 0} / Ж {fat or 0} / У {carbs or 0}
💧 Вода: {(water_ml or 0)/1000:.1f} л   👟 Шаги: {steps or 0}   💤 Сон: {sleep_hours or 0} ч
✅ Привычки: {habits_done or 0}/{habits_total or 0} выполнено
        """
        
        if note:
            progress_text += f"\n📝 Заметка: {note}"
    else:
        progress_text = "📊 Данных за вчера пока нет. Откройте приложение и добавьте информацию!"
    
    await bot.send_message(user_id, progress_text)

# Напоминания
async def send_water_reminder(user_id: int):
    await bot.send_message(user_id, "💧 Пора выпить стакан воды! Оставайся гидратированным 🥤")

async def send_movement_reminder(user_id: int):
    await bot.send_message(user_id, "🚶‍♂️ Встань и пройдись! Движение - это жизнь 💪")

async def send_diary_reminder(user_id: int):
    await bot.send_message(user_id, "✍️ Загляни в приложение и запиши данные в дневник! 📱")

async def send_habits_reminder(user_id: int):
    await bot.send_message(user_id, "🐰 Не забудь отметить привычку в трекере! Сегодня отличный день для достижений ✨")

async def send_evening_report(user_id: int):
    today = datetime.now().strftime('%Y-%m-%d')
    
    conn = sqlite3.connect('lumo_bot.db')
    cursor = conn.cursor()
    cursor.execute('''
        SELECT kcal, water_ml, steps, habits_done, habits_total
        FROM user_data WHERE user_id = ? AND date = ?
    ''', (user_id, today))
    
    result = cursor.fetchone()
    conn.close()
    
    if result:
        kcal, water_ml, steps, habits_done, habits_total = result
        habits_percent = (habits_done / habits_total * 100) if habits_total > 0 else 0
        
        report_text = f"""
🌙 Вечерний отчёт:

Сегодня ты выполнил {habits_percent:.0f}% привычек, 
выпил {(water_ml or 0)/1000:.1f} л воды 
и прошёл {steps or 0} шагов 👏

Отличная работа! Завтра будет ещё лучше! 🚀
        """
    else:
        report_text = "🌙 Не забудь заглянуть в приложение и записать сегодняшние достижения! 📱"
    
    await bot.send_message(user_id, report_text)

# Планировщик напоминаний
async def scheduler():
    while True:
        await aioschedule.run_pending()
        await asyncio.sleep(1)

async def setup_scheduler():
    # Вода каждые 2 часа (с 8:00 до 22:00)
    for hour in [8, 10, 12, 14, 16, 18, 20, 22]:
        aioschedule.every().day.at(f"{hour:02d}:00").do(send_water_reminder_to_all)
    
    # Движение каждый час (с 9:00 до 21:00)
    for hour in range(9, 22):
        aioschedule.every().day.at(f"{hour:02d}:00").do(send_movement_reminder_to_all)
    
    # Дневник каждые 4 часа
    for hour in [10, 14, 18, 22]:
        aioschedule.every().day.at(f"{hour:02d}:00").do(send_diary_reminder_to_all)
    
    # Привычки вечером
    aioschedule.every().day.at("20:00").do(send_habits_reminder_to_all)
    
    # Вечерний отчёт
    aioschedule.every().day.at("21:00").do(send_evening_report_to_all)

async def send_water_reminder_to_all():
    conn = sqlite3.connect('lumo_bot.db')
    cursor = conn.cursor()
    cursor.execute('SELECT user_id FROM users WHERE reminders_enabled = TRUE')
    users = cursor.fetchall()
    conn.close()
    
    for (user_id,) in users:
        try:
            await send_water_reminder(user_id)
        except Exception as e:
            logger.error(f"Error sending water reminder to {user_id}: {e}")

async def send_movement_reminder_to_all():
    conn = sqlite3.connect('lumo_bot.db')
    cursor = conn.cursor()
    cursor.execute('SELECT user_id FROM users WHERE reminders_enabled = TRUE')
    users = cursor.fetchall()
    conn.close()
    
    for (user_id,) in users:
        try:
            await send_movement_reminder(user_id)
        except Exception as e:
            logger.error(f"Error sending movement reminder to {user_id}: {e}")

async def send_diary_reminder_to_all():
    conn = sqlite3.connect('lumo_bot.db')
    cursor = conn.cursor()
    cursor.execute('SELECT user_id FROM users WHERE reminders_enabled = TRUE')
    users = cursor.fetchall()
    conn.close()
    
    for (user_id,) in users:
        try:
            await send_diary_reminder(user_id)
        except Exception as e:
            logger.error(f"Error sending diary reminder to {user_id}: {e}")

async def send_habits_reminder_to_all():
    conn = sqlite3.connect('lumo_bot.db')
    cursor = conn.cursor()
    cursor.execute('SELECT user_id FROM users WHERE reminders_enabled = TRUE')
    users = cursor.fetchall()
    conn.close()
    
    for (user_id,) in users:
        try:
            await send_habits_reminder(user_id)
        except Exception as e:
            logger.error(f"Error sending habits reminder to {user_id}: {e}")

async def send_evening_report_to_all():
    conn = sqlite3.connect('lumo_bot.db')
    cursor = conn.cursor()
    cursor.execute('SELECT user_id FROM users WHERE reminders_enabled = TRUE')
    users = cursor.fetchall()
    conn.close()
    
    for (user_id,) in users:
        try:
            await send_evening_report(user_id)
        except Exception as e:
            logger.error(f"Error sending evening report to {user_id}: {e}")

# Webhook для получения данных из приложения
@dp.message_handler(content_types=['web_app_data'])
async def handle_webapp_data(message: types.Message):
    try:
        data = json.loads(message.web_app_data.data)
        user_id = message.from_user.id
        
        # Сохраняем данные в БД
        conn = sqlite3.connect('lumo_bot.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO user_data 
            (user_id, date, kcal, protein, fat, carbs, water_ml, steps, sleep_hours, habits_done, habits_total, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id, 
            data.get('date', datetime.now().strftime('%Y-%m-%d')),
            data.get('kcal', 0),
            data.get('protein', 0),
            data.get('fat', 0),
            data.get('carbs', 0),
            data.get('water_ml', 0),
            data.get('steps', 0),
            data.get('sleep_hours', 0),
            data.get('habits_done', 0),
            data.get('habits_total', 0),
            data.get('note', '')
        ))
        
        conn.commit()
        conn.close()
        
        await message.answer("✅ Данные успешно сохранены! 📊")
        
    except Exception as e:
        logger.error(f"Error handling webapp data: {e}")
        await message.answer("❌ Ошибка при сохранении данных. Попробуйте ещё раз.")

# Запуск бота
async def on_startup(dp):
    init_db()
    await setup_scheduler()
    asyncio.create_task(scheduler())
    logger.info("Bot started!")

if __name__ == '__main__':
    executor.start_polling(dp, on_startup=on_startup, skip_updates=True)

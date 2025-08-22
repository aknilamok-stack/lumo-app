#!/bin/bash

# Lumo Bot Runner Script

echo "🚀 Запуск Lumo Telegram Bot..."

# Проверяем наличие Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 не найден. Установите Python 3.8+"
    exit 1
fi

# Проверяем наличие pip
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 не найден. Установите pip"
    exit 1
fi

# Устанавливаем зависимости
echo "📦 Установка зависимостей..."
pip3 install -r requirements.txt

# Проверяем наличие .env файла
if [ ! -f .env ]; then
    echo "⚠️  Файл .env не найден. Создаём из примера..."
    cp env.example .env
    echo "📝 Отредактируйте .env файл с вашими настройками"
fi

# Запускаем бота
echo "🤖 Запуск бота..."
python3 bot.py

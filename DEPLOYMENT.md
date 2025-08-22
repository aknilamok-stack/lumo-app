# 🚀 Руководство по развёртыванию

## Веб-приложение

### 1. GitHub Pages (Бесплатно)

1. **Создайте репозиторий на GitHub**
2. **Загрузите файлы**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/username/lumo-app.git
   git push -u origin main
   ```

3. **Настройте GitHub Pages**:
   - Перейдите в Settings → Pages
   - Source: Deploy from a branch
   - Branch: main
   - Folder: / (root)
   - Нажмите Save

4. **Получите URL**: `https://username.github.io/lumo-app`

### 2. Netlify (Бесплатно)

1. **Зарегистрируйтесь на netlify.com**
2. **Создайте новый сайт**:
   - Drag & drop папку с файлами
   - Или подключите GitHub репозиторий

3. **Настройте домен** (опционально):
   - Settings → Domain management
   - Добавьте кастомный домен

### 3. Vercel (Бесплатно)

1. **Установите Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Разверните**:
   ```bash
   vercel
   ```

## Telegram бот

### 1. Heroku (Бесплатно)

1. **Создайте аккаунт на heroku.com**
2. **Установите Heroku CLI**:
   ```bash
   # macOS
   brew tap heroku/brew && brew install heroku
   ```

3. **Создайте приложение**:
   ```bash
   heroku create lumo-bot
   ```

4. **Создайте Procfile**:
   ```
   worker: python bot.py
   ```

5. **Настройте переменные окружения**:
   ```bash
   heroku config:set BOT_TOKEN=your_bot_token
   heroku config:set WEBAPP_URL=https://your-app-url.com
   ```

6. **Разверните**:
   ```bash
   git add .
   git commit -m "Deploy to Heroku"
   git push heroku main
   ```

7. **Запустите worker**:
   ```bash
   heroku ps:scale worker=1
   ```

### 2. Railway (Бесплатно)

1. **Зарегистрируйтесь на railway.app**
2. **Подключите GitHub репозиторий**
3. **Настройте переменные окружения**:
   - BOT_TOKEN
   - WEBAPP_URL
4. **Deploy автоматически**

### 3. VPS (Платно)

1. **Арендуйте VPS** (DigitalOcean, Linode, Vultr)
2. **Подключитесь по SSH**:
   ```bash
   ssh root@your-server-ip
   ```

3. **Установите Python**:
   ```bash
   sudo apt update
   sudo apt install python3 python3-pip git
   ```

4. **Клонируйте репозиторий**:
   ```bash
   git clone https://github.com/username/lumo-app.git
   cd lumo-app
   ```

5. **Установите зависимости**:
   ```bash
   pip3 install -r requirements.txt
   ```

6. **Настройте .env файл**:
   ```bash
   cp env.example .env
   nano .env
   ```

7. **Запустите бота**:
   ```bash
   python3 bot.py
   ```

8. **Настройте systemd для автозапуска**:
   ```bash
   sudo nano /etc/systemd/system/lumo-bot.service
   ```

   ```ini
   [Unit]
   Description=Lumo Telegram Bot
   After=network.target

   [Service]
   Type=simple
   User=root
   WorkingDirectory=/root/lumo-app
   ExecStart=/usr/bin/python3 bot.py
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl enable lumo-bot
   sudo systemctl start lumo-bot
   ```

## Настройка домена

### 1. Покупка домена
- Namecheap, GoDaddy, Google Domains

### 2. Настройка DNS
- A запись → IP вашего сервера
- CNAME → ваш-домен.com → username.github.io

### 3. SSL сертификат
- Let's Encrypt (бесплатно)
- Cloudflare (бесплатно)

## Мониторинг

### 1. Логи
```bash
# Просмотр логов
tail -f lumo_bot.log

# Systemd логи
sudo journalctl -u lumo-bot -f
```

### 2. Статус бота
```bash
# Проверка статуса
sudo systemctl status lumo-bot

# Перезапуск
sudo systemctl restart lumo-bot
```

### 3. Мониторинг ресурсов
```bash
# Использование памяти
htop

# Дисковое пространство
df -h
```

## Безопасность

### 1. Firewall
```bash
# UFW (Ubuntu)
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
```

### 2. Обновления
```bash
# Автоматические обновления
sudo apt update && sudo apt upgrade -y
```

### 3. Резервное копирование
```bash
# Скрипт для бэкапа
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
tar -czf backup_$DATE.tar.gz lumo_bot.db .env
```

## Troubleshooting

### Бот не отвечает
1. Проверьте логи: `tail -f lumo_bot.log`
2. Проверьте токен в .env
3. Проверьте интернет соединение

### Веб-приложение не открывается
1. Проверьте URL в настройках бота
2. Убедитесь, что HTTPS включён
3. Проверьте консоль браузера на ошибки

### Напоминания не работают
1. Проверьте часовой пояс в настройках
2. Убедитесь, что напоминания включены
3. Проверьте логи планировщика

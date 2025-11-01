# 🔐 Многоуровневая аутентификация

## Реализованные методы входа:

### 1. Email/Пароль
- Регистрация нового пользователя
- Вход с email и паролем
- Хеширование паролей через bcrypt

### 2. OAuth
- **Google** - вход через Google аккаунт
- **GitHub** - вход через GitHub аккаунт
- **Facebook** - вход через Facebook аккаунт

### 3. Magic Links (беспарольный вход)
- Генерация одноразовой ссылки
- Отправка на email
- Автоматический вход по ссылке
- Срок действия: 15 минут

### 4. 2FA (двухфакторная аутентификация)
- Генерация QR-кода для приложения-аутентификатора
- Поддержка TOTP (Google Authenticator, Authy и т.д.)
- Обязательная проверка при входе (если включена)

## Установка и настройка

### 1. Установите зависимости:
```bash
npm install
```

### 2. Создайте файл `.env`:
```bash
cp .env.example .env
```

### 3. Настройте переменные окружения:

#### Для OAuth (Google, GitHub, Facebook):
1. **Google:**
   - Перейдите на [Google Cloud Console](https://console.cloud.google.com/)
   - Создайте OAuth 2.0 Client ID
   - Укажите callback URL: `http://localhost:3000/auth/google/callback`

2. **GitHub:**
   - Перейдите в Settings → Developer settings → OAuth Apps
   - Создайте новое OAuth приложение
   - Callback URL: `http://localhost:3000/auth/github/callback`

3. **Facebook:**
   - Перейдите в [Facebook Developers](https://developers.facebook.com/)
   - Создайте приложение
   - Добавьте Facebook Login продукт
   - Callback URL: `http://localhost:3000/auth/facebook/callback`

#### Для Magic Links:
Настройте SMTP (для Gmail используйте App Password):
- `SMTP_USER` - ваш email
- `SMTP_PASS` - пароль приложения (не основной пароль!)

### 4. Запустите сервер:
```bash
npm start
```

## Использование

### Вход в приложение:
1. Откройте `http://localhost:3000/auth.html`
2. Выберите метод входа:
   - **Вход** - email/пароль
   - **Регистрация** - создание нового аккаунта
   - **Magic Link** - беспарольный вход

### Настройка 2FA:
1. Войдите в приложение
2. Перейдите в настройки профиля (добавьте в UI)
3. Нажмите "Включить 2FA"
4. Отсканируйте QR-код в приложении-аутентификаторе
5. Введите код для подтверждения

## API Endpoints

### POST `/auth/register`
Регистрация нового пользователя
```json
{
  "email": "user@example.com",
  "username": "username",
  "password": "password123"
}
```

### POST `/auth/login`
Вход пользователя
```json
{
  "email": "user@example.com",
  "password": "password123",
  "twoFactorToken": "123456" // опционально, если включена 2FA
}
```

### POST `/auth/magic-link`
Запрос Magic Link
```json
{
  "email": "user@example.com"
}
```

### GET `/auth/verify-magic-link?token=xxx`
Верификация Magic Link (редирект)

### POST `/auth/2fa/enable`
Включение 2FA (требует Bearer токен)

### POST `/auth/2fa/verify`
Верификация 2FA для включения (требует Bearer токен)
```json
{
  "twoFactorToken": "123456"
}
```

### GET `/auth/google` - OAuth Google
### GET `/auth/github` - OAuth GitHub
### GET `/auth/facebook` - OAuth Facebook

## Безопасность

⚠️ **Важно для продакшена:**
- Измените `JWT_SECRET` на случайную строку
- Измените `SESSION_SECRET` на случайную строку
- Используйте HTTPS
- Настройте CORS для конкретных доменов
- Ограничьте частоту запросов (rate limiting)
- Используйте базу данных вместо JSON файлов

## Структура данных

Пользователи сохраняются в `data/users.json`
Magic Links сохраняются в `data/magic-links.json`

**Примечание:** Для продакшена рекомендуется использовать базу данных (MongoDB, PostgreSQL и т.д.)


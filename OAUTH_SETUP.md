# 🔧 Настройка OAuth (Google, GitHub, Facebook)

## Общие требования

1. Все OAuth провайдеры требуют настройки callback URL
2. Callback URL должен быть доступен из интернета (HTTPS для продакшена)
3. Необходимо получить Client ID и Client Secret от каждого провайдера

---

## 📘 Google OAuth

### 🔗 Где найти KEY и VALUE от Google:

**Прямая ссылка:** [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials)

### 1. Создание проекта
1. Перейдите на [Google Cloud Console](https://console.cloud.google.com/)
2. Войдите в свой Google аккаунт
3. Создайте новый проект или выберите существующий:
   - Нажмите на выпадающий список проектов вверху
   - Нажмите **New Project**
   - Введите название проекта (например: "ChatApp")
   - Нажмите **Create**

### 2. Настройка OAuth Consent Screen
1. Перейдите в **APIs & Services** → **OAuth consent screen**
   - Или по прямой ссылке: [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Выберите **External** (для тестирования) или **Internal** (только для Google Workspace)
3. Заполните обязательные поля:
   - **App name**: ChatApp (или ваше название)
   - **User support email**: ваш email
   - **Developer contact information**: ваш email
4. Нажмите **Save and Continue**
5. На экране **Scopes** нажмите **Save and Continue** (можно оставить по умолчанию)
6. На экране **Test users** (если выбрали External):
   - Добавьте тестовые email адреса, которые будут использовать приложение
   - Или нажмите **Save and Continue** (можно добавить позже)
7. Нажмите **Back to Dashboard**

### 3. Создание OAuth 2.0 Credentials
1. Перейдите в **APIs & Services** → **Credentials**
   - Или по прямой ссылке: [Credentials](https://console.cloud.google.com/apis/credentials)
2. Нажмите **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Если появится предупреждение о OAuth consent screen - нажмите **Configure Consent Screen** и завершите настройку (см. шаг 2)
4. Выберите тип приложения: **Web application**
5. Заполните:
   - **Name**: ChatApp Web Client (или любое название)
   - **Authorized JavaScript origins** (опционально):
     - Для локальной разработки: `http://localhost:3000`
     - Для продакшена: `https://your-app.onrender.com`
   - **Authorized redirect URIs** (обязательно!):
     - Для локальной разработки: `http://localhost:3000/auth/google/callback`
     - Для продакшена: `https://your-app.onrender.com/auth/google/callback`
6. Нажмите **CREATE**
7. **Скопируйте и сохраните:**
   - **Client ID** (это будет `GOOGLE_CLIENT_ID`)
   - **Client secret** (это будет `GOOGLE_CLIENT_SECRET`)
   - ⚠️ **Важно:** Client secret показывается только один раз! Сохраните его сразу.

### 3. Настройка переменных окружения
```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://your-app.onrender.com/auth/google/callback
BASE_URL=https://your-app.onrender.com
```

---

## 🐙 GitHub OAuth

### 1. Создание OAuth App
1. Перейдите в GitHub → **Settings** → **Developer settings**
2. Выберите **OAuth Apps** → **New OAuth App**
3. Заполните:
   - **Application name**: ChatApp
   - **Homepage URL**: `https://your-app.onrender.com`
   - **Authorization callback URL**: `https://your-app.onrender.com/auth/github/callback`
4. Нажмите **Register application**
5. Скопируйте **Client ID**
6. Нажмите **Generate a new client secret** и сохраните **Client Secret**

### 2. Настройка переменных окружения
```env
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=https://your-app.onrender.com/auth/github/callback
BASE_URL=https://your-app.onrender.com
```

---

## 📘 Facebook OAuth

### 1. Создание Facebook App
1. Перейдите на [Facebook Developers](https://developers.facebook.com/)
2. Создайте новое приложение
3. Добавьте продукт **Facebook Login**
4. В настройках Facebook Login:
   - **Valid OAuth Redirect URIs**: `https://your-app.onrender.com/auth/facebook/callback`
   - Сохраните изменения
5. Перейдите в **Settings** → **Basic**
6. Скопируйте **App ID** и **App Secret**

### 2. Настройка переменных окружения
```env
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_CALLBACK_URL=https://your-app.onrender.com/auth/facebook/callback
BASE_URL=https://your-app.onrender.com
```

---

## 🚀 Настройка на Render.com

### 1. Добавление переменных окружения
1. Перейдите в ваш сервис на Render
2. Откройте **Environment** вкладку
3. Добавьте все необходимые переменные:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_CALLBACK_URL=https://your-app.onrender.com/auth/google/callback
   
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   GITHUB_CALLBACK_URL=https://your-app.onrender.com/auth/github/callback
   
   FACEBOOK_APP_ID=...
   FACEBOOK_APP_SECRET=...
   FACEBOOK_CALLBACK_URL=https://your-app.onrender.com/auth/facebook/callback
   
   BASE_URL=https://your-app.onrender.com
   ```

### 2. Важно!
- Замените `your-app.onrender.com` на ваш реальный URL
- Callback URLs должны точно совпадать в Render и у провайдера
- Используйте HTTPS для всех callback URLs в продакшене

### 3. После настройки
1. Нажмите **Save Changes**
2. Render автоматически перезапустит приложение
3. Проверьте логи на наличие сообщений типа:
   ```
   Google OAuth configured with callback: https://...
   GitHub OAuth configured with callback: https://...
   Facebook OAuth configured with callback: https://...
   ```

---

## 🧪 Проверка работы

### 1. Локальная разработка
1. Убедитесь, что `.env` файл содержит все необходимые переменные
2. Запустите сервер: `npm start`
3. Проверьте логи - должны быть сообщения о конфигурации OAuth
4. Откройте `http://localhost:3000/auth.html`
5. Попробуйте войти через OAuth провайдера

### 2. Продакшен
1. Проверьте логи на Render после деплоя
2. Откройте ваше приложение на Render
3. Попробуйте войти через OAuth
4. Если не работает, проверьте:
   - Правильность callback URLs
   - Наличие всех переменных окружения
   - Логи на наличие ошибок

---

## 🐛 Решение проблем

### OAuth не работает
1. **Проверьте callback URL**: должен точно совпадать в Render и у провайдера
2. **Проверьте переменные окружения**: все должны быть установлены
3. **Проверьте логи**: найдите сообщения об ошибках
4. **Убедитесь, что BASE_URL установлен**: используется для автоматического формирования callback URLs

### Ошибка "OAuth not configured"
- Убедитесь, что Client ID и Client Secret установлены
- Проверьте, что переменные не пустые
- После изменения переменных перезапустите приложение

### Ошибка "Invalid redirect URI"
- Callback URL в Render должен точно совпадать с тем, что указано у провайдера
- Используйте полный URL с https://

---

## 📝 Примечания

- Для локальной разработки можно использовать HTTP (localhost)
- Для продакшена обязательно используйте HTTPS
- BASE_URL автоматически используется для формирования callback URLs, если CALLBACK_URL не указан явно
- OAuth провайдеры опциональны - приложение работает и без них (только Email/Password и Magic Links)


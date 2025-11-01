# 🚀 Быстрая настройка OAuth на Render.com

## 📋 Шаг 1: Получите OAuth Credentials

### Google OAuth:
1. Перейдите на https://console.cloud.google.com/
2. Создайте проект или выберите существующий
3. APIs & Services → Credentials → Create Credentials → OAuth client ID
4. Application type: **Web application**
5. Authorized redirect URIs: `https://ваш-домен.onrender.com/auth/google/callback`
6. Скопируйте **Client ID** и **Client Secret**

### GitHub OAuth:
1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Authorization callback URL: `https://ваш-домен.onrender.com/auth/github/callback`
3. Скопируйте **Client ID**
4. Generate a new client secret → Скопируйте **Client Secret**

### Facebook OAuth:
1. https://developers.facebook.com/apps/
2. Create App → Add Product → Facebook Login
3. Settings → Basic → Скопируйте **App ID** и **App Secret**
4. Facebook Login → Settings → Valid OAuth Redirect URIs: `https://ваш-домен.onrender.com/auth/facebook/callback`

---

## ⚙️ Шаг 2: Добавьте переменные на Render

1. Откройте ваш сервис на Render.com
2. Перейдите в **Environment** (окружение)
3. Добавьте следующие переменные:

### Обязательные для Google:
```
GOOGLE_CLIENT_ID=ваш-client-id-от-google
GOOGLE_CLIENT_SECRET=ваш-client-secret-от-google
GOOGLE_CALLBACK_URL=https://ваш-домен.onrender.com/auth/google/callback
```

### Обязательные для GitHub:
```
GITHUB_CLIENT_ID=ваш-client-id-от-github
GITHUB_CLIENT_SECRET=ваш-client-secret-от-github
GITHUB_CALLBACK_URL=https://ваш-домен.onrender.com/auth/github/callback
```

### Обязательные для Facebook:
```
FACEBOOK_APP_ID=ваш-app-id-от-facebook
FACEBOOK_APP_SECRET=ваш-app-secret-от-facebook
FACEBOOK_CALLBACK_URL=https://ваш-домен.onrender.com/auth/facebook/callback
```

### Общая переменная:
```
BASE_URL=https://ваш-домен.onrender.com
```

**⚠️ ВАЖНО:** Замените `ваш-домен.onrender.com` на реальный URL вашего приложения!

---

## 🔄 Шаг 3: Перезапуск

1. Нажмите **Save Changes** в Render
2. Сервис автоматически перезапустится
3. Подождите 1-2 минуты пока сервис запустится

---

## ✅ Шаг 4: Проверка

1. Откройте логи в Render (Logs)
2. Ищите сообщения:
   ```
   Google OAuth configured with callback: https://...
   GitHub OAuth configured with callback: https://...
   Facebook OAuth configured with callback: https://...
   ```
3. Если видите эти сообщения — OAuth настроен правильно!
4. Откройте приложение и попробуйте войти через OAuth

---

## 🐛 Решение проблем

### Ошибка "OAuth не настроен"
- ✅ Убедитесь, что все переменные добавлены в Render
- ✅ Проверьте, что Client ID и Secret не пустые
- ✅ Убедитесь, что BASE_URL указан правильно
- ✅ Проверьте логи на ошибки

### Ошибка "Invalid redirect URI"
- ✅ Callback URL в Render должен точно совпадать с тем, что указан у провайдера
- ✅ Используйте полный URL с https://
- ✅ Не должно быть лишних слешей в конце

### OAuth не работает после настройки
- ✅ Убедитесь, что сервис перезапустился после изменения переменных
- ✅ Проверьте логи на наличие ошибок
- ✅ Убедитесь, что используете правильный URL приложения

---

## 💡 Совет

Можно настроить только один провайдер для начала (например, Google), чтобы проверить что все работает, а затем добавить остальные.


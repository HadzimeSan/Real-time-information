# 🚀 Быстрая настройка Google OAuth

## 📍 Прямые ссылки:

1. **Google Cloud Console:** https://console.cloud.google.com/
2. **Создать проект:** https://console.cloud.google.com/projectcreate
3. **OAuth Consent Screen:** https://console.cloud.google.com/apis/credentials/consent
4. **Credentials (Client ID/Secret):** https://console.cloud.google.com/apis/credentials

---

## ⚡ Быстрые шаги:

### Шаг 1: Создать проект
1. Откройте [Google Cloud Console](https://console.cloud.google.com/)
2. Нажмите на выпадающий список проектов (вверху слева)
3. **New Project** → Введите название → **Create**

### Шаг 2: Настроить OAuth Consent Screen
1. Откройте [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Выберите **External** → **Create**
3. Заполните:
   - **App name**: ChatApp
   - **User support email**: ваш email
   - **Developer contact**: ваш email
4. **Save and Continue** → **Save and Continue** → **Save and Continue**

### Шаг 3: Создать OAuth Credentials
1. Откройте [Credentials](https://console.cloud.google.com/apis/credentials)
2. **+ CREATE CREDENTIALS** → **OAuth client ID**
3. **Application type**: **Web application**
4. **Name**: ChatApp Web Client
5. **Authorized redirect URIs**:
   ```
   http://localhost:3000/auth/google/callback
   https://your-app.onrender.com/auth/google/callback
   ```
   (Замените `your-app.onrender.com` на ваш реальный URL!)
6. **CREATE**
7. **Скопируйте:**
   - ✅ **Client ID** → это `GOOGLE_CLIENT_ID`
   - ✅ **Client secret** → это `GOOGLE_CLIENT_SECRET`

### Шаг 4: Добавить в Render
1. Откройте ваш сервис на Render
2. **Environment** → **Add Environment Variable**
3. Добавьте:
   ```
   KEY: GOOGLE_CLIENT_ID
   VALUE: [ваш Client ID]
   ```
4. Добавьте:
   ```
   KEY: GOOGLE_CLIENT_SECRET
   VALUE: [ваш Client Secret]
   ```
5. Добавьте:
   ```
   KEY: GOOGLE_CALLBACK_URL
   VALUE: https://your-app.onrender.com/auth/google/callback
   ```
   (Замените на ваш реальный URL!)
6. Добавьте:
   ```
   KEY: BASE_URL
   VALUE: https://your-app.onrender.com
   ```
7. **Save Changes**

### Шаг 5: Проверить
1. Подождите 1-2 минуты (Render перезапустит сервер)
2. Откройте логи на Render
3. Должно появиться:
   ```
   Google OAuth configured with callback: https://your-app.onrender.com/auth/google/callback
   ```
4. Попробуйте войти через Google на вашем сайте

---

## ⚠️ Важные моменты:

1. **Authorized redirect URIs** в Google Cloud Console должен **точно совпадать** с `GOOGLE_CALLBACK_URL` в Render
2. Используйте **HTTPS** для продакшена (не HTTP)
3. **Client secret** показывается только один раз - сохраните его сразу!
4. Если выбрали **External** в OAuth Consent Screen, добавьте тестовые email адреса в **Test users**

---

## 🐛 Проблемы?

### Ошибка "redirect_uri_mismatch"
- **См. подробную инструкцию:** [GOOGLE_OAUTH_REDIRECT_URI_FIX.md](./GOOGLE_OAUTH_REDIRECT_URI_FIX.md)
- **Кратко:**
  1. Проверьте логи Render - найдите строку `Google OAuth configured with callback:`
  2. Скопируйте этот URL
  3. Убедитесь, что **точно такой же** URL указан в Google Cloud Console в **Authorized redirect URIs**
  4. Используйте **HTTPS** (не HTTP)
  5. Без слеша в конце URL

### Ошибка "access_denied"
- Проверьте OAuth Consent Screen - возможно нужно добавить тестовых пользователей
- Убедитесь, что приложение опубликовано или добавлены тестовые пользователи

### Ошибка "invalid_client"
- Проверьте, что `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET` правильно скопированы
- Убедитесь, что нет лишних пробелов в переменных окружения

---

## 📚 Подробная документация:

См. [OAUTH_SETUP.md](./OAUTH_SETUP.md) для детальной информации.


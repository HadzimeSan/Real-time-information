# 🔧 Исправление ошибки "redirect_uri_mismatch" для Google OAuth

## ❌ Ошибка:
```
Ошибка 400: redirect_uri_mismatch
Доступ заблокирован: недопустимый запрос от приложения
```

## 🔍 Причина:
Redirect URI, который отправляет ваше приложение, **не совпадает** с тем, что указано в Google Cloud Console.

---

## ✅ Решение (пошагово):

### Шаг 1: Узнайте текущий URL вашего приложения на Render

1. Откройте ваш сервис на Render.com
2. Скопируйте **URL вашего приложения** (например: `https://real-time-information-xxxx.onrender.com`)
3. **Важно:** Используйте **HTTPS**, не HTTP!

### Шаг 2: Проверьте логи на Render

1. Откройте вкладку **Logs** на Render
2. Найдите строку:
   ```
   Google OAuth configured with callback: https://...
   ```
3. **Скопируйте этот URL полностью** - это то, что использует ваше приложение

### Шаг 3: Проверьте переменные окружения на Render

1. Откройте вкладку **Environment** на Render
2. Проверьте значение `GOOGLE_CALLBACK_URL`:
   - Должно быть: `https://ваш-домен.onrender.com/auth/google/callback`
   - **Без слеша в конце!**
   - **Только HTTPS!**
3. Если переменной нет или она неправильная:
   - Добавьте/измените:
     ```
     KEY: GOOGLE_CALLBACK_URL
     VALUE: https://ваш-домен.onrender.com/auth/google/callback
     ```
   - Нажмите **Save Changes**

### Шаг 4: Настройте Google Cloud Console

1. Откройте [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials)
2. Найдите ваш **OAuth 2.0 Client ID** (для приложения "Real-time information")
3. Нажмите на него, чтобы открыть настройки
4. Найдите раздел **Authorized redirect URIs**
5. **Удалите все старые URI** (если есть неправильные)
6. **Добавьте новый URI:**
   ```
   https://ваш-домен.onrender.com/auth/google/callback
   ```
   ⚠️ **Важно:**
   - Используйте **HTTPS** (не HTTP)
   - URL должен **точно совпадать** с `GOOGLE_CALLBACK_URL` из Render
   - **Без слеша в конце**
   - **С путем** `/auth/google/callback`

7. Нажмите **SAVE**

### Шаг 5: Проверьте BASE_URL

1. На Render, в разделе **Environment**, проверьте `BASE_URL`:
   ```
   KEY: BASE_URL
   VALUE: https://ваш-домен.onrender.com
   ```
   (Без `/auth/google/callback` в конце!)

### Шаг 6: Перезапустите приложение

1. После изменения переменных на Render, подождите 1-2 минуты
2. Или вручную: **Manual Deploy** → **Deploy latest commit**

### Шаг 7: Проверьте логи снова

1. Откройте **Logs** на Render
2. Найдите строку:
   ```
   Google OAuth configured with callback: https://ваш-домен.onrender.com/auth/google/callback
   ```
3. Убедитесь, что URL **точно совпадает** с тем, что в Google Cloud Console

---

## 📋 Чек-лист для проверки:

- [ ] `GOOGLE_CALLBACK_URL` на Render = `https://ваш-домен.onrender.com/auth/google/callback`
- [ ] `BASE_URL` на Render = `https://ваш-домен.onrender.com` (без пути)
- [ ] В Google Cloud Console в **Authorized redirect URIs** указан: `https://ваш-домен.onrender.com/auth/google/callback`
- [ ] Используется **HTTPS** (не HTTP)
- [ ] Нет лишних слешей в конце URL
- [ ] URL в логах Render совпадает с URL в Google Cloud Console

---

## 🎯 Пример правильной настройки:

**На Render (Environment):**
```
GOOGLE_CLIENT_ID=123456789-abcdefgh.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnopqrstuvwxyz
GOOGLE_CALLBACK_URL=https://real-time-information-xxxx.onrender.com/auth/google/callback
BASE_URL=https://real-time-information-xxxx.onrender.com
```

**В Google Cloud Console (Authorized redirect URIs):**
```
https://real-time-information-xxxx.onrender.com/auth/google/callback
```

**В логах Render должно быть:**
```
Google OAuth configured with callback: https://real-time-information-xxxx.onrender.com/auth/google/callback
```

---

## ⚠️ Частые ошибки:

### ❌ Неправильно:
```
GOOGLE_CALLBACK_URL=http://ваш-домен.onrender.com/auth/google/callback  (HTTP вместо HTTPS)
GOOGLE_CALLBACK_URL=https://ваш-домен.onrender.com/auth/google/callback/  (лишний слеш)
GOOGLE_CALLBACK_URL=https://ваш-домен.onrender.com  (нет пути /auth/google/callback)
```

### ✅ Правильно:
```
GOOGLE_CALLBACK_URL=https://ваш-домен.onrender.com/auth/google/callback
```

---

## 🔄 Если всё равно не работает:

1. **Проверьте, что URL в логах Render совпадает с Google Cloud Console:**
   - Откройте логи Render
   - Найдите строку `Google OAuth configured with callback:`
   - Скопируйте этот URL
   - Убедитесь, что **точно такой же** URL указан в Google Cloud Console

2. **Проверьте, что используете правильный OAuth Client ID:**
   - В Google Cloud Console может быть несколько Client ID
   - Убедитесь, что используете тот, в котором указан правильный redirect URI

3. **Попробуйте добавить оба варианта (с www и без):**
   - Если ваш домен может быть доступен как с www, так и без:
   ```
   https://ваш-домен.onrender.com/auth/google/callback
   https://www.ваш-домен.onrender.com/auth/google/callback
   ```

4. **Очистите кеш браузера** и попробуйте снова

---

## 📞 Если проблема остаётся:

1. Скопируйте URL из логов Render (строка `Google OAuth configured with callback:`)
2. Скопируйте все URI из Google Cloud Console (раздел Authorized redirect URIs)
3. Сравните их - они должны быть **идентичными**


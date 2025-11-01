# 🐙 Настройка GitHub OAuth на Render

## 📋 Шаг 1: Создание OAuth App на GitHub

1. **Откройте GitHub** и перейдите в **Settings** (настройки) вашего аккаунта:
   - Нажмите на аватар в правом верхнем углу
   - Выберите **Settings**

2. **Перейдите в Developer settings**:
   - В левом меню прокрутите вниз до раздела **Developer settings**
   - Нажмите на него

3. **Откройте OAuth Apps**:
   - В левом меню выберите **OAuth Apps**
   - Нажмите **New OAuth App** (или **Register a new application**)

4. **Заполните форму OAuth App**:
   ```
   Application name: Real-time Chat App
   Homepage URL: https://ВАШ_APP_NAME.onrender.com
   Authorization callback URL: https://ВАШ_APP_NAME.onrender.com/auth/github/callback
   ```
   
   ⚠️ **ВАЖНО:** Замените `ВАШ_APP_NAME` на реальное имя вашего приложения на Render!

5. **Сохраните приложение**:
   - Нажмите **Register application**

6. **Скопируйте Client ID**:
   - На странице приложения вы увидите **Client ID**
   - Скопируйте его (например: `Iv1.a1b2c3d4e5f6g7h8`)

7. **Создайте Client Secret**:
   - Нажмите **Generate a new client secret**
   - ⚠️ **ВАЖНО:** Скопируйте **Client Secret** сразу! Он показывается только один раз!
   - Если потеряли - нужно будет создать новый

---

## ⚙️ Шаг 2: Добавление переменных окружения на Render

1. **Откройте Render Dashboard**:
   - Перейдите на https://dashboard.render.com/
   - Войдите в аккаунт

2. **Откройте ваш сервис**:
   - Найдите ваш Web Service в списке
   - Нажмите на него

3. **Перейдите в Environment**:
   - В левом меню выберите **Environment**
   - Или нажмите на вкладку **Environment** вверху

4. **Добавьте переменные окружения**:
   
   Нажмите **Add Environment Variable** и добавьте по одной:

   **Переменная 1:**
   ```
   Key: GITHUB_CLIENT_ID
   Value: вставьте ваш Client ID из GitHub (например: Iv1.a1b2c3d4e5f6g7h8)
   ```

   **Переменная 2:**
   ```
   Key: GITHUB_CLIENT_SECRET
   Value: вставьте ваш Client Secret из GitHub (например: abc123def456ghi789)
   ```

   **Переменная 3:**
   ```
   Key: GITHUB_CALLBACK_URL
   Value: https://ВАШ_APP_NAME.onrender.com/auth/github/callback
   ```
   ⚠️ Замените `ВАШ_APP_NAME` на реальное имя вашего приложения!

   **Переменная 4 (если еще не добавлена):**
   ```
   Key: BASE_URL
   Value: https://ВАШ_APP_NAME.onrender.com
   ```
   ⚠️ Замените `ВАШ_APP_NAME` на реальное имя вашего приложения!

5. **Сохраните изменения**:
   - Нажмите **Save Changes** внизу страницы
   - Render автоматически перезапустит ваш сервис

---

## ⏱️ Шаг 3: Ожидание перезапуска

1. **Подождите 1-2 минуты**, пока Render перезапустит сервис
2. **Перейдите в Logs** (логи) вашего сервиса
3. **Ищите сообщение**:
   ```
   GitHub OAuth configured with callback: https://...
   ```
   
   Если видите это сообщение — GitHub OAuth настроен правильно! ✅

---

## ✅ Шаг 4: Проверка работы

1. **Откройте ваше приложение**:
   - Перейдите на https://ВАШ_APP_NAME.onrender.com/auth.html

2. **Попробуйте войти через GitHub**:
   - Нажмите кнопку **"Войти через GitHub"**
   - Должно перенаправить на GitHub для авторизации
   - После авторизации должно вернуть обратно в приложение

---

## 🐛 Решение проблем

### Ошибка "GitHub OAuth не настроен"
- ✅ Проверьте, что все 4 переменные добавлены в Render:
  - `GITHUB_CLIENT_ID`
  - `GITHUB_CLIENT_SECRET`
  - `GITHUB_CALLBACK_URL`
  - `BASE_URL`
- ✅ Убедитесь, что переменные не пустые (нет пробелов в начале/конце)
- ✅ Убедитесь, что сервис перезапустился после добавления переменных
- ✅ Проверьте логи на наличие ошибок

### Ошибка "Invalid redirect URI"
- ✅ Callback URL в Render должен **точно совпадать** с тем, что указан в GitHub OAuth App
- ✅ Используйте полный URL с `https://`
- ✅ Не должно быть лишних слешей в конце (`/callback` не `/callback/`)
- ✅ Убедитесь, что в Render и GitHub используется одинаковый URL

### GitHub показывает "Application error"
- ✅ Проверьте, что Client ID и Secret скопированы правильно (без лишних пробелов)
- ✅ Убедитесь, что создали Client Secret (не только Client ID)

---

## 📝 Примеры правильных значений

### Правильный GITHUB_CALLBACK_URL:
```
✅ https://my-chat-app.onrender.com/auth/github/callback
❌ https://my-chat-app.onrender.com/auth/github/callback/  (лишний слеш)
❌ http://my-chat-app.onrender.com/auth/github/callback   (http вместо https)
❌ my-chat-app.onrender.com/auth/github/callback          (без https://)
```

### Правильный BASE_URL:
```
✅ https://my-chat-app.onrender.com
❌ https://my-chat-app.onrender.com/  (лишний слеш)
❌ http://my-chat-app.onrender.com   (http вместо https)
```

---

## 💡 Совет

После настройки проверьте логи Render. Если видите:
```
GitHub OAuth configured with callback: https://...
```

Это означает, что все настроено правильно! ✅


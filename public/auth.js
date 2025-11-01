// Проверяем, есть ли токен в URL (от OAuth или Magic Link)
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');
const error = urlParams.get('error');

if (token) {
    // Сохраняем токен и перенаправляем в приложение
    localStorage.setItem('authToken', token);
    window.location.href = '/';
}

if (error) {
    let errorMessage = 'Ошибка аутентификации';
    switch(error) {
        case 'oauth_failed':
            errorMessage = 'Ошибка входа через OAuth. Проверьте настройки или попробуйте другой метод входа.';
            break;
        case 'no_user':
            errorMessage = 'Не удалось получить информацию о пользователе. Попробуйте снова.';
            break;
        case 'not_configured':
            errorMessage = 'OAuth не настроен на сервере. Обратитесь к администратору или используйте Email/Password/Magic Link для входа.';
            break;
        default:
            const decodedError = decodeURIComponent(error);
            if (decodedError.includes('не настроен') || decodedError.includes('not configured')) {
                errorMessage = 'OAuth провайдер не настроен. Используйте Email/Password или Magic Link для входа. Для настройки OAuth см. инструкцию в файле OAUTH_QUICK_SETUP.md';
            } else {
                errorMessage = decodedError || 'Ошибка входа';
            }
    }
    showError(errorMessage);
}

// Обработка клика по OAuth кнопкам
document.querySelectorAll('.oauth-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        // Разрешаем переход - если OAuth настроен, произойдет редирект
        // Если не настроен - пользователь увидит ошибку на странице или будет редирект обратно с ошибкой
    });
});

// Переключение между табами
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        
        // Обновляем активные табы
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(`${tabName}-form`).classList.add('active');
    });
});

// Форма входа
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const twoFactorToken = document.getElementById('login2FAToken').value;
    
    try {
        const response = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, twoFactorToken })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (data.requires2FA) {
                // Показываем поле для 2FA
                document.getElementById('login2FA').style.display = 'block';
                showMessage('Введите код из приложения-аутентификатора', 'info');
                return;
            }
            throw new Error(data.error || 'Ошибка входа');
        }
        
        // Сохраняем токен и перенаправляем
        localStorage.setItem('authToken', data.token);
        window.location.href = '/';
    } catch (error) {
        showError(error.message);
    }
});

// Сохраняем данные регистрации для повторной отправки кода
let registrationData = null;

// Форма регистрации - отправка кода на email
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('registerEmail').value;
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
    
    if (password !== passwordConfirm) {
        showError('Пароли не совпадают');
        return;
    }
    
    if (password.length < 6) {
        showError('Пароль должен содержать минимум 6 символов');
        return;
    }
    
    // Сохраняем данные для возможной повторной отправки
    registrationData = { email, username, password };
    
    const btn = document.getElementById('registerSubmitBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Отправка...';
    
    // Создаем контроллер для отмены запроса
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 секунд таймаут
    
    try {
        const response = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, username, password }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Проверяем статус ответа
        if (!response.ok) {
            let errorMessage = 'Ошибка отправки кода';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
                
                // Если SMTP не настроен, показываем код для разработки
                if (errorData.development && errorData.development.verificationCode) {
                    // Показываем поле для ввода кода даже при ошибке (для разработки)
                    const verificationCodeSection = document.getElementById('verificationCodeSection');
                    const devCodeDisplay = document.getElementById('devCodeDisplay');
                    const devCode = document.getElementById('devCode');
                    const registerForm = document.getElementById('registerForm');
                    
                    if (verificationCodeSection) {
                        verificationCodeSection.style.display = 'block';
                    }
                    if (devCodeDisplay) {
                        devCodeDisplay.style.setProperty('display', 'block', 'important');
                        devCodeDisplay.style.setProperty('visibility', 'visible', 'important');
                        devCodeDisplay.style.setProperty('opacity', '1', 'important');
                    }
                    if (devCode) {
                        devCode.textContent = errorData.development.verificationCode;
                        devCode.style.setProperty('color', '#856404', 'important');
                        
                        devCode.style.setProperty('font-size', '18px', 'important');
                        devCode.style.setProperty('font-weight', 'bold', 'important');
                    }
                    if (registerForm) {
                        registerForm.style.display = 'none';
                    }
                    
                    showMessage(errorData.development.message || 'SMTP не настроен, но код показан для разработки', 'info');
                    return; // Выходим, не показывая ошибку
                }
            } catch (parseError) {
                // Если не удалось распарсить JSON, используем текст ответа
                const text = await response.text();
                errorMessage = text || errorMessage;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        // Отладочная информация
        console.log('📧 Ответ сервера:', data);
        console.log('📧 Development код:', data.development);
        
        // Показываем поле для ввода кода
        const verificationCodeSection = document.getElementById('verificationCodeSection');
        if (verificationCodeSection) {
            verificationCodeSection.style.display = 'block';
            console.log('✅ verificationCodeSection показан');
        } else {
            console.error('❌ verificationCodeSection не найден!');
        }
        
        // Показываем код для разработки (если есть)
        if (data.development && data.development.verificationCode) {
            console.log('✅ Код получен:', data.development.verificationCode);
            const devCodeDisplay = document.getElementById('devCodeDisplay');
            const devCode = document.getElementById('devCode');
            
            if (devCodeDisplay) {
                // Принудительно показываем элемент с !important
                devCodeDisplay.style.setProperty('display', 'block', 'important');
                devCodeDisplay.style.setProperty('visibility', 'visible', 'important');
                devCodeDisplay.style.setProperty('opacity', '1', 'important');
                devCodeDisplay.style.setProperty('height', 'auto', 'important');
                devCodeDisplay.style.setProperty('width', 'auto', 'important');
                devCodeDisplay.style.setProperty('min-height', '40px', 'important');
                devCodeDisplay.style.setProperty('position', 'relative', 'important');
                devCodeDisplay.style.setProperty('z-index', '9999', 'important');
                
                // Проверяем родительские элементы
                let parent = devCodeDisplay.parentElement;
                let level = 0;
                while (parent && level < 5) {
                    const parentStyles = window.getComputedStyle(parent);
                    console.log(`✅ Родитель элемент уровень ${level}:`, {
                        tag: parent.tagName,
                        id: parent.id,
                        class: parent.className,
                        display: parentStyles.display,
                        visibility: parentStyles.visibility,
                        opacity: parentStyles.opacity,
                        height: parentStyles.height
                    });
                    
                    // Убеждаемся, что родители видимы
                    if (parentStyles.display === 'none') {
                        parent.style.setProperty('display', 'block', 'important');
                    }
                    parent = parent.parentElement;
                    level++;
                }
                
                console.log('✅ devCodeDisplay показан');
                const computedStyles = window.getComputedStyle(devCodeDisplay);
                console.log('✅ Проверка стилей devCodeDisplay:', {
                    display: computedStyles.display,
                    visibility: computedStyles.visibility,
                    opacity: computedStyles.opacity,
                    height: computedStyles.height,
                    width: computedStyles.width,
                    position: computedStyles.position,
                    zIndex: computedStyles.zIndex,
                    backgroundColor: computedStyles.backgroundColor,
                    padding: computedStyles.padding,
                    margin: computedStyles.margin
                });
                
                // Проверяем, что элемент действительно в DOM
                console.log('✅ Проверка DOM:', {
                    offsetHeight: devCodeDisplay.offsetHeight,
                    offsetWidth: devCodeDisplay.offsetWidth,
                    clientHeight: devCodeDisplay.clientHeight,
                    clientWidth: devCodeDisplay.clientWidth,
                    scrollHeight: devCodeDisplay.scrollHeight,
                    scrollWidth: devCodeDisplay.scrollWidth
                });
            } else {
                console.error('❌ devCodeDisplay не найден!');
            }
            
            if (devCode) {
                devCode.textContent = data.development.verificationCode;
                // Убеждаемся, что код виден
                devCode.style.setProperty('color', '#856404', 'important');
                devCode.style.setProperty('font-size', '18px', 'important');
                devCode.style.setProperty('font-weight', 'bold', 'important');
                console.log('✅ devCode установлен:', data.development.verificationCode);
                console.log('✅ Содержимое элемента:', devCode.textContent);
                console.log('✅ Родительский элемент виден?', devCodeDisplay ? window.getComputedStyle(devCodeDisplay).display !== 'none' : 'N/A');
            } else {
                console.error('❌ devCode не найден!');
            }
            
            // Показываем дополнительное сообщение, если есть
            if (data.development.message) {
                showMessage(data.development.message, 'info');
            } else {
                showMessage('Код подтверждения отправлен на ваш email!', 'success');
            }
        } else {
            console.warn('⚠️ Код не получен в ответе!');
            console.warn('data.development:', data.development);
            showMessage('Код подтверждения отправлен на ваш email!', 'success');
        }
        
        // Скрываем форму регистрации
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.style.display = 'none';
        }
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            showError('Превышено время ожидания ответа. Проверьте соединение с сервером.');
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showError('Не удалось подключиться к серверу. Проверьте интернет-соединение.');
        } else {
            showError(error.message || 'Ошибка отправки кода');
        }
        console.error('Ошибка регистрации:', error);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

// Форма подтверждения email
document.getElementById('verifyEmailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!registrationData) {
        showError('Ошибка: данные регистрации не найдены');
        return;
    }
    
    const code = document.getElementById('verificationCode').value;
    
    if (!code || code.length !== 6) {
        showError('Введите 6-значный код подтверждения');
        return;
    }
    
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Подтверждение...';
    
    try {
        const response = await fetch('/auth/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: registrationData.email, code })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Ошибка подтверждения email');
        }
        
        // Сохраняем токен и перенаправляем
        localStorage.setItem('authToken', data.token);
        showMessage('Email подтвержден! Регистрация завершена!', 'success');
        
        setTimeout(() => {
            window.location.href = '/';
        }, 1000);
    } catch (error) {
        showError(error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

// Повторная отправка кода
document.getElementById('resendCodeBtn').addEventListener('click', async () => {
    if (!registrationData) {
        showError('Ошибка: данные регистрации не найдены');
        return;
    }
    
    const btn = document.getElementById('resendCodeBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Отправка...';
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
        const response = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(registrationData),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            let errorMessage = 'Ошибка отправки кода';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
                
                // Если SMTP не настроен, показываем код для разработки
                if (errorData.development && errorData.development.verificationCode) {
                    const devCodeDisplay = document.getElementById('devCodeDisplay');
                    const devCode = document.getElementById('devCode');
                    if (devCodeDisplay) {
                        devCodeDisplay.style.setProperty('display', 'block', 'important');
                        devCodeDisplay.style.setProperty('visibility', 'visible', 'important');
                        devCodeDisplay.style.setProperty('opacity', '1', 'important');
                    }
                    if (devCode) {
                        devCode.textContent = errorData.development.verificationCode;
                        devCode.style.setProperty('color', '#856404', 'important');
                        devCode.style.setProperty('font-size', '18px', 'important');
                        devCode.style.setProperty('font-weight', 'bold', 'important');
                    }
                    showMessage(errorData.development.message || 'SMTP не настроен, но код показан для разработки', 'info');
                    return;
                }
            } catch (parseError) {
                const text = await response.text();
                errorMessage = text || errorMessage;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        // Обновляем отображение кода для разработки (если есть)
        if (data.development && data.development.verificationCode) {
            const devCodeDisplay = document.getElementById('devCodeDisplay');
            const devCode = document.getElementById('devCode');
            if (devCodeDisplay) {
                devCodeDisplay.style.setProperty('display', 'block', 'important');
                devCodeDisplay.style.setProperty('visibility', 'visible', 'important');
                devCodeDisplay.style.setProperty('opacity', '1', 'important');
            }
            if (devCode) {
                devCode.textContent = data.development.verificationCode;
                devCode.style.setProperty('color', '#856404', 'important');
                devCode.style.setProperty('font-size', '18px', 'important');
                devCode.style.setProperty('font-weight', 'bold', 'important');
            }
            
            // Показываем сообщение из development, если есть
            if (data.development.message) {
                showMessage(data.development.message, 'info');
            }
        }
        
        showMessage('Новый код подтверждения отправлен на ваш email!', 'success');
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            showError('Превышено время ожидания ответа. Проверьте соединение с сервером.');
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showError('Не удалось подключиться к серверу. Проверьте интернет-соединение.');
        } else {
            showError(error.message || 'Ошибка отправки кода');
        }
        console.error('Ошибка повторной отправки кода:', error);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

// Magic Link форма
document.getElementById('magicLinkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('magicEmail').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    
    btn.disabled = true;
    btn.textContent = 'Отправка...';
    
    try {
        const response = await fetch('/auth/magic-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Ошибка отправки Magic Link');
        }
        
        const resultDiv = document.getElementById('magicLinkResult');
        const urlDiv = document.getElementById('magicLinkUrl');
        
        resultDiv.style.display = 'block';
        
        if (data.development && data.development.magicLinkUrl) {
            urlDiv.textContent = data.development.magicLinkUrl;
            urlDiv.innerHTML = `<a href="${data.development.magicLinkUrl}" target="_blank">${data.development.magicLinkUrl}</a>`;
        } else {
            urlDiv.textContent = 'Проверьте вашу почту';
        }
        
        showMessage('Magic Link отправлен на вашу почту!', 'success');
    } catch (error) {
        showError(error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

// Функции для отображения сообщений
function showError(message) {
    const existing = document.querySelector('.error-message');
    if (existing) {
        existing.remove();
    }
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    const activeForm = document.querySelector('.auth-form.active');
    activeForm.insertBefore(errorDiv, activeForm.firstChild);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function showMessage(message, type = 'success') {
    const existing = document.querySelector(`.${type}-message`);
    if (existing) {
        existing.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `${type}-message`;
    messageDiv.textContent = message;
    
    const activeForm = document.querySelector('.auth-form.active');
    activeForm.insertBefore(messageDiv, activeForm.firstChild);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

// Проверяем, авторизован ли пользователь
async function checkAuth() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        return false;
    }
    
    try {
        const response = await fetch('/auth/verify', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        return data.success;
    } catch {
        localStorage.removeItem('authToken');
        return false;
    }
}

// Проверяем OAuth провайдеры (но НЕ скрываем кнопки - оставляем их всегда видимыми)
async function checkOAuthProviders() {
    const providers = ['google', 'github'];
    
    for (const provider of providers) {
        const btn = document.querySelector(`.oauth-btn.${provider}`);
        if (!btn) continue;
        
        // Убеждаемся, что кнопка видима
        btn.style.display = '';
        
        // Только логируем статус, но не скрываем кнопки
        try {
            const response = await fetch(`/auth/${provider}`, { 
                method: 'GET',
                redirect: 'manual'
            });
        
            if (response.status === 503) {
                console.log(`${provider} OAuth not configured (button remains visible)`);
            } else if (response.status === 302 || response.status === 307 || response.status === 308) {
                console.log(`${provider} OAuth is configured`);
            }
        } catch (error) {
            console.log(`Could not check ${provider} OAuth status:`, error.message);
        }
    }
}

// Убеждаемся, что все OAuth кнопки видимы при загрузке
function ensureOAuthButtonsVisible() {
    document.querySelectorAll('.oauth-btn').forEach(btn => {
        btn.style.display = 'flex';
        btn.style.visibility = 'visible';
        btn.style.opacity = '1';
    });
    const oauthContainer = document.querySelector('.oauth-buttons');
    if (oauthContainer) {
        oauthContainer.style.display = 'flex';
        oauthContainer.style.visibility = 'visible';
    }
}

// Вызываем сразу
ensureOAuthButtonsVisible();

// И при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    ensureOAuthButtonsVisible();
});

// И через небольшой таймаут для надежности
setTimeout(ensureOAuthButtonsVisible, 50);
setTimeout(ensureOAuthButtonsVisible, 200);
setTimeout(ensureOAuthButtonsVisible, 500);

// Если пользователь уже авторизован, перенаправляем
checkAuth().then(isAuth => {
    if (isAuth) {
        window.location.href = '/';
    } else {
        // Убеждаемся, что кнопки видны, проверяем только для логирования
        ensureOAuthButtonsVisible();
        setTimeout(() => {
            ensureOAuthButtonsVisible();
            // Проверяем статус (но не скрываем)
            checkOAuthProviders();
        }, 100);
    }
});



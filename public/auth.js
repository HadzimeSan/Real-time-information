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
        default:
            errorMessage = decodeURIComponent(error) || 'Ошибка входа';
    }
    showError(errorMessage);
}

// Обработка клика по OAuth кнопкам с проверкой ошибок
document.querySelectorAll('.oauth-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        // Не блокируем клик - позволяем стандартному поведению ссылки
        // Если OAuth не настроен, сервер вернет ошибку, которую мы обработаем
        // Если настроен - произойдет нормальный редирект
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

// Форма регистрации
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
    
    try {
        const response = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, username, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Ошибка регистрации');
        }
        
        // Сохраняем токен и перенаправляем
        localStorage.setItem('authToken', data.token);
        window.location.href = '/';
    } catch (error) {
        showError(error.message);
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
    const providers = ['google', 'github', 'facebook'];
    
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



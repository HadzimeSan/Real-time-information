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
    showError(error);
}

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

// Скрываем OAuth кнопки если провайдеры не настроены
async function checkOAuthProviders() {
    try {
        // Пробуем получить доступ к OAuth endpoints
        // Если они недоступны, скрываем кнопки
        const providers = ['google', 'github', 'facebook'];
        for (const provider of providers) {
            try {
                await fetch(`/auth/${provider}`, { method: 'HEAD' });
            } catch {
                const btn = document.querySelector(`.oauth-btn.${provider}`);
                if (btn) {
                    btn.style.display = 'none';
                }
            }
        }
    } catch (error) {
        console.log('OAuth providers check failed:', error);
    }
}

// Если пользователь уже авторизован, перенаправляем
checkAuth().then(isAuth => {
    if (isAuth) {
        window.location.href = '/';
    } else {
        // Проверяем доступность OAuth провайдеров
        checkOAuthProviders();
    }
});


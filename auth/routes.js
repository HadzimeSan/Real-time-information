const express = require('express');
const router = express.Router();
const passport = require('./passport-config');
const authModule = require('./auth');
const {
  registerUser,
  loginUser,
  generateToken,
  verifyToken,
  createMagicLink,
  verifyMagicLink,
  enable2FA,
  verify2FA,
  require2FA,
  getUserById,
  createEmailVerificationCode,
  verifyEmailCode
} = authModule;

// Получаем readUsers из модуля для проверки существующих пользователей
const { readUsers } = authModule;
const nodemailer = require('nodemailer');
const https = require('https');

// Настройка nodemailer для отправки email
// Обрабатываем пароль: убираем пробелы (Gmail App Password обычно без пробелов)
const smtpPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : '';

// Функция для создания транспортера с разными настройками
function createTransporter(port, secure) {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: port,
    secure: secure, // true для 465, false для 587
    auth: {
      user: process.env.SMTP_USER || '',
      pass: smtpPass
    },
    // Дополнительные опции для лучшей совместимости
    tls: {
      rejectUnauthorized: false // для самоподписанных сертификатов
    },
    // Увеличенные таймауты для надежности (особенно для Render)
    connectionTimeout: 30000, // 30 секунд на соединение
    greetingTimeout: 30000, // 30 секунд на приветствие
    socketTimeout: 60000, // 60 секунд общий таймаут
    // Дополнительные опции для стабильности
    pool: false, // отключаем пул для избежания проблем с переиспользованием соединений
    // Упрощенные настройки для надежности
    requireTLS: !secure // требовать TLS для порта 587
  });
}

// Создаем транспортер с портом из переменных окружения или пробуем оба порта
const smtpPort = parseInt(process.env.SMTP_PORT || '465'); // По умолчанию 465 (более надежен на Render)
const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;

let transporter = createTransporter(smtpPort, smtpSecure);

// Функция для переключения на альтернативный порт при ошибке
function switchTransporterPort() {
  const currentPort = transporter.options.port;
  const currentSecure = transporter.options.secure;
  
  if (currentPort === 465 && !currentSecure) {
    // Если был 465, пробуем 587
    console.log('🔄 Переключение на порт 587 с STARTTLS...');
    transporter = createTransporter(587, false);
  } else if (currentPort === 587 && !currentSecure) {
    // Если был 587, пробуем 465
    console.log('🔄 Переключение на порт 465 с SSL...');
    transporter = createTransporter(465, true);
  } else {
    // Если secure уже true, пробуем 587
    console.log('🔄 Переключение на порт 587 с STARTTLS...');
    transporter = createTransporter(587, false);
  }
  
  console.log(`📧 Новые SMTP настройки: port=${transporter.options.port}, secure=${transporter.options.secure}`);
}

// Проверка соединения с SMTP при старте (отключена - проверяем только при отправке)
// Некоторые хостинги (например Render) могут блокировать проверку соединения при старте
if (process.env.SMTP_USER && smtpPass) {
  console.log('📧 SMTP настройки:', {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: smtpPort,
    secure: smtpSecure,
    user: process.env.SMTP_USER,
    passLength: smtpPass.length,
    passPreview: smtpPass ? `${smtpPass.substring(0, 4)}...${smtpPass.substring(smtpPass.length - 4)}` : 'не установлен'
  });
  console.log('ℹ️  Проверка SMTP соединения при старте отключена (будет проверено при первой отправке)');
  console.log('ℹ️  Это помогает избежать проблем с блокировкой портов на некоторых хостингах');
} else {
  console.warn('⚠️  SMTP не настроен: SMTP_USER или SMTP_PASS отсутствуют');
  console.warn('Для работы регистрации с подтверждением email необходимо настроить SMTP');
}

// Регистрация - отправка кода подтверждения на email
router.post('/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Проверяем, не существует ли уже пользователь с таким email
    const users = await readUsers();
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    // Генерируем и отправляем код подтверждения
    const code = await createEmailVerificationCode(email, password, username);
    
    // Проверяем наличие SMTP настроек
    if (!process.env.SMTP_USER || !smtpPass) {
      console.error('SMTP не настроен: SMTP_USER или SMTP_PASS отсутствуют');
      // Возвращаем код сразу (не ждем отправки email)
      return res.json({
        success: true,
        message: 'Код подтверждения отправлен на ваш email',
        // Для разработки возвращаем код даже если SMTP не настроен
        development: { 
          verificationCode: code,
          message: 'SMTP не настроен, но код показан для разработки'
        }
      });
    }
    
    // Отправляем email с кодом (пытаемся дождаться результата с таймаутом)
    console.log(`📧 Попытка отправить код подтверждения на ${email}...`);
    console.log(`📧 Отправитель: ${process.env.SMTP_USER}`);
    console.log(`📧 SMTP настройки: host=${process.env.SMTP_HOST}, port=${process.env.SMTP_PORT}, secure=${process.env.SMTP_SECURE}`);
    
    let emailSent = false;
    let emailError = null;
    
    // Сначала пробуем отправить через Resend API (если настроен) - обходит блокировку портов на Render
    if (process.env.RESEND_API_KEY) {
      try {
        console.log('📧 Попытка отправить email через Resend API...');
        
        // Для Resend используем тестовый email если домен не настроен
        // Gmail адреса не работают без верификации домена
        // В бесплатном плане Resend тестовые emails можно отправлять только на адрес регистрации
        let fromEmail = 'onboarding@resend.dev'; // По умолчанию тестовый email
        
        // Проверяем, не является ли SMTP_USER Gmail адресом
        if (process.env.SMTP_USER && !process.env.SMTP_USER.includes('@gmail.com') && !process.env.SMTP_USER.includes('@resend.dev')) {
          // Если это не Gmail и не тестовый Resend email, используем его (предполагаем, что домен настроен)
          fromEmail = process.env.SMTP_USER;
        }
        
        // В бесплатном плане Resend: тестовые emails можно отправлять только на email регистрации
        // Предупреждаем пользователя, если отправляем на другой адрес
        const resendRegisteredEmail = process.env.RESEND_REGISTERED_EMAIL || 'p.h.4@mail.ru';
        if (fromEmail === 'onboarding@resend.dev' && email !== resendRegisteredEmail) {
          console.warn(`⚠️ ВНИМАНИЕ: Resend бесплатный план позволяет отправлять тестовые emails только на ${resendRegisteredEmail}`);
          console.warn(`⚠️ Письмо может не дойти до ${email}. Для отправки на любой адрес верифицируйте домен в Resend.`);
        }
        
        const postData = JSON.stringify({
          from: `ChatApp <${fromEmail}>`,
          to: email,
          subject: 'Код подтверждения регистрации - ChatApp',
          html: `
            <h2>Код подтверждения регистрации</h2>
            <p>Ваш код подтверждения:</p>
            <h1 style="color: #4CAF50; font-size: 32px; text-align: center; letter-spacing: 5px;">${code}</h1>
            <p>Введите этот код на странице регистрации для завершения регистрации.</p>
            <p>Код действителен в течение 15 минут.</p>
            <p>Если вы не запрашивали регистрацию, просто проигнорируйте это письмо.</p>
          `
        });
        
        const options = {
          hostname: 'api.resend.com',
          port: 443,
          path: '/emails',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 30000
        };
        
        await new Promise((resolve, reject) => {
          const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode === 200) {
                const result = JSON.parse(data);
                emailSent = true;
                console.log(`✅ Email успешно отправлен через Resend на ${email}`);
                console.log(`   Message ID: ${result.id || 'N/A'}`);
                resolve(result);
              } else {
                reject(new Error(`Resend API error: ${res.statusCode} - ${data}`));
              }
            });
          });
          
          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Resend API timeout'));
          });
          
          req.write(postData);
          req.end();
        });
      } catch (resendError) {
        console.warn('⚠️ Отправка через Resend не удалась, пробуем SMTP...');
        console.warn('   Ошибка:', resendError.message);
        // Продолжаем с обычным SMTP
      }
    }
    
    // Если Resend не настроен или не сработал, пробуем обычный SMTP
    if (!emailSent) {
      // Функция для отправки email с повторными попытками и переключением портов
    const sendEmailWithRetry = async (retries = 3) => {
      let lastError = null;
      
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          console.log(`📧 Попытка ${attempt} из ${retries} отправки email на ${email}...`);
          console.log(`📧 Используется порт ${transporter.options.port}, secure=${transporter.options.secure}`);
          
          const mailInfo = await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: email,
            subject: 'Код подтверждения регистрации - ChatApp',
            html: `
              <h2>Код подтверждения регистрации</h2>
              <p>Ваш код подтверждения:</p>
              <h1 style="color: #4CAF50; font-size: 32px; text-align: center; letter-spacing: 5px;">${code}</h1>
              <p>Введите этот код на странице регистрации для завершения регистрации.</p>
              <p>Код действителен в течение 15 минут.</p>
              <p>Если вы не запрашивали регистрацию, просто проигнорируйте это письмо.</p>
            `
          });
          return mailInfo;
        } catch (err) {
          lastError = err;
          console.error(`❌ Попытка ${attempt} не удалась:`, err.message);
          console.error(`   Код ошибки: ${err.code}`);
          console.error(`   Команда: ${err.command || 'N/A'}`);
          
          // Если ошибка связана с подключением и не последняя попытка - пробуем другой порт
          if (attempt < retries && (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.message.includes('timeout'))) {
            console.log('🔄 Пробуем переключиться на альтернативный порт...');
            switchTransporterPort();
            
            const delay = attempt * 2000; // 2, 4, 6 секунд задержка между попытками
            console.log(`⏳ Повторная попытка через ${delay}мс с новым портом...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else if (attempt < retries) {
            const delay = attempt * 2000;
            console.log(`⏳ Повторная попытка через ${delay}мс...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // Если все попытки не удались - пробрасываем последнюю ошибку
      throw lastError;
    };
    
      // Создаем промис для отправки email с таймаутом
    const sendEmailWithTimeout = Promise.race([
      sendEmailWithRetry(3), // 3 попытки отправки (с автоматическим переключением портов)
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Таймаут отправки email (45 секунд)'));
        }, 45000); // 45 секунд таймаут (увеличено с 15)
      })
    ]).then((mailInfo) => {
      emailSent = true;
      console.log(`✅ Email успешно отправлен на ${email}`);
      console.log(`   Message ID: ${mailInfo.messageId}`);
      console.log(`   Response: ${mailInfo.response || 'OK'}`);
      return mailInfo;
    }).catch((err) => {
      emailError = err;
      console.error(`❌ Ошибка отправки email на ${email}:`, err);
      console.error('Детали ошибки:', {
        message: err.message,
        code: err.code,
        command: err.command,
        response: err.response,
        responseCode: err.responseCode,
        stack: err.stack
      });
      
      // Дополнительная диагностика для Gmail
      if (err.responseCode === 535 || err.code === 'EAUTH') {
        console.error('⚠️  Проблема с аутентификацией Gmail:');
        console.error('   - Проверьте правильность App Password');
        console.error('   - Убедитесь, что 2FA включен на аккаунте');
        console.error('   - Убедитесь, что App Password создан правильно');
      }
      
      // Не пробрасываем ошибку дальше - код все равно вернем
      return null;
    });
    
    // Пытаемся дождаться отправки (но не блокируем ответ дольше 10 секунд)
    try {
      await Promise.race([
        sendEmailWithTimeout,
        new Promise((resolve) => setTimeout(resolve, 10000)) // Максимум 10 секунд ждем (было 5)
      ]);
    } catch (e) {
      // Игнорируем ошибку - код все равно вернем
      console.warn('⚠️ Не удалось дождаться результата отправки email, продолжаем...');
      console.warn('Причина:', e.message);
      
      // Если это таймаут SMTP, возможно Render блокирует порты
      if (e.message.includes('timeout') || e.message.includes('Connection timeout')) {
        console.error('❌ ВНИМАНИЕ: Render может блокировать исходящие SMTP соединения (порты 465, 587)!');
        console.error('💡 РЕШЕНИЕ: Используйте Resend API (бесплатно до 100 писем/день)');
        console.error('   1. Зарегистрируйтесь на https://resend.com');
        console.error('   2. Получите API ключ в разделе API Keys');
        console.error('   3. Добавьте RESEND_API_KEY в переменные окружения Render');
        console.error('   4. Resend API использует HTTPS (порт 443), который не блокируется Render');
      }
    }
    } // конец if (!emailSent)
    
    // Возвращаем ответ с кодом
    // ВСЕГДА возвращаем код в development поле для удобства тестирования
    let emailStatusMessage = 'Код также отправлен на email. Проверьте почту или используйте код ниже.';
    
    if (emailError) {
      emailStatusMessage = `Не удалось отправить email: ${emailError.message}. Используйте код ниже.`;
    } else if (!emailSent) {
      emailStatusMessage = 'Отправка email в процессе. Проверьте почту или используйте код ниже.';
    }
    
    const responseData = {
      success: true,
      message: 'Код подтверждения отправлен на ваш email',
      // Код ВСЕГДА возвращается для отображения на странице
      development: { 
        verificationCode: code,
        message: emailStatusMessage,
        emailSent: emailSent,
        emailError: emailError ? emailError.message : null
      }
    };
    
    console.log('📤 Отправка ответа клиенту:', JSON.stringify({
      success: responseData.success,
      message: responseData.message,
      hasDevelopment: !!responseData.development,
      hasCode: !!responseData.development.verificationCode,
      code: responseData.development.verificationCode
    }));
    
    res.json(responseData);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Подтверждение email и создание пользователя
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }
    
    // Проверяем код подтверждения
    const userData = await verifyEmailCode(email, code);
    
    // Создаем пользователя
    const user = await registerUser(userData.email, userData.password, userData.username);
    const token = generateToken(user);
    
    res.json({
      success: true,
      message: 'Email подтвержден. Регистрация завершена!',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        twoFactorEnabled: user.twoFactorEnabled
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Вход по email/пароль
router.post('/login', async (req, res) => {
  try {
    const { email, password, twoFactorToken } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await loginUser(email, password);
    
    // Проверяем, требуется ли 2FA
    const needs2FA = await require2FA(user.id);
    if (needs2FA) {
      if (!twoFactorToken) {
        return res.status(200).json({
          success: false,
          requires2FA: true,
          message: '2FA token required'
        });
      }
      
      const isValid2FA = await verify2FA(user.id, twoFactorToken);
      if (!isValid2FA) {
        return res.status(401).json({ error: 'Invalid 2FA token' });
      }
    }
    
    const token = generateToken(user);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        twoFactorEnabled: user.twoFactorEnabled
      }
    });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Magic Link - запрос
router.post('/magic-link', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const token = await createMagicLink(email);
    const magicLinkUrl = `${req.protocol}://${req.get('host')}/auth/verify-magic-link?token=${token}`;
    
    // Отправляем email с magic link
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: email,
        subject: 'Your Magic Link - ChatApp',
        html: `
          <h2>Your Magic Link</h2>
          <p>Click the link below to login:</p>
          <a href="${magicLinkUrl}">${magicLinkUrl}</a>
          <p>This link will expire in 15 minutes.</p>
        `
      });
    }
    
    res.json({
      success: true,
      message: 'Magic link sent to your email',
      // Для разработки возвращаем ссылку (в продакшене убрать!)
      development: process.env.NODE_ENV !== 'production' ? { magicLinkUrl } : undefined
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Magic Link - верификация
router.get('/verify-magic-link', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.redirect('/?error=invalid_token');
    }
    
    const user = await verifyMagicLink(token);
    const jwtToken = generateToken(user);
    
    // Редирект на фронтенд с токеном
    res.redirect(`/?token=${jwtToken}`);
  } catch (error) {
    res.redirect(`/?error=${encodeURIComponent(error.message)}`);
  }
});

// Включение 2FA
router.post('/2fa/enable', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    const { secret, qrCodeUrl } = await enable2FA(decoded.userId);
    
    res.json({
      success: true,
      secret,
      qrCodeUrl
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Верификация 2FA для включения
router.post('/2fa/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    const { twoFactorToken } = req.body;
    if (!twoFactorToken) {
      return res.status(400).json({ error: '2FA token is required' });
    }
    
    const isValid = await verify2FA(decoded.userId, twoFactorToken);
    
    if (isValid) {
      res.json({ success: true, message: '2FA enabled successfully' });
    } else {
      res.status(401).json({ error: 'Invalid 2FA token' });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// OAuth маршруты (только если настроены)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  router.get('/google/callback', 
    passport.authenticate('google', { session: false, failureRedirect: '/auth.html?error=oauth_failed' }), 
    (req, res) => {
      try {
        if (!req.user) {
          return res.redirect('/auth.html?error=no_user');
        }
        const token = generateToken(req.user);
        res.redirect(`/?token=${token}`);
      } catch (error) {
        console.error('Google OAuth callback error:', error);
        res.redirect('/auth.html?error=' + encodeURIComponent(error.message));
      }
    }
  );
} else {
  // Проброска для информативного сообщения
  router.get('/google', (req, res) => {
    res.status(503).json({ 
      error: 'Google OAuth не настроен',
      message: 'Для использования Google OAuth необходимо настроить переменные окружения GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в настройках сервера.',
      setupGuide: '/OAUTH_SETUP.md'
    });
  });
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  router.get('/github', (req, res, next) => {
    console.log('GitHub OAuth: Initiating authentication');
    passport.authenticate('github', { scope: ['user:email'] })(req, res, next);
  });
  
  router.get('/github/callback',
    (req, res, next) => {
      console.log('GitHub OAuth callback received');
      console.log('Query params:', req.query);
      passport.authenticate('github', { session: false }, (err, user, info) => {
        if (err) {
          console.error('GitHub OAuth authentication error:', err);
          console.error('Error details:', {
            message: err.message,
            stack: err.stack
          });
          return res.redirect('/auth.html?error=' + encodeURIComponent(err.message || 'GitHub authentication failed'));
        }
        
        if (!user) {
          console.error('GitHub OAuth: No user returned');
          console.error('Info:', info);
          let errorMsg = 'Failed to authenticate with GitHub';
          if (info?.message) {
            errorMsg = info.message;
          } else if (info?.error) {
            errorMsg = `GitHub authentication error: ${info.error}`;
          }
          return res.redirect('/auth.html?error=' + encodeURIComponent(errorMsg));
        }
        
        try {
          console.log('GitHub OAuth: User authenticated successfully:', user.id, user.email, user.username);
          const token = generateToken(user);
          console.log('GitHub OAuth: Token generated, redirecting to app');
          res.redirect(`/?token=${token}`);
        } catch (error) {
          console.error('GitHub OAuth callback processing error:', error);
          console.error('Error stack:', error.stack);
          res.redirect('/auth.html?error=' + encodeURIComponent(error.message || 'Failed to process authentication'));
        }
      })(req, res, next);
    }
  );
} else {
  router.get('/github', (req, res) => {
    res.status(503).json({ 
      error: 'GitHub OAuth не настроен',
      message: 'Для использования GitHub OAuth необходимо настроить переменные окружения GITHUB_CLIENT_ID и GITHUB_CLIENT_SECRET в настройках сервера.',
      setupGuide: '/OAUTH_SETUP.md'
    });
  });
}

if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));
  router.get('/facebook/callback',
    passport.authenticate('facebook', { session: false, failureRedirect: '/auth.html?error=oauth_failed' }),
    (req, res) => {
      try {
        if (!req.user) {
          return res.redirect('/auth.html?error=no_user');
        }
        const token = generateToken(req.user);
        res.redirect(`/?token=${token}`);
      } catch (error) {
        console.error('Facebook OAuth callback error:', error);
        res.redirect('/auth.html?error=' + encodeURIComponent(error.message));
      }
    }
  );
} else {
  router.get('/facebook', (req, res) => {
    res.status(503).json({ 

      error: 'Facebook OAuth не настроен',
      message: 'Для использования Facebook OAuth необходимо настроить переменные окружения FACEBOOK_APP_ID и FACEBOOK_APP_SECRET в настройках сервера.',
      setupGuide: '/OAUTH_SETUP.md'
    });
  });
}

// Проверка токена
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    const user = await getUserById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        twoFactorEnabled: user.twoFactorEnabled
      }
    });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

module.exports = router;


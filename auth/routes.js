const express = require('express');
const router = express.Router();
const passport = require('./passport-config');
const authModule = require('./auth');
const {
  loginUser,
  generateToken,
  verifyToken,
  createMagicLink,
  verifyMagicLink,
  enable2FA,
  verify2FA,
  require2FA,
  getUserById
} = authModule;

// Получаем readUsers из модуля для проверки существующих пользователей
const { readUsers } = authModule;
const nodemailer = require('nodemailer');
const https = require('https');

// Настройка nodemailer для отправки email (только для Magic Links)
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
  console.warn('SMTP используется только для Magic Links (если нужны)');
}

// Удалено: регистрация через email и телефон
// Теперь регистрация доступна только через OAuth (Google, GitHub)

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
  router.get('/google', (req, res, next) => {
    console.log('Google OAuth: Initiating authentication');
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
  });
  
  router.get('/google/callback',
    (req, res, next) => {
      console.log('Google OAuth callback received');
      console.log('Query params:', req.query);
      passport.authenticate('google', { session: false }, (err, user, info) => {
        if (err) {
          console.error('Google OAuth authentication error:', err);
          console.error('Error details:', {
            message: err.message,
            stack: err.stack
          });
          return res.redirect('/auth.html?error=' + encodeURIComponent(err.message || 'Google authentication failed'));
        }
        
        if (!user) {
          console.error('Google OAuth: No user returned');
          console.error('Info:', info);
          let errorMsg = 'Failed to authenticate with Google';
          if (info?.message) {
            errorMsg = info.message;
          } else if (info?.error) {
            errorMsg = `Google authentication error: ${info.error}`;
          }
          return res.redirect('/auth.html?error=' + encodeURIComponent(errorMsg));
        }
        
        try {
          console.log('Google OAuth: User authenticated successfully:', user.id, user.email, user.username);
          const token = generateToken(user);
          console.log('Google OAuth: Token generated, redirecting to app');
          res.redirect(`/?token=${token}`);
        } catch (error) {
          console.error('Google OAuth callback processing error:', error);
          console.error('Error stack:', error.stack);
          res.redirect('/auth.html?error=' + encodeURIComponent(error.message || 'Failed to process authentication'));
        }
      })(req, res, next);
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


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

// Настройка nodemailer для отправки email
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // для порта 465
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  // Дополнительные опции для лучшей совместимости
  tls: {
    rejectUnauthorized: false // для самоподписанных сертификатов
  },
  // Таймауты для предотвращения зависаний
  connectionTimeout: 10000, // 10 секунд на соединение
  greetingTimeout: 10000, // 10 секунд на приветствие
  socketTimeout: 30000 // 30 секунд общий таймаут
});

// Проверка соединения с SMTP при старте
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter.verify((error, success) => {
    if (error) {
      console.error('SMTP соединение не удалось:', error);
      console.error('Проверьте настройки SMTP в переменных окружения:');
      console.error('- SMTP_HOST:', process.env.SMTP_HOST || 'smtp.gmail.com');
      console.error('- SMTP_PORT:', process.env.SMTP_PORT || '587');
      console.error('- SMTP_USER:', process.env.SMTP_USER ? 'установлен' : 'НЕ УСТАНОВЛЕН');
      console.error('- SMTP_PASS:', process.env.SMTP_PASS ? 'установлен' : 'НЕ УСТАНОВЛЕН');
    } else {
      console.log('SMTP соединение успешно установлено');
      console.log('SMTP настроен для отправки email на:', process.env.SMTP_USER);
    }
  });
} else {
  console.warn('SMTP не настроен: SMTP_USER или SMTP_PASS отсутствуют');
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
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
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
    
    // Отправляем email с кодом (асинхронно, не блокируем ответ)
    const sendEmailPromise = transporter.sendMail({
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
    }).then((mailInfo) => {
      console.log(`Email успешно отправлен на ${email}:`, mailInfo.messageId);
    }).catch((emailError) => {
      console.error('Ошибка отправки email на', email, ':', emailError);
      console.error('Детали ошибки:', {
        message: emailError.message,
        code: emailError.code,
        command: emailError.command,
        response: emailError.response,
        responseCode: emailError.responseCode
      });
    });
    
    // Добавляем таймаут для отправки email (чтобы не ждать вечно)
    const emailTimeout = new Promise((resolve) => {
      setTimeout(() => {
        console.warn(`Отправка email на ${email} заняла слишком много времени`);
        resolve();
      }, 10000); // 10 секунд таймаут
    });
    
    // Ждем завершения отправки или таймаут (все равно возвращаем код)
    Promise.race([sendEmailPromise, emailTimeout]).catch(() => {
      console.error('Критическая ошибка при отправке email');
    });
    
    // Возвращаем ответ сразу с кодом (не ждем отправки email)
    res.json({
      success: true,
      message: 'Код подтверждения отправлен на ваш email',
      // Для разработки возвращаем код (в продакшене убрать!)
      development: process.env.NODE_ENV !== 'production' ? { verificationCode: code } : undefined
    });
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


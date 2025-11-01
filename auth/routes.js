const express = require('express');
const router = express.Router();
const passport = require('./passport-config');
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
  getUserById
} = require('./auth');
const nodemailer = require('nodemailer');

// Настройка nodemailer для отправки magic links
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

// Регистрация
router.post('/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const user = await registerUser(email, password, username);
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
  router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));
  router.get('/github/callback',
    passport.authenticate('github', { session: false, failureRedirect: '/auth.html?error=oauth_failed' }),
    (req, res) => {
      try {
        console.log('GitHub OAuth callback received, user:', req.user ? {
          id: req.user.id,
          username: req.user.username,
          email: req.user.email
        } : 'null');
        
        if (!req.user) {
          console.error('GitHub OAuth callback: req.user is null');
          return res.redirect('/auth.html?error=no_user');
        }
        
        const token = generateToken(req.user);
        console.log('GitHub OAuth successful, redirecting with token');
        res.redirect(`/?token=${token}`);
      } catch (error) {
        console.error('GitHub OAuth callback error:', {
          message: error.message,
          stack: error.stack,
          user: req.user ? { id: req.user.id } : 'null'
        });
        res.redirect('/auth.html?error=' + encodeURIComponent(error.message || 'oauth_failed'));
      }
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


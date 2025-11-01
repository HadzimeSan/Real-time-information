const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const USERS_FILE = path.join(__dirname, '../data/users.json');
const MAGIC_LINKS_FILE = path.join(__dirname, '../data/magic-links.json');

// Инициализация файлов данных
async function initDataFiles() {
  try {
    await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
    await fs.mkdir(path.dirname(MAGIC_LINKS_FILE), { recursive: true });
    
    try {
      await fs.access(USERS_FILE);
    } catch {
      await fs.writeFile(USERS_FILE, JSON.stringify([]));
    }
    
    try {
      await fs.access(MAGIC_LINKS_FILE);
    } catch {
      await fs.writeFile(MAGIC_LINKS_FILE, JSON.stringify([]));
    }
  } catch (error) {
    console.error('Error initializing data files:', error);
  }
}

initDataFiles();

// Чтение/запись пользователей
async function readUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeUsers(users) {
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

// Чтение/запись magic links
async function readMagicLinks() {
  try {
    const data = await fs.readFile(MAGIC_LINKS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeMagicLinks(links) {
  await fs.writeFile(MAGIC_LINKS_FILE, JSON.stringify(links, null, 2));
}

// Email/пароль аутентификация
async function registerUser(email, password, username) {
  const users = await readUsers();
  
  if (users.find(u => u.email === email)) {
    throw new Error('User with this email already exists');
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = {
    id: crypto.randomUUID(),
    email,
    username: username || email.split('@')[0],
    password: hashedPassword,
    authMethods: ['email'],
    twoFactorEnabled: false,
    twoFactorSecret: null,
    createdAt: new Date().toISOString(),
    lastLogin: null
  };
  
  users.push(user);
  await writeUsers(users);
  return user;
}

async function loginUser(email, password) {
  const users = await readUsers();
  const user = users.find(u => u.email === email);
  
  if (!user) {
    throw new Error('Invalid email or password');
  }
  
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }
  
  // Обновляем время последнего входа
  user.lastLogin = new Date().toISOString();
  await writeUsers(users);
  
  return user;
}

// JWT токены
function generateToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Magic Links
async function createMagicLink(email) {
  const users = await readUsers();
  const user = users.find(u => u.email === email);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 минут
  
  const links = await readMagicLinks();
  links.push({
    token,
    email,
    userId: user.id,
    expiresAt: expiresAt.toISOString(),
    used: false
  });
  await writeMagicLinks(links);
  
  return token;
}

async function verifyMagicLink(token) {
  const links = await readMagicLinks();
  const link = links.find(l => l.token === token && !l.used);
  
  if (!link) {
    throw new Error('Invalid or expired magic link');
  }
  
  if (new Date(link.expiresAt) < new Date()) {
    throw new Error('Magic link expired');
  }
  
  // Помечаем как использованный
  link.used = true;
  link.usedAt = new Date().toISOString();
  await writeMagicLinks(links);
  
  const users = await readUsers();
  const user = users.find(u => u.id === link.userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  user.lastLogin = new Date().toISOString();
  await writeUsers(users);
  
  return user;
}

// 2FA
async function enable2FA(userId) {
  const users = await readUsers();
  const user = users.find(u => u.id === userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const secret = speakeasy.generateSecret({
    name: `ChatApp (${user.email})`,
    length: 32
  });
  
  user.twoFactorEnabled = false; // Включается после верификации
  user.twoFactorSecret = secret.base32;
  await writeUsers(users);
  
  const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
  
  return {
    secret: secret.base32,
    qrCodeUrl
  };
}

async function verify2FA(userId, token) {
  const users = await readUsers();
  const user = users.find(u => u.id === userId);
  
  if (!user || !user.twoFactorSecret) {
    throw new Error('2FA not set up');
  }
  
  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token,
    window: 2
  });
  
  if (verified && !user.twoFactorEnabled) {
    // Первая успешная верификация - включаем 2FA
    user.twoFactorEnabled = true;
    await writeUsers(users);
  }
  
  return verified;
}

async function require2FA(userId) {
  const users = await readUsers();
  const user = users.find(u => u.id === userId);
  return user && user.twoFactorEnabled;
}

// Получение пользователя по ID
async function getUserById(userId) {
  const users = await readUsers();
  const user = users.find(u => u.id === userId);
  if (user) {
    // Удаляем пароль из объекта
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  return null;
}

// OAuth пользователи
async function findOrCreateOAuthUser(provider, profile) {
  const users = await readUsers();
  
  // Получаем email из профиля (разные провайдеры имеют разную структуру)
  let email = null;
  if (profile.emails && profile.emails[0]) {
    email = profile.emails[0].value || profile.emails[0];
  } else if (profile._json && profile._json.email) {
    email = profile._json.email;
  } else if (provider === 'github' && profile._json && profile._json.email) {
    email = profile._json.email;
  }
  
  // Если email не найден, пытаемся создать пользователя по OAuth ID
  const oauthId = profile.id || profile._json?.id;
  if (!email && !oauthId) {
    throw new Error('No email or OAuth ID provided by OAuth provider');
  }
  
  let user = null;
  
  // Ищем пользователя по email
  if (email) {
    user = users.find(u => u.email === email);
  }
  
  // Если не нашли по email, ищем по OAuth ID
  if (!user && oauthId) {
    user = users.find(u => u.oauthId === String(oauthId) && u.oauthProvider === provider);
  }
  
  // Получаем username из профиля
  const username = profile.displayName || profile.username || profile._json?.login || 
                   (email ? email.split('@')[0] : `user_${oauthId}`);
  
  if (!user) {
    // Создаем нового пользователя
    if (!email) {
      // Генерируем временный email если его нет
      email = `${username.toLowerCase().replace(/\s+/g, '_')}_${provider}@oauth.local`;
    }
    
    user = {
      id: crypto.randomUUID(),
      email,
      username: username,
      password: null,
      authMethods: [provider],
      oauthId: String(oauthId),
      oauthProvider: provider,
      avatar: (profile.photos && profile.photos[0] && profile.photos[0].value) || 
              (profile._json && profile._json.avatar_url),
      twoFactorEnabled: false,
      twoFactorSecret: null,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };
    users.push(user);
    console.log(`Created new OAuth user: ${user.id} (${provider})`);
  } else {
    // Обновляем информацию существующего пользователя
    if (!user.authMethods) {
      user.authMethods = [];
    }
    if (!user.authMethods.includes(provider)) {
      user.authMethods.push(provider);
    }
    user.oauthId = String(oauthId);
    user.oauthProvider = provider;
    if (profile.photos && profile.photos[0]) {
      user.avatar = profile.photos[0].value;
    } else if (profile._json && profile._json.avatar_url) {
      user.avatar = profile._json.avatar_url;
    }
    user.lastLogin = new Date().toISOString();
    console.log(`Updated OAuth user: ${user.id} (${provider})`);
  }
  
  await writeUsers(users);
  
  // Удаляем пароль из возвращаемого объекта
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

module.exports = {
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
  findOrCreateOAuthUser
};


require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');

// Инициализация модулей с обработкой ошибок
let passport, authRoutes, verifyToken, getUserById, loadRooms, saveRoomsDebounced, saveRoomsImmediate;

try {
  passport = require('./auth/passport-config');
  authRoutes = require('./auth/routes');
  const authModule = require('./auth/auth');
  verifyToken = authModule.verifyToken;
  getUserById = authModule.getUserById;
  const persistenceModule = require('./storage/persistence');
  loadRooms = persistenceModule.loadRooms;
  saveRoomsDebounced = persistenceModule.saveRoomsDebounced;
  saveRoomsImmediate = persistenceModule.saveRoomsImmediate;
  console.log('✅ All modules loaded successfully');
} catch (error) {
  console.error('❌ Error loading modules:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Настройка сессий для Passport
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Аутентификация маршруты
app.use('/auth', authRoutes);

// Создаем необходимые директории при старте
const uploadsDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');

try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory:', uploadsDir);
  }
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Created data directory:', dataDir);
  }
} catch (error) {
  console.error('Error creating directories:', error);
  // Не останавливаем сервер, но логируем ошибку
}

// Настройка Multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Убеждаемся, что директория существует перед сохранением
    if (!fs.existsSync(uploadsDir)) {
      try {
        fs.mkdirSync(uploadsDir, { recursive: true });
      } catch (err) {
        return cb(err);
      }
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Хранилище данных
const users = new Map(); // socketId -> user info
const typingUsers = new Map(); // roomId -> Set of typing users

// Загружаем комнаты из файла при старте
let rooms;
try {
  rooms = loadRooms();
  console.log('Rooms loaded successfully');
} catch (error) {
  console.error('Error loading rooms, starting with empty rooms:', error);
  rooms = new Map();
}

// Инициализация дефолтных комнат (только если их нет в сохраненных данных)
let needsSave = false;
if (!rooms.has('general')) {
  rooms.set('general', { users: new Set(), content: '', cursors: new Map(), messages: [] });
  needsSave = true;
}
if (!rooms.has('random')) {
  rooms.set('random', { users: new Set(), content: '', cursors: new Map(), messages: [] });
  needsSave = true;
}
if (!rooms.has('development')) {
  rooms.set('development', { users: new Set(), content: '', cursors: new Map(), messages: [] });
  needsSave = true;
}

// Сохраняем дефолтные комнаты асинхронно (не блокируя запуск сервера)
if (needsSave) {
  // Используем setImmediate чтобы не блокировать event loop
  setImmediate(() => {
    try {
      saveRoomsImmediate(rooms);
      console.log('Initialized default rooms and saved to disk');
    } catch (error) {
      console.error('Error saving default rooms:', error);
    }
  });
}

// Middleware для аутентификации Socket.io
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (token) {
      // Проверяем JWT токен
      const decoded = verifyToken(token);
      if (decoded) {
        const user = await getUserById(decoded.userId);
        if (user) {
          socket.userId = user.id;
          socket.username = user.username;
          socket.userEmail = user.email;
          socket.user = user;
          return next();
        }
      }
    }
    
    // Если токен не валиден, разрешаем анонимный доступ (для обратной совместимости)
    const username = socket.handshake.auth.username || `Guest_${Math.random().toString(36).substr(2, 9)}`;
    socket.username = username;
    socket.userId = uuidv4();
    socket.userEmail = null;
    socket.user = null;
    next();
  } catch (error) {
    console.error('Socket auth error:', error);
    // Разрешаем подключение как гость
    const username = socket.handshake.auth.username || `Guest_${Math.random().toString(36).substr(2, 9)}`;
    socket.username = username;
    socket.userId = uuidv4();
    next();
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.username} (${socket.userId})`);

  // Удаляем старые подключения этого пользователя (если есть)
  
  // Это предотвращает дублирование при переподключении
  users.forEach((user, socketId) => {
    if (user.id === socket.userId && socketId !== socket.id) {
      console.log(`Removing duplicate connection for user ${socket.userId}: old socket ${socketId}`);
      users.delete(socketId);
    }
  });

  // Добавляем пользователя в хранилище
  users.set(socket.id, {
    id: socket.userId,
    username: socket.username,
    status: 'online',
    currentRoom: null
  });

  // Отправляем userId клиенту
  socket.emit('user-connected', {
    userId: socket.userId,
    username: socket.username
  });

  // Отправляем список комнат новому пользователю
  socket.emit('rooms-list', Array.from(rooms.keys()));

  // Отправляем список онлайн пользователей
  broadcastOnlineUsers();

  // Присоединение к комнате
  socket.on('join-room', (roomId) => {
    console.log(`Socket ${socket.id} (${socket.username}) attempting to join room: ${roomId}`);
    console.log(`Current users map size: ${users.size}`);
    
    if (!roomId || typeof roomId !== 'string') {
      console.error('Invalid roomId:', roomId);
      return;
    }

    if (!rooms.has(roomId)) {
      console.log(`Creating new room: ${roomId}`);
      rooms.set(roomId, { users: new Set(), content: '', cursors: new Map(), messages: [] });
      // Сохраняем создание новой комнаты
      saveRoomsImmediate(rooms);
      // Уведомляем всех о новом списке комнат
      io.emit('rooms-list', Array.from(rooms.keys()));
    }

    const room = rooms.get(roomId);
    if (!room) {
      console.error(`Failed to get room ${roomId} after creation`);
      return;
    }

    let user = users.get(socket.id);
    
    // Если пользователь не найден, пытаемся его восстановить
    if (!user) {
      console.warn(`User not found for socket ${socket.id}, attempting to recreate...`);
      if (socket.userId && socket.username) {
        user = {
          id: socket.userId,
          username: socket.username,
          status: 'online',
          currentRoom: null
        };
        users.set(socket.id, user);
        console.log(`User recreated for socket ${socket.id}:`, user);
      } else {
        console.error('Cannot recreate user - missing socket.userId or socket.username');
        socket.emit('error', { message: 'User session expired. Please refresh the page.' });
        return;
      }
    }

    console.log(`User ${user.username} (${user.id}) current room before join: ${user.currentRoom}`);

    // Покидаем предыдущую комнату
    if (user.currentRoom && user.currentRoom !== roomId && rooms.has(user.currentRoom)) {
      console.log(`Leaving previous room: ${user.currentRoom}`);
      leaveRoom(socket, user.currentRoom);
    }

    // Присоединяемся к новой комнате
    socket.join(roomId);
    room.users.add(socket.id);
    user.currentRoom = roomId;

    console.log(`User ${user.username} joined room ${roomId}. Room has ${room.messages.length} messages`);

    // Отправляем историю чата и содержимое документа
    socket.emit('room-joined', {
      roomId,
      content: room.content,
      messages: room.messages.slice(-100), // Последние 100 сообщений
      cursors: Array.from(room.cursors.entries()).map(([userId, data]) => ({
        userId,
        ...data
      }))
    });

    // Уведомляем других пользователей
    socket.to(roomId).emit('user-joined', {
      userId: user.id,
      username: user.username
    });

    broadcastRoomUsers(roomId);
  });

  // Отправка сообщения
  socket.on('message', (data, callback) => {
    console.log(`Message received from socket ${socket.id}:`, data);
    console.log(`Current users map size: ${users.size}, socket ids: ${Array.from(users.keys()).join(', ')}`);
    
    const user = users.get(socket.id);
    if (!user) {
      console.error('User not found for socket:', socket.id);
      console.error('Available sockets:', Array.from(users.keys()));
      console.error('Attempting to recreate user entry...');
      
      // Пытаемся восстановить пользователя из socket данных
      if (socket.userId && socket.username) {
        users.set(socket.id, {
          id: socket.userId,
          username: socket.username,
          status: 'online',
          currentRoom: null
        });
        console.log('User recreated for socket:', socket.id);
        
        if (callback) callback({ error: 'User recreated, please join a room first and try again.' });
        return;
      }
      
      if (callback) callback({ error: 'User not found' });
      return;
    }
    
    console.log(`User ${user.username} (${user.id}) current room: ${user.currentRoom}`);
    
    if (!user.currentRoom) {
      console.error('User has no current room:', user.username);
      if (callback) callback({ error: 'No room selected. Please join a room first.' });
      return;
    }
    
    if (!data || !data.text || !data.text.trim()) {
      console.error('Empty message text');
      if (callback) callback({ error: 'Message text is required' });
      return;
    }

    const room = rooms.get(user.currentRoom);
    if (!room) {
      console.error('Room not found:', user.currentRoom);
      if (callback) callback({ error: 'Room not found' });
      return;
    }

    const message = {
      id: uuidv4(),
      userId: user.id,
      username: user.username,
      text: data.text.trim(),
      timestamp: new Date().toISOString(),
      roomId: user.currentRoom
    };

    // Сохраняем сообщение в историю комнаты
    room.messages.push(message);
    
    // Ограничиваем историю до последних 500 сообщений
    if (room.messages.length > 500) {
      room.messages = room.messages.slice(-500);
    }

    // Сохраняем изменения в файл
    saveRoomsDebounced(rooms);

    console.log(`Message sent by ${user.username} in ${user.currentRoom}:`, message.text.substring(0, 50));
    console.log(`Broadcasting to room ${user.currentRoom}, room has ${room.users.size} users`);
    
    // Отправляем сообщение всем в комнате
    io.to(user.currentRoom).emit('message', message);
    
    // Отправляем подтверждение отправителю
    if (callback) callback({ success: true });
  });

  // Typing indicator
  socket.on('typing-start', () => {
    const user = users.get(socket.id);
    if (!user || !user.currentRoom) return;

    const room = rooms.get(user.currentRoom);
    if (!room) return;

    if (!typingUsers.has(user.currentRoom)) {
      typingUsers.set(user.currentRoom, new Set());
    }
    typingUsers.get(user.currentRoom).add(user.id);

    socket.to(user.currentRoom).emit('user-typing', {
      userId: user.id,
      username: user.username
    });
  });

  socket.on('typing-stop', () => {
    const user = users.get(socket.id);
    if (!user || !user.currentRoom) return;

    const typingSet = typingUsers.get(user.currentRoom);
    if (typingSet) {
      typingSet.delete(user.id);
      socket.to(user.currentRoom).emit('user-stopped-typing', {
        userId: user.id
      });
    }
  });

  // Совместное редактирование текста
  socket.on('document-change', (data) => {
    const user = users.get(socket.id);
    if (!user || !user.currentRoom) return;

    const room = rooms.get(user.currentRoom);
    if (!room) return;

    // Применяем изменения (упрощенная версия)
    if (data.operation === 'insert') {
      const before = room.content.substring(0, data.position);
      const after = room.content.substring(data.position);
      room.content = before + data.text + after;
      
      // Корректируем позиции курсоров других пользователей
      updateCursorsForInsert(room, data.position, data.text.length);
    } else if (data.operation === 'delete') {
      const before = room.content.substring(0, data.position);
      const after = room.content.substring(data.position + data.length);
      room.content = before + after;
      
      // Корректируем позиции курсоров
      updateCursorsForDelete(room, data.position, data.length);
    }

    // Сохраняем изменения документа в файл
    saveRoomsDebounced(rooms);

    // Отправляем изменения другим пользователям
    socket.to(user.currentRoom).emit('document-updated', {
      operation: data.operation,
      position: data.position,
      text: data.text,
      length: data.length,
      userId: user.id
    });
  });

  // Обновление позиции курсора
  socket.on('cursor-update', (data) => {
    const user = users.get(socket.id);
    if (!user || !user.currentRoom) return;

    const room = rooms.get(user.currentRoom);
    if (!room) return;

    room.cursors.set(user.id, {
      position: data.position,
      username: user.username,
      color: data.color
    });

    socket.to(user.currentRoom).emit('cursor-updated', {
      userId: user.id,
      username: user.username,
      position: data.position,
      color: data.color
    });
  });

  // Загрузка файла
  socket.on('file-upload', (data) => {
    const user = users.get(socket.id);
    if (!user || !user.currentRoom) return;

    const room = rooms.get(user.currentRoom);
    if (!room) return;

    const fileMessage = {
      id: uuidv4(),
      userId: user.id,
      username: user.username,
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      fileSize: data.fileSize,
      fileType: data.fileType,
      timestamp: new Date().toISOString(),
      roomId: user.currentRoom,
      type: 'file'
    };

    // Сохраняем файловое сообщение в историю
    room.messages.push(fileMessage);
    if (room.messages.length > 500) {
      room.messages = room.messages.slice(-500);
    }

    // Сохраняем изменения в файл
    saveRoomsDebounced(rooms);

    io.to(user.currentRoom).emit('file-uploaded', fileMessage);
  });

  // Отключение
  socket.on('disconnect', (reason) => {
    console.log(`Socket ${socket.id} disconnected: ${reason}`);
    const user = users.get(socket.id);
    if (user && user.currentRoom) {
      leaveRoom(socket, user.currentRoom);
    }

    if (users.has(socket.id)) {
      users.delete(socket.id);
      console.log(`User ${socket.id} removed from users map`);
    } else {
      console.warn(`User ${socket.id} was already removed from users map`);
    }
    
    broadcastOnlineUsers();
    console.log(`User disconnected: ${socket.username || 'unknown'}`);
  });

  function leaveRoom(socket, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.users.delete(socket.id);
    room.cursors.delete(users.get(socket.id)?.id);
    
    socket.leave(roomId);
    socket.to(roomId).emit('user-left', {
      userId: users.get(socket.id)?.id,
      username: users.get(socket.id)?.username
    });

    broadcastRoomUsers(roomId);
  }

  function updateCursorsForInsert(room, position, length) {
    room.cursors.forEach((cursor, userId) => {
      if (cursor.position >= position) {
        cursor.position += length;
      }
    });
  }

  function updateCursorsForDelete(room, position, length) {
    room.cursors.forEach((cursor, userId) => {
      if (cursor.position > position + length) {
        cursor.position -= length;
      } else if (cursor.position > position) {
        cursor.position = position;
      }
    });
  }

  function broadcastRoomUsers(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const roomUsers = Array.from(room.users).map(socketId => {
      const user = users.get(socketId);
      return user ? { id: user.id, username: user.username } : null;
    }).filter(Boolean);

    io.to(roomId).emit('room-users-updated', roomUsers);
  }

  function broadcastOnlineUsers() {
    // Создаем Map для дедупликации пользователей по userId
    const uniqueUsers = new Map();
    
    // Проходим по всем пользователям и оставляем только уникальных по userId
    users.forEach((user, socketId) => {
      // Если пользователь с таким userId еще не добавлен, добавляем его
      // Если уже есть, заменяем на новый (последнее подключение)
      if (!uniqueUsers.has(user.id) || uniqueUsers.get(user.id).socketId !== socketId) {
        uniqueUsers.set(user.id, {
          id: user.id,
          username: user.username,
          status: user.status,
          socketId: socketId
        });
      }
    });

    // Преобразуем в массив для отправки
    const onlineUsers = Array.from(uniqueUsers.values()).map(user => ({
      id: user.id,
      username: user.username,
      status: user.status
    }));

    io.emit('online-users-updated', onlineUsers);
  }
});

// API endpoint для загрузки файлов
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  res.json({
    fileName: req.file.originalname,
    fileUrl: `/uploads/${req.file.filename}`,
    fileSize: req.file.size,
    fileType: req.file.mimetype
  });
});

// Проверка сервис-воркера для push-уведомлений
app.get('/sw.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

const PORT = process.env.PORT || 3000;

// Обработка ошибок при запуске сервера
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please use a different port.`);
  } else {
    console.error('Server error:', error);
  }
  process.exit(1);
});

// Запускаем сервер с обработкой ошибок
try {
  server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📁 Chat persistence enabled. Data will be saved to: data/rooms.json`);
    console.log(`📁 Uploads directory: ${uploadsDir}`);
  });
} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}

// Обработка необработанных исключений и отклоненных промисов
// Это предотвращает автоматическую перезагрузку сервера на Render
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);
  // НЕ завершаем процесс сразу, даем серверу шанс продолжить работу
  // Render автоматически перезапустит сервер, если он упадет
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // Логируем, но не завершаем процесс
});

// Graceful shutdown - сохраняем данные при завершении работы сервера
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server and saving data...');
  try {
    saveRoomsImmediate(rooms);
  } catch (error) {
    console.error('Error saving rooms on shutdown:', error);
  }
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server and saving data...');
  try {
    saveRoomsImmediate(rooms);
  } catch (error) {
    console.error('Error saving rooms on shutdown:', error);
  }
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Сохраняем данные периодически (каждые 5 минут) на случай неожиданного завершения
setInterval(() => {
  try {
    saveRoomsImmediate(rooms);
    console.log('Periodic save completed');
  } catch (error) {
    console.error('Error during periodic save:', error);
  }
}, 5 * 60 * 1000); // 5 минут


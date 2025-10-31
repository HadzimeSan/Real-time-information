const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

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

// Настройка Multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Хранилище данных
const users = new Map(); // socketId -> user info
const rooms = new Map(); // roomId -> { users: Set, content: string, cursors: Map, messages: Array }
const typingUsers = new Map(); // roomId -> Set of typing users

// Инициализация дефолтных комнат
rooms.set('general', { users: new Set(), content: '', cursors: new Map(), messages: [] });
rooms.set('random', { users: new Set(), content: '', cursors: new Map(), messages: [] });
rooms.set('development', { users: new Set(), content: '', cursors: new Map(), messages: [] });

// Middleware для аутентификации (упрощенная версия)
io.use((socket, next) => {
  const username = socket.handshake.auth.username || `User_${Math.random().toString(36).substr(2, 9)}`;
  socket.username = username;
  socket.userId = uuidv4();
  next();
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.username} (${socket.userId})`);

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
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: new Set(), content: '', cursors: new Map(), messages: [] });
    }

    const room = rooms.get(roomId);
    const user = users.get(socket.id);

    if (!user) {
      console.error('User not found for socket:', socket.id);
      return;
    }

    // Покидаем предыдущую комнату
    if (user.currentRoom && rooms.has(user.currentRoom)) {
      leaveRoom(socket, user.currentRoom);
    }

    // Присоединяемся к новой комнате
    socket.join(roomId);
    room.users.add(socket.id);
    user.currentRoom = roomId;

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
  socket.on('message', (data) => {
    const user = users.get(socket.id);
    if (!user) {
      console.error('User not found for socket:', socket.id);
      return;
    }
    if (!user.currentRoom) {
      console.error('User has no current room:', user.username);
      return;
    }
    if (!data || !data.text || !data.text.trim()) {
      console.error('Empty message text');
      return;
    }

    const room = rooms.get(user.currentRoom);
    if (!room) {
      console.error('Room not found:', user.currentRoom);
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

    console.log(`Message sent by ${user.username} in ${user.currentRoom}:`, message.text.substring(0, 50));
    
    // Отправляем сообщение всем в комнате
    io.to(user.currentRoom).emit('message', message);
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

    io.to(user.currentRoom).emit('file-uploaded', fileMessage);
  });

  // Отключение
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user && user.currentRoom) {
      leaveRoom(socket, user.currentRoom);
    }

    users.delete(socket.id);
    broadcastOnlineUsers();
    console.log(`User disconnected: ${socket.username}`);
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
    const onlineUsers = Array.from(users.values()).map(user => ({
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
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


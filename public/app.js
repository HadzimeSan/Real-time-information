// Инициализация Socket.io
// Используем SERVER_URL из config.js, если он доступен, иначе текущий хост
const serverUrl = typeof SERVER_URL !== 'undefined' ? SERVER_URL : window.location.origin;

// Получаем токен из localStorage или запрашиваем аутентификацию
const authToken = localStorage.getItem('authToken');

if (!authToken) {
    // Если нет токена, перенаправляем на страницу входа
    window.location.href = '/auth.html';
}

const socket = io(serverUrl, {
    auth: {
        token: authToken
    }
});

// Глобальные переменные
let currentRoom = null;
let currentUserId = null;
let isEditorOpen = false;
let typingTimeout = null;
const cursors = new Map();
let userColor = generateUserColor();

// DOM элементы
const roomsList = document.getElementById('roomsList');
const onlineUsersList = document.getElementById('onlineUsersList');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const currentRoomName = document.getElementById('currentRoomName');
const typingIndicator = document.getElementById('typingIndicator');
const usernameEl = document.getElementById('username');
const onlineCount = document.getElementById('onlineCount');
const roomUsers = document.getElementById('roomUsers');
const collaborativeEditor = document.getElementById('collaborativeEditor');
const sharedDocument = document.getElementById('sharedDocument');
const toggleEditorBtn = document.getElementById('toggleEditorBtn');
const closeEditorBtn = document.getElementById('closeEditorBtn');
const cursorsLayer = document.getElementById('cursorsLayer');
const uploadFileBtn = document.getElementById('uploadFileBtn');
const fileInput = document.getElementById('fileInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const createRoomModal = document.getElementById('createRoomModal');
const createRoomConfirmBtn = document.getElementById('createRoomConfirmBtn');
const cancelRoomBtn = document.getElementById('cancelRoomBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const newRoomName = document.getElementById('newRoomName');

// Инициализация
socket.on('connect', () => {
    console.log('Connected to server');
    if (socket.user && socket.user.username) {
        usernameEl.textContent = socket.user.username;
    } else {
        usernameEl.textContent = socket.username || 'Guest';
    }
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    if (error.message === 'Unauthorized') {
        localStorage.removeItem('authToken');
        window.location.href = '/auth.html';
    }
});

socket.on('user-connected', (data) => {
    currentUserId = data.userId;
    usernameEl.textContent = data.username;
    console.log('User connected:', data);
});

// Обработка ошибок подключения
socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    alert('Ошибка подключения к серверу. Проверьте URL сервера в config.js');
});

socket.on('disconnect', (reason) => {
    console.warn('Disconnected:', reason);
    if (reason === 'io server disconnect') {
        // Сервер принудительно отключил, нужно переподключиться вручную
        socket.connect();
    }
});

socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
    // Переприсоединяемся к комнате если была выбрана
    if (currentRoom) {
        socket.emit('join-room', currentRoom);
    }
});

// Получение списка комнат
socket.on('rooms-list', (rooms) => {
    rooms.forEach(room => {
        addRoomToList(room);
    });
});

// Присоединение к комнате
socket.on('room-joined', (data) => {
    currentRoom = data.roomId;
    currentRoomName.textContent = `# ${data.roomId}`;
    
    // Очищаем старые сообщения
    chatMessages.innerHTML = '';
    
    // Загружаем историю сообщений из сервера
    if (data.messages && Array.isArray(data.messages)) {
        console.log(`Loading ${data.messages.length} messages from server for room ${data.roomId}`);
        data.messages.forEach(message => {
            if (message.type === 'file') {
                addFileMessage(message, false);
            } else {
                addMessage(message, false); // false = не прокручивать до конца сразу
            }
        });
        // Прокручиваем в конец после загрузки всех сообщений
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 100);
        
        // Сохраняем историю в localStorage
        saveMessagesToLocalStorage(data.roomId, data.messages);
    }
    
    // Загружаем содержимое документа
    if (data.content) {
        sharedDocument.value = data.content;
        lastValue = data.content; // Синхронизируем lastValue
    }
    
    // Отображаем курсоры других пользователей
    if (data.cursors) {
        data.cursors.forEach(cursor => {
            if (cursor.userId !== currentUserId) {
                addCursor(cursor.userId, cursor.username, cursor.position, cursor.color);
            }
        });
    }
    
    // Активируем выбранную комнату
    document.querySelectorAll('.room-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.roomId === currentRoom) {
            item.classList.add('active');
        }
    });
});

// Обработка сообщений
socket.on('message', (message) => {
    console.log('Received message:', message);
    addMessage(message);
    
    // Сохраняем сообщение в localStorage
    if (currentRoom) {
        const messages = getMessagesFromLocalStorage(currentRoom) || [];
        messages.push(message);
        // Ограничиваем до 100 сообщений в localStorage
        if (messages.length > 100) {
            messages.splice(0, messages.length - 100);
        }
        saveMessagesToLocalStorage(currentRoom, messages);
    }
});

// Typing indicators
socket.on('user-typing', (data) => {
    showTypingIndicator(data.username);
});

socket.on('user-stopped-typing', (data) => {
    hideTypingIndicator();
});

// Обновление документа
socket.on('document-updated', (data) => {
    if (data.userId === currentUserId) return;
    
    const textarea = sharedDocument;
    const cursorPos = textarea.selectionStart;
    
    if (data.operation === 'insert') {
        const before = textarea.value.substring(0, data.position);
        const after = textarea.value.substring(data.position);
        textarea.value = before + data.text + after;
        
        // Корректируем позицию курсора
        if (cursorPos >= data.position) {
            setTimeout(() => {
                textarea.setSelectionRange(cursorPos + data.text.length, cursorPos + data.text.length);
            }, 0);
        }
    } else if (data.operation === 'delete') {
        const before = textarea.value.substring(0, data.position);
        const after = textarea.value.substring(data.position + data.length);
        textarea.value = before + after;
        
        // Корректируем позицию курсора
        if (cursorPos > data.position + data.length) {
            setTimeout(() => {
                textarea.setSelectionRange(cursorPos - data.length, cursorPos - data.length);
            }, 0);
        } else if (cursorPos > data.position) {
            setTimeout(() => {
                textarea.setSelectionRange(data.position, data.position);
            }, 0);
        }
    }
    
    // Обновляем курсоры и синхронизируем lastValue
    lastValue = textarea.value;
    updateCursorPositions();
});

socket.on('cursor-updated', (data) => {
    if (data.userId !== currentUserId) {
        addCursor(data.userId, data.username, data.position, data.color);
    }
});

// Файлы
socket.on('file-uploaded', (fileMessage) => {
    console.log('Received file message:', fileMessage);
    addFileMessage(fileMessage);
    
    // Сохраняем файловое сообщение в localStorage
    if (currentRoom) {
        const messages = getMessagesFromLocalStorage(currentRoom) || [];
        messages.push(fileMessage);
        if (messages.length > 100) {
            messages.splice(0, messages.length - 100);
        }
        saveMessagesToLocalStorage(currentRoom, messages);
    }
});

// Онлайн пользователи
socket.on('online-users-updated', (users) => {
    onlineCount.textContent = users.length;
    updateOnlineUsersList(users);
});

socket.on('room-users-updated', (users) => {
    updateRoomUsers(users);
});

socket.on('user-joined', (data) => {
    console.log(`${data.username} присоединился к комнате`);
});

socket.on('user-left', (data) => {
    console.log(`${data.username} покинул комнату`);
    removeCursor(data.userId);
});

// События UI

// Отправка сообщения
sendButton.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

messageInput.addEventListener('input', () => {
    if (!currentRoom) return;
    
    socket.emit('typing-start');
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing-stop');
    }, 1000);
});

// Переключение редактора
toggleEditorBtn.addEventListener('click', () => {
    isEditorOpen = !isEditorOpen;
    collaborativeEditor.style.display = isEditorOpen ? 'flex' : 'none';
    chatMessages.style.display = isEditorOpen ? 'none' : 'flex';
    toggleEditorBtn.classList.toggle('active', isEditorOpen);
    
    if (isEditorOpen && !currentRoom) {
        alert('Выберите канал для совместного редактирования');
        isEditorOpen = false;
        collaborativeEditor.style.display = 'none';
        chatMessages.style.display = 'flex';
        toggleEditorBtn.classList.remove('active');
    }
});

closeEditorBtn.addEventListener('click', () => {
    isEditorOpen = false;
    collaborativeEditor.style.display = 'none';
    chatMessages.style.display = 'flex';
    toggleEditorBtn.classList.remove('active');
});

// Совместное редактирование
let lastValue = '';
sharedDocument.addEventListener('input', (e) => {
    if (!currentRoom || !isEditorOpen) return;
    
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    // Определяем тип изменения
    if (newValue.length > lastValue.length) {
        // Вставка
        const inserted = newValue.substring(lastValue.length);
        const position = cursorPos - inserted.length;
        
        socket.emit('document-change', {
            operation: 'insert',
            position: position,
            text: inserted
        });
    } else if (newValue.length < lastValue.length) {
        // Удаление
        const deleted = lastValue.substring(cursorPos, lastValue.length - newValue.length + cursorPos);
        
        socket.emit('document-change', {
            operation: 'delete',
            position: cursorPos,
            length: deleted.length
        });
    }
    
    lastValue = newValue;
    
    // Обновляем позицию курсора
    updateOwnCursor(cursorPos);
});

sharedDocument.addEventListener('selectionchange', () => {
    if (sharedDocument === document.activeElement) {
        updateOwnCursor(sharedDocument.selectionStart);
    }
});

// Загрузка файлов
uploadFileBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
        await uploadFile(file);
    }
    fileInput.value = '';
});

// Drag & Drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    document.addEventListener(eventName, () => {
        document.body.classList.add('drag-over');
    });
});

['dragleave', 'drop'].forEach(eventName => {
    document.addEventListener(eventName, () => {
        document.body.classList.remove('drag-over');
    });
});

document.addEventListener('drop', async (e) => {
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
        await uploadFile(file);
    }
});

// Создание комнаты
createRoomBtn.addEventListener('click', () => {
    createRoomModal.classList.add('active');
    newRoomName.value = '';
    newRoomName.focus();
});

createRoomConfirmBtn.addEventListener('click', () => {
    const roomName = newRoomName.value.trim();
    if (roomName) {
        socket.emit('join-room', roomName);
        addRoomToList(roomName);
        createRoomModal.classList.remove('active');
    }
});

cancelRoomBtn.addEventListener('click', () => {
    createRoomModal.classList.remove('active');
});

closeModalBtn.addEventListener('click', () => {
    createRoomModal.classList.remove('active');
});

// Вспомогательные функции

function addRoomToList(roomId) {
    if (document.querySelector(`[data-room-id="${roomId}"]`)) return;
    
    const li = document.createElement('li');
    li.className = 'room-item';
    li.dataset.roomId = roomId;
    li.textContent = `# ${roomId}`;
    li.addEventListener('click', () => {
        socket.emit('join-room', roomId);
    });
    roomsList.appendChild(li);
}

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) {
        console.warn('Attempted to send empty message');
        return;
    }
    if (!currentRoom) {
        console.error('No room selected');
        alert('Выберите канал для отправки сообщения');
        return;
    }
    
    console.log('Sending message:', { text, room: currentRoom });
    socket.emit('message', { text }, (response) => {
        if (response && response.error) {
            console.error('Error sending message:', response.error);
            alert('Ошибка отправки сообщения: ' + response.error);
        } else {
            console.log('Message sent successfully');
        }
    });
    messageInput.value = '';
    socket.emit('typing-stop');
}

function addMessage(message, scroll = true) {
    // Проверяем, не добавлено ли сообщение уже
    const existingMessage = document.querySelector(`[data-message-id="${message.id}"]`);
    if (existingMessage) {
        console.log('Message already exists:', message.id);
        return;
    }
    
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    messageEl.dataset.messageId = message.id;
    
    if (message.userId === currentUserId) {
        messageEl.classList.add('own');
    }
    
    const header = document.createElement('div');
    header.className = 'message-header';
    header.innerHTML = `
        <span>${escapeHtml(message.username)}</span>
        <span class="message-time">${formatTime(message.timestamp)}</span>
    `;
    
    const textEl = document.createElement('div');
    textEl.className = 'message-text';
    textEl.textContent = message.text;
    
    messageEl.appendChild(header);
    messageEl.appendChild(textEl);
    
    chatMessages.appendChild(messageEl);
    if (scroll) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function addFileMessage(fileMessage, scroll = true) {
    // Проверяем, не добавлено ли сообщение уже
    const existingMessage = document.querySelector(`[data-message-id="${fileMessage.id}"]`);
    if (existingMessage) {
        console.log('File message already exists:', fileMessage.id);
        return;
    }
    
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    messageEl.dataset.messageId = fileMessage.id;
    
    if (fileMessage.userId === currentUserId) {
        messageEl.classList.add('own');
    }
    
    const header = document.createElement('div');
    header.className = 'message-header';
    header.innerHTML = `
        <span>${escapeHtml(fileMessage.username)}</span>
        <span class="message-time">${formatTime(fileMessage.timestamp)}</span>
    `;
    
    const fileEl = document.createElement('div');
    fileEl.className = 'message-file';
    fileEl.innerHTML = `
        <span>📎</span>
        <a href="${fileMessage.fileUrl}" target="_blank">${escapeHtml(fileMessage.fileName)}</a>
        <span>(${formatFileSize(fileMessage.fileSize)})</span>
    `;
    
    messageEl.appendChild(header);
    messageEl.appendChild(fileEl);
    
    chatMessages.appendChild(messageEl);
    if (scroll) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

async function uploadFile(file) {
    if (!currentRoom) {
        alert('Выберите канал для загрузки файла');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const uploadUrl = `${serverUrl}/api/upload`;
        
        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        socket.emit('file-upload', {
            fileName: data.fileName,
            fileUrl: data.fileUrl,
            fileSize: data.fileSize,
            fileType: data.fileType
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        alert('Ошибка при загрузке файла');
    }
}

function showTypingIndicator(username) {
    typingIndicator.textContent = `${username} печатает...`;
    typingIndicator.style.display = 'block';
}

function hideTypingIndicator() {
    typingIndicator.style.display = 'none';
}

function updateOnlineUsersList(users) {
    onlineUsersList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.className = 'user-item';
        li.innerHTML = `
            <div class="status-indicator ${user.status}"></div>
            <span>${escapeHtml(user.username)}</span>
        `;
        onlineUsersList.appendChild(li);
    });
}

function updateRoomUsers(users) {
    roomUsers.innerHTML = '';
    users.forEach(user => {
        const badge = document.createElement('div');
        badge.className = 'user-badge';
        badge.innerHTML = `
            <div class="status-indicator online"></div>
            <span>${escapeHtml(user.username)}</span>
        `;
        roomUsers.appendChild(badge);
    });
}

function updateOwnCursor(position) {
    if (!currentRoom) return;
    
    socket.emit('cursor-update', {
        position: position,
        color: userColor
    });
    
    updateCursorDisplay();
}

function addCursor(userId, username, position, color) {
    cursors.set(userId, { username, position, color });
    updateCursorDisplay();
}

function removeCursor(userId) {
    cursors.delete(userId);
    updateCursorDisplay();
}

function updateCursorDisplay() {
    cursorsLayer.innerHTML = '';
    
    if (!isEditorOpen || sharedDocument !== document.activeElement) return;
    
    const ownPosition = sharedDocument.selectionStart;
    
    // Отображаем курсоры других пользователей
    cursors.forEach((cursor, userId) => {
        if (userId === currentUserId) return;
        
        const cursorEl = document.createElement('div');
        cursorEl.className = 'cursor';
        cursorEl.style.backgroundColor = cursor.color;
        
        const labelEl = document.createElement('div');
        labelEl.className = 'cursor-label';
        labelEl.textContent = cursor.username;
        labelEl.style.backgroundColor = cursor.color;
        
        // Вычисляем позицию курсора (упрощенно)
        const textBefore = sharedDocument.value.substring(0, cursor.position);
        const lines = textBefore.split('\n');
        const lineNumber = lines.length - 1;
        const colNumber = lines[lines.length - 1].length;
        
        // Это упрощенная версия - для точного отображения нужен более сложный расчет
        cursorEl.style.left = `${colNumber * 8}px`;
        cursorEl.style.top = `${lineNumber * 24}px`;
        labelEl.style.left = `${colNumber * 8}px`;
        
        cursorEl.appendChild(labelEl);
        cursorsLayer.appendChild(cursorEl);
    });
}

function updateCursorPositions() {
    // Обновление позиций курсоров после изменений документа
    setTimeout(updateCursorDisplay, 0);
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function generateUserColor() {
    const colors = ['#4a90e2', '#50c878', '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Функции для работы с localStorage
function saveMessagesToLocalStorage(roomId, messages) {
    try {
        const key = `chat_history_${roomId}`;
        localStorage.setItem(key, JSON.stringify(messages));
    } catch (e) {
        console.warn('Failed to save messages to localStorage:', e);
    }
}

function getMessagesFromLocalStorage(roomId) {
    try {
        const key = `chat_history_${roomId}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.warn('Failed to get messages from localStorage:', e);
        return null;
    }
}

// Загружаем историю из localStorage при присоединении к комнате (как бэкап)
function loadMessagesFromLocalStorage(roomId) {
    const messages = getMessagesFromLocalStorage(roomId);
    if (messages && messages.length > 0) {
        console.log(`Loading ${messages.length} messages from localStorage for room ${roomId}`);
        messages.forEach(message => {
            addMessage(message, false);
        });
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 100);
    }
}

// Кнопка выхода

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        if (confirm('Вы уверены, что хотите выйти?')) {
            localStorage.removeItem('authToken');
            socket.disconnect();
            window.location.href = '/auth.html';
        }
    });
}

// Регистрация Service Worker для push-уведомлений
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(registration => {
            console.log('Service Worker registered:', registration);
            
            // Запрос разрешения на уведомления
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
        })
        .catch(error => {
            console.error('Service Worker registration failed:', error);
        });
}

// Обработка push-уведомлений
socket.on('message', (message) => {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(`Новое сообщение от ${message.username}`, {
            body: message.text,
            icon: '/icon.svg',
            tag: message.id
        });
    }
});


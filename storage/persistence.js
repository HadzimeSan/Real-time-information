const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

// Убеждаемся, что директория data существует
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('Created data directory:', DATA_DIR);
}

/**
 * Сохраняет данные комнат в JSON файл
 * @param {Map} rooms - Map с данными комнат
 */
function saveRooms(rooms) {
  try {
    const roomsData = {};
    
    // Конвертируем Map в объект для сохранения
    rooms.forEach((roomData, roomId) => {
      roomsData[roomId] = {
        // Сохраняем users как массив socketIds (они все равно временные)
        users: Array.from(roomData.users),
        content: roomData.content || '',
        // Сохраняем cursors как объект (userId -> cursor data)
        cursors: Object.fromEntries(roomData.cursors),
        // Сохраняем все сообщения
        messages: roomData.messages || []
      };
    });
    
    // Сохраняем с красивым форматированием
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(roomsData, null, 2), 'utf8');
    console.log(`Saved ${rooms.size} rooms to ${ROOMS_FILE}`);
  } catch (error) {
    console.error('Error saving rooms:', error);
  }
}

/**
 * Загружает данные комнат из JSON файла
 * @returns {Map} Map с данными комнат
 */
function loadRooms() {
  try {
    if (!fs.existsSync(ROOMS_FILE)) {
      console.log('Rooms file does not exist, starting with empty rooms');
      return new Map();
    }
    
    const fileContent = fs.readFileSync(ROOMS_FILE, 'utf8');
    const roomsData = JSON.parse(fileContent);
    
    const rooms = new Map();
    
    // Конвертируем объект обратно в Map
    Object.keys(roomsData).forEach(roomId => {
      const data = roomsData[roomId];
      rooms.set(roomId, {
        // Восстанавливаем Set для users
        users: new Set(data.users || []),
        content: data.content || '',
        // Восстанавливаем Map для cursors
        cursors: new Map(Object.entries(data.cursors || {})),
        // Восстанавливаем массив сообщений
        messages: data.messages || []
      });
    });
    
    console.log(`Loaded ${rooms.size} rooms from ${ROOMS_FILE}`);
    return rooms;
  } catch (error) {
    console.error('Error loading rooms:', error);
    // В случае ошибки возвращаем пустую Map
    return new Map();
  }
}

/**
 * Дебаунс функция для сохранения (чтобы не сохранять на каждое изменение)
 */
let saveTimeout = null;
function saveRoomsDebounced(rooms, delay = 2000) {
  // Отменяем предыдущий таймер
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  // Устанавливаем новый таймер
  saveTimeout = setTimeout(() => {
    saveRooms(rooms);
    saveTimeout = null;
  }, delay);
}

/**
 * Принудительное сохранение (без задержки)
 */
function saveRoomsImmediate(rooms) {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  saveRooms(rooms);
}

module.exports = {
  saveRooms,
  loadRooms,
  saveRoomsDebounced,
  saveRoomsImmediate,
  DATA_DIR,
  ROOMS_FILE
};


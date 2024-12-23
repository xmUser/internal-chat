const data = {
  // 房间配置
  config: {
    maxUsers: 10,  // 默认最大在线人数
  },
  // 存储用户数据
  rooms: {}
};

/*
  A类地址：10.0.0.0–10.255.255.255
  B类地址：172.16.0.0–172.31.255.255 
  C类地址：192.168.0.0–192.168.255.255
*/
function internalNet(ip) {
  if (ip.startsWith('10.')) {
    return true;
  }
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1]);
    if (second >= 16 && second <= 31) {
      return true;
    }
  }
  if (ip.startsWith('192.168.')) {
    return true;
  }
  return false;
}

function getKey(ip) {
  const isInternalNet = internalNet(ip);
  return isInternalNet ? 'internal' : ip;
}

// 添加设置最大在线人数的方法
function setMaxUsers(max) {
  data.config.maxUsers = max;
}

// 获取当前房间人数
function getRoomSize(ip) {
  const key = getKey(ip);
  return data.rooms[key] ? data.rooms[key].length : 0;
}

// 修改注册用户方法
function registerUser(ip, socket) {
  const key = getKey(ip);
  if (!data.rooms[key]) {
    data.rooms[key] = [];
  }

  // 检查房间人数是否已满
  if (data.rooms[key].length >= data.config.maxUsers) {
    throw new Error('房间人数已满');
  }

  // 生成唯一ID
  let id;
  do {
    id = `${Math.floor(Math.random() * 1000000).toString().substring(3,5).padStart(2, '0')}${(new Date()).getMilliseconds().toString().padStart(3, '0')}`;
  } while (data.rooms[key].find(user => user.id === id));

  data.rooms[key].push({ id, socket, targets: {} });
  return id;
}

// 修改注销用户方法
function unregisterUser(ip, id) {
  const key = getKey(ip);
  const room = data.rooms[key];
  if (room) {
    const index = room.findIndex(user => user.id === id);
    if (index !== -1) {
      const removedUser = room.splice(index, 1)[0];
      // 关闭socket连接
      if (removedUser.socket.readyState === 1) { // 1 = OPEN
        removedUser.socket.close();
      }
      return true;
    }
  }
  return false;
}

// 获取房间用户列表
function getUserList(ip) {
  const key = getKey(ip);
  return data.rooms[key] || [];
}

function getUser(ip, uid) {
  const key = getKey(ip);
  const room = data.rooms[key];
  return room.find(user => user.id === uid);
}

// 清理断开连接的用户
function cleanupRoom(ip) {
  const key = getKey(ip);
  const room = data.rooms[key];
  if (room) {
    const initialSize = room.length;
    data.rooms[key] = room.filter(user => {
      if (user.socket.readyState === 3) { // 3 = CLOSED
        console.log(`Removing disconnected user ${user.id}`);
        return false;
      }
      return true;
    });
    if (initialSize !== data.rooms[key].length) {
      console.log(`Cleaned up ${initialSize - data.rooms[key].length} disconnected users`);
      return true;
    }
  }
  return false;
}

module.exports = {
  registerUser,
  unregisterUser,
  getUserList,
  getUser,
  getRoomSize,
  cleanupRoom,
  config: data.config
};
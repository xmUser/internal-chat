const WebSocket = require('ws');
const service = require('./data');

const PORT = 8081;
const server = new WebSocket.Server({ 
  port: PORT,
  // 允许来自任何IP的连接
  host: '0.0.0.0'  
});

const SEND_TYPE_REG = '1001'; // 注册后发送用户id
const SEND_TYPE_ROOM_INFO = '1002'; // 发送房间信息
const SEND_TYPE_JOINED_ROOM = '1003'; // 加入房间后的通知，比如对于新进用户，Ta需要开始连接其他人
const SEND_TYPE_NEW_CANDIDATE = '1004'; // offer
const SEND_TYPE_NEW_CONNECTION = '1005'; // new connection
const SEND_TYPE_CONNECTED = '1006'; // new connection
const SEND_TYPE_ROOM_FULL = '1007';  // 房间已满
const SEND_TYPE_ROOM_INFO_UPDATE = '1008';  // 房间信息更新

const RECEIVE_TYPE_NEW_CANDIDATE = '9001'; // offer
const RECEIVE_TYPE_NEW_CONNECTION = '9002'; // new connection
const RECEIVE_TYPE_CONNECTED = '9003'; // joined
const RECEIVE_TYPE_KEEPALIVE = '9999'; // keep-alive


console.log(`Signaling server running on ws://0.0.0.0:${PORT}`);

// 添加定期清理功能
const CLEANUP_INTERVAL = 10000; // 10秒

setInterval(() => {
  server.clients.forEach(socket => {
    try {
      const ip = socket._socket.remoteAddress.split("::ffff:").join("");
      if (service.cleanupRoom(ip)) {
        // 如果有用户被清理，广播更新后的房间信息
        service.getUserList(ip).forEach(user => {
          socketSend_RoomInfo(user.socket, ip);
          send(user.socket, SEND_TYPE_ROOM_INFO_UPDATE, {
            current: service.getRoomSize(ip),
            max: service.config.maxUsers
          });
        });
      }
    } catch (err) {
      console.error('Error during cleanup:', err);
    }
  });
}, CLEANUP_INTERVAL);

server.on('connection', (socket, request) => {
  const ip = request.headers['x-forwarded-for'] ?? 
             request.headers['x-real-ip'] ?? 
             socket._socket.remoteAddress.split("::ffff:").join("");
             
  console.log(`New connection from ${ip}`);
  
  try {
    // 先清理断开的连接
    service.cleanupRoom(ip);
    
    // 检查房间是否已满
    if (service.getRoomSize(ip) >= service.config.maxUsers) {
      send(socket, SEND_TYPE_ROOM_FULL, { 
        message: '房间人数已满',
        current: service.getRoomSize(ip),
        max: service.config.maxUsers
      });
      socket.close();
      return;
    }

    // 监控连接状态
    socket.isAlive = true;
    socket.on('pong', () => {
      socket.isAlive = true;
    });
    
    // 处理心跳消息
    socket.on('message', (msg) => {
      try {
        const message = JSON.parse(msg);
        if (message.type === '9999') {
          socket.isAlive = true;
          socket.send(JSON.stringify({type: '9999'})); // 回应心跳
        }
      } catch (e) {
        console.error('Invalid message format:', e);
      }
    });
    
    const currentId = service.registerUser(ip, socket);
    // 向客户端发送自己的id
    socketSend_UserId(socket, currentId);
    
    console.log('A client connected.');
    
    // 向所有用户广播房间信息
    service.getUserList(ip).forEach(user => {
      socketSend_RoomInfo(user.socket, ip);
    });

    socketSend_JoinedRoom(socket, currentId);
    

    socket.on('message', (msg, isBinary) => {
      const msgStr = msg.toString();
      if (!msgStr || msgStr.length > 1024 * 10) {
        return;
      }
      let message = null;
      try {
        message = JSON.parse(msgStr);
      } catch (e) {
        console.error('Invalid JSON', msgStr);
        message = null;
      }

      const { uid, targetId, type, data } = message;
      if (!type || !uid || !targetId) {
        return null;
      }
      const me = service.getUser(ip, uid)
      const target = service.getUser(ip, targetId)
      if (!me || !target) {
        return;
      }

      if (type === RECEIVE_TYPE_NEW_CANDIDATE) {
        socketSend_Candidate(target.socket, { targetId: uid, candidate: data.candidate });
        return;
      }
      if (type === RECEIVE_TYPE_NEW_CONNECTION) {
        socketSend_ConnectInvite(target.socket, { targetId: uid, offer: data.targetAddr });
        return;
      }
      if (type === RECEIVE_TYPE_CONNECTED) {
        socketSend_Connected(target.socket, { targetId: uid, answer: data.targetAddr });
        return;
      }
      if (type === RECEIVE_TYPE_KEEPALIVE) {
        return;
      }
      
    });

    socket.on('close', () => {
      service.unregisterUser(ip, currentId);
      // 广播更新后的房间信息
      service.getUserList(ip).forEach(user => {
        socketSend_RoomInfo(user.socket, ip);
        send(user.socket, SEND_TYPE_ROOM_INFO_UPDATE, {
          current: service.getRoomSize(ip),
          max: service.config.maxUsers
        });
      });
      console.log(`User ${currentId} disconnected`);
    });

    socket.on('error', () => {
      service.unregisterUser(ip, currentId);
      service.getUserList(ip).forEach(user => {
        socketSend_RoomInfo(user.socket, ip);
      });
      console.log('A client disconnected.');
    });

    // 广播房间信息更新
    service.getUserList(ip).forEach(user => {
      send(user.socket, SEND_TYPE_ROOM_INFO_UPDATE, {
        current: service.getRoomSize(ip),
        max: service.config.maxUsers
      });
    });
  } catch (error) {
    console.error('Connection error:', error);
    socket.close();
  }
});

// 定期检查连接状态
const interval = setInterval(() => {
  server.clients.forEach((socket) => {
    if (socket.isAlive === false) {
      return socket.terminate();
    }
    socket.isAlive = false;
    socket.ping();
  });
}, 30000);

server.on('close', () => {
  clearInterval(interval);
});




function send(socket, type, data) {
  socket.send(JSON.stringify({ type, data }));
}

function socketSend_UserId(socket, id) {
  send(socket, SEND_TYPE_REG, { id });
}
function socketSend_RoomInfo(socket, ip, currentId) {
  const result = service.getUserList(ip).map(user => ({ id: user.id }));
  send(socket, SEND_TYPE_ROOM_INFO, result);
}
function socketSend_JoinedRoom(socket, id) {
  send(socket, SEND_TYPE_JOINED_ROOM, { id });
}

function socketSend_Candidate(socket, data) {
  send(socket, SEND_TYPE_NEW_CANDIDATE, data);
}

function socketSend_ConnectInvite(socket, data) {
  send(socket, SEND_TYPE_NEW_CONNECTION, data);
}

function socketSend_Connected(socket, data) {
  send(socket, SEND_TYPE_CONNECTED, data);
}

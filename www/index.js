var users = [];
var me = new XChatUser();

function setRemote() {
  me.setRemoteSdp(remoteSDP.value);
}
function addLinkItem(uid, file) {
  const chatBox = document.querySelector('.chat-wrapper');
  const chatItem = document.createElement('div');
  chatItem.className = 'chat-item';
  
  const user = users.find(u => u.id === uid);
  const displayName = user ? user.getDisplayName() : uid;
  
  // 检查文件类型
  const fileType = getFileType(file.name);
  let contentHtml = '';
  
  if (fileType === 'image') {
    contentHtml = `
      <div class="file-preview">
        <img src="${file.url}" alt="${file.name}" onclick="showMediaPreview('${file.url}', '${file.name}', 'image')">
        <a class="file" href="${file.url}" download="${file.name}">[图片] ${file.name}</a>
      </div>
    `;
  } else if (fileType === 'video') {
    contentHtml = `
      <div class="file-preview">
        <video src="${file.url}" onclick="showMediaPreview('${file.url}', '${file.name}', 'video')" preload="metadata"></video>
        <a class="file" href="${file.url}" download="${file.name}">[视频] ${file.name}</a>
      </div>
    `;
  } else {
    contentHtml = `<a class="file" href="${file.url}" download="${file.name}">[文件] ${file.name}</a>`;
  }
  
  // 添加时间戳
  const timestamp = formatTime(new Date());
  
  chatItem.innerHTML = `
    <div class="chat-item_user">${uid === me.id ? '（我）': ''}${displayName}</div>
    <div class="chat-item_time">${timestamp}</div>
    <div class="chat-item_content">${contentHtml}</div>
  `;
  
  chatBox.appendChild(chatItem);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function addChatItem(uid, message, isSystem = false) {
  const chatBox = document.querySelector('.chat-wrapper');
  const chatItem = document.createElement('div');
  chatItem.className = 'chat-item' + (isSystem ? ' system-message' : '');
  let msg = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // 获取用户对象和时间
  let displayName;
  if (isSystem) {
    displayName = '系统';
  } else {
    if (uid === me.id) {
      displayName = me.getDisplayName();
    } else {
      const user = users.find(u => u.id === uid);
      displayName = user ? user.getDisplayName() : uid;
    }
  }
  
  // 存储原始ID，方便后续更新
  chatItem.dataset.userId = uid;
  
  // 添加时间戳
  const timestamp = formatTime(new Date());
  
  chatItem.innerHTML = `
    <div class="chat-item_user">${isSystem ? '系统' : (uid === me.id ? '（我）': '') + displayName}</div>
    <div class="chat-item_time">${timestamp}</div>
    <div class="chat-item_content"><pre>${msg}</pre></div>
  `;
  
  chatBox.appendChild(chatItem);
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage(msg) {
  const message = msg ?? messageInput.value;
  try {
    const currentUser = users.find(u => u.isMe);
    if (!currentUser) {
      console.error('Current user not found');
      return;
    }

    addChatItem(currentUser.id, message);
    
    const sendPromises = users.map(async u => {
      if (u.isMe) return;
      try {
        await u.sendMessage(message);
      } catch (err) {
        console.error(`Failed to send message to ${u.getDisplayName()}:`, err);
        addChatItem('系统', `消息发送失败(${u.getDisplayName()}): ${err.message}`);
      }
    });

    await Promise.all(sendPromises);
    messageInput.value = '';
  } catch (err) {
    console.error('Error sending message:', err);
    alert('发送消息失败，请重试');
  }
}

async function sendFile(file) {
  pendingFile = file;
  
  // 检查是否是图片
  const fileType = getFileType(file.name);
  const isImage = fileType === 'image';
  
  // 如果是图片，直接广播给所有人
  if (isImage) {
    const modal = document.getElementById('userSelectModal');
    const progressContainer = modal.querySelector('.progress-container');
    const progressBar = modal.querySelector('.progress-bar-inner');
    const progressText = modal.querySelector('.progress-text');
    
    try {
      const fileInfo = { name: file.name, size: file.size };
      const otherUsers = users.filter(u => !u.isMe);
      const totalUsers = otherUsers.length;
      
      if (totalUsers === 0) {
        alert('当前没有其他用户在线');
        return;
      }
      
      // 显示进度条
      modal.style.display = 'block';
      document.getElementById('userSelectList').style.display = 'none';
      modal.querySelector('.modal-footer').style.display = 'none';
      progressContainer.style.display = 'block';
      progressText.textContent = `正在向所有用户发送图片...`;
      
      // 发送给所有用户
      for (let i = 0; i < otherUsers.length; i++) {
        const user = otherUsers[i];
        progressText.textContent = `正在发送给 ${user.getDisplayName()}... (${i + 1}/${totalUsers})`;
        
        // 创建进度回调
        const onProgress = (sent, total) => {
          const userProgress = (sent / total) * 100;
          const totalProgress = ((i * 100) + userProgress) / totalUsers;
          progressBar.style.width = totalProgress + '%';
        };
        
        await user.sendFile(fileInfo, file, onProgress);
      }
      
      // 添加到聊天记录
      addChatItem(me.id, `[图片] ${fileInfo.name} (已发送给所有人)`);
      
    } catch (error) {
      console.error('发送文件失败:', error);
      alert('发送文件失败，请重试');
    } finally {
      // 恢复界面状态
      modal.style.display = 'none';
      document.getElementById('userSelectList').style.display = 'block';
      modal.querySelector('.modal-footer').style.display = 'block';
      progressContainer.style.display = 'none';
      progressBar.style.width = '0%';
    }
    
    pendingFile = null;
    return;
  }
  
  // 如果不是图片，保持原有的选择用户逻辑
  const otherUsers = users.filter(u => !u.isMe);
  
  if (otherUsers.length === 1) {
    const modal = document.getElementById('userSelectModal');
    const progressContainer = modal.querySelector('.progress-container');
    const progressBar = modal.querySelector('.progress-bar-inner');
    const progressText = modal.querySelector('.progress-text');
    
    try {
      const user = otherUsers[0];
      const fileInfo = { name: file.name, size: file.size };
      
      // 显示进度条
      modal.style.display = 'block';
      document.getElementById('userSelectList').style.display = 'none';
      modal.querySelector('.modal-footer').style.display = 'none';
      progressContainer.style.display = 'block';
      progressText.textContent = `正在发送给 ${user.getDisplayName()}...`;
      
      // 创建进度回调
      const onProgress = (sent, total) => {
        const progress = (sent / total) * 100;
        progressBar.style.width = progress + '%';
      };
      
      await user.sendFile(fileInfo, file, onProgress);
      addChatItem(me.id, `[文件] ${fileInfo.name} (发送给: ${user.getDisplayName()})`);
    } catch (error) {
      console.error('发送文件失败:', error);
      alert('发送文件失败，请重试');
    } finally {
      // 恢复界面状态
      modal.style.display = 'none';
      document.getElementById('userSelectList').style.display = 'block';
      modal.querySelector('.modal-footer').style.display = 'block';
      progressContainer.style.display = 'none';
      progressBar.style.width = '0%';
    }
    
    pendingFile = null;
    return;
  } else {
    showUserSelectModal();
  }
}
function registCandidate() {
  for (const ca of JSON.parse(candidate.value)) {
    me.addIceCandidate(ca);
  }
}


function connectAllOther() {
  if (users.length <= 1) {
    return;
  }
  const targets = users.filter(u => u.id !== me.id);
  for (const target of targets) {
    target.onicecandidate = (candidate) => {
      // console.log('candidate', candidate);
      signalingServer.send(JSON.stringify({uid: me.id, targetId: target.id, type: '9001', data: { candidate }}));
    }
    target.createConnection().then(() => {
      // console.log('targetAddr', target.connAddressMe);
      signalingServer.send(JSON.stringify({uid: me.id, targetId: target.id, type: '9002', data: { targetAddr: target.connAddressMe }}));
    })
  }
}


function refreshUsers(data) {
  resUsers = data.map(u => {
    let uOld = users.find(uOld => uOld.id === u.id);
    if (uOld) {
      return uOld;
    }
    let xchatUser = new XChatUser();
    xchatUser.id = u.id;
    xchatUser.isMe = u.id === me.id;
    if (xchatUser.isMe) {
      const savedNickname = localStorage.getItem('userNickname');
      if (savedNickname) {
        console.log('Setting saved nickname:', savedNickname); // 添加日志
        xchatUser.setNickname(savedNickname);
      }
    }
    return xchatUser;
  });

  const oldUsers = users;
  users = resUsers;
  users.forEach(initUser);
  refreshUsersHTML();

  // 如果是新用户加入，昵称
  if (oldUsers.length < users.length && me.nickname) {
    console.log('Broadcasting nickname for new users'); // 添加日志
    setTimeout(broadcastNickname, 1000); // 延迟1秒后广播昵称
  }
}

function joinedRoom() {
  connectAllOther();
  // 连接建立后广播昵称
  if (me.nickname) {
    console.log('Broadcasting nickname after joining room'); // 添加日志
    setTimeout(broadcastNickname, 2000); // 延迟2秒后广播昵称
  }
}

function addCandidate(data) {
  users.find(u => u.id === data.targetId).addIceCandidate(data.candidate);
}
async function joinConnection(data) {
  const user = users.find(u => u.id === data.targetId)
  if (!user) {
    return;
  }
  user.onicecandidate = (candidate) => {
    // console.log('candidate', candidate);
    signalingServer.send(JSON.stringify({uid: me.id, targetId: user.id, type: '9001', data: { candidate }}));
  }
  await user.connectTarget(data.offer.sdp)
  signalingServer.send(JSON.stringify({uid: me.id, targetId: user.id, type: '9003', data: { targetAddr: user.connAddressMe }}));
}

async function joinedConnection(data) {
  const target = users.find(u => u.id === data.targetId)
  if (!target) {
    return;
  }
  await target.setRemoteSdp(data.answer.sdp);
}

function refreshUsersHTML() {
  const usersList = document.querySelector('#users');
  usersList.innerHTML = users.map(u => {
    const displayName = u.getDisplayName();
    const isCurrentUser = u.isMe;
    return `<li>${displayName}${isCurrentUser ? '（我）' : ''}</li>`;
  }).join('');
}

function enterTxt(event) {
  if (event.ctrlKey || event.shiftKey) {
    return;
  }
  if (event.keyCode === 13) {
    sendMessage();
    event.preventDefault();
  }
}

// 修改信令服务器连接相关代码
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectInterval = 3000; // 3秒

function connectSignalingServer() {
  const statusIndicator = document.createElement('div');
  statusIndicator.className = 'connection-status';
  statusIndicator.id = 'connectionStatus';
  document.body.appendChild(statusIndicator);
  
  // 拖动相关变量
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  // 初始化位置
  function initPosition() {
    const rect = statusIndicator.getBoundingClientRect();
    // 使用right和top的初始值
    xOffset = window.innerWidth - rect.width - 10; // 10px是原始的right值
    yOffset = 10; // 原始的top值
    updatePosition(xOffset, yOffset);
  }

  // 触摸事件处理
  function handleTouchStart(e) {
    const rect = statusIndicator.getBoundingClientRect();
    initialX = e.touches[0].clientX - rect.left;
    initialY = e.touches[0].clientY - rect.top;
    
    if (e.target === statusIndicator) {
      isDragging = true;
      statusIndicator.classList.add('dragging');
    }
  }

  // 鼠标事件处理
  function handleMouseDown(e) {
    const rect = statusIndicator.getBoundingClientRect();
    initialX = e.clientX - rect.left;
    initialY = e.clientY - rect.top;
    
    if (e.target === statusIndicator) {
      isDragging = true;
      statusIndicator.classList.add('dragging');
    }
  }

  function handleMouseMove(e) {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      updatePosition(currentX, currentY);
    }
  }

  function handleDragEnd() {
    if (isDragging) {
      isDragging = false;
      statusIndicator.classList.remove('dragging');
      xOffset = currentX;
      yOffset = currentY;
      
      // 保存位置到localStorage
      localStorage.setItem('statusIndicatorPos', JSON.stringify({
        x: currentX,
        y: currentY
      }));
    }
  }

  function updatePosition(x, y) {
    // 确保不会拖出屏幕
    const rect = statusIndicator.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;
    
    x = Math.min(Math.max(0, x), maxX);
    y = Math.min(Math.max(0, y), maxY);
    
    statusIndicator.style.right = 'auto';
    statusIndicator.style.left = `${x}px`;
    statusIndicator.style.top = `${y}px`;
  }

  // 恢复上次保存的位置或初始化位置
  const savedPos = JSON.parse(localStorage.getItem('statusIndicatorPos'));
  if (savedPos) {
    // 等待元素渲染完成后再设置位置
    requestAnimationFrame(() => {
      updatePosition(savedPos.x, savedPos.y);
      xOffset = savedPos.x;
      yOffset = savedPos.y;
    });
  } else {
    // 等待元素渲染完成后初始化位置
    requestAnimationFrame(initPosition);
  }

  // 添加触摸移动处理函数
  function handleTouchMove(e) {
    if (isDragging) {
      e.preventDefault();
      currentX = e.touches[0].clientX - initialX;
      currentY = e.touches[0].clientY - initialY;
      updatePosition(currentX, currentY);
    }
  }

  // 添加事件监听器
  statusIndicator.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleDragEnd);
  
  // 添加触摸事件支持
  statusIndicator.addEventListener('touchstart', handleTouchStart);
  document.addEventListener('touchmove', handleTouchMove, { passive: false }); // 添加 passive: false 以允许阻止默认行为
  document.addEventListener('touchend', handleDragEnd);
  
  // 防止文本选择默认拖动行为
  statusIndicator.addEventListener('dragstart', e => e.preventDefault());
  statusIndicator.addEventListener('selectstart', e => e.preventDefault());

  function updateStatus(status, message) {
    statusIndicator.className = `connection-status ${status}`;
    if (isDragging) {
      statusIndicator.classList.add('dragging');
    }
    if (me.id) {
      const displayName = me.getDisplayName();
      message = message.replace(me.id, displayName);
    }
    statusIndicator.textContent = message;
  }

  function connect() {
    updateStatus('connecting', '正在连接服务器...');
    
    // 从本地存储获取上次使用的IP地址
    const lastIP = localStorage.getItem('lastServerIP') || '172.16.88.7';
    
    // 获取服务器IP地址
    const serverIP = prompt('请输入服务器IP地址:', lastIP);
    if (!serverIP) {
      updateStatus('error', '未输入服务器地址');
      return;
    }
    
    // 保存新的IP地址到本地存储
    localStorage.setItem('lastServerIP', serverIP);
    
    const ws = new WebSocket(`ws://${serverIP}:8081`);
    
    ws.onopen = () => {
      console.log('Connected to signaling server');
      updateStatus('connected', '已连接');
      reconnectAttempts = 0;
      
      // 连接成功后设置昵称
      setupNickname();
      
      // 心跳检测
      const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({type: '9999'}));
        } else {
          clearInterval(heartbeat);
        }
      }, 1000 * 10);
    };

    ws.onclose = () => {
      console.log('Disconnected from signaling server');
      updateStatus('disconnected', '连接断开');
      
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        updateStatus('reconnecting', `正在重连(${reconnectAttempts}/${maxReconnectAttempts})...`);
        setTimeout(connect, reconnectInterval);
      } else {
        updateStatus('error', '连接失败，请刷新页面重试');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      updateStatus('error', '连接错误');
    };

    ws.onmessage = ({ data: responseStr }) => {
      try {
        const response = JSON.parse(responseStr);
        const { type, data } = response;

        if (type === '1001') {
          me.id = data.id;
          updateStatus('connected', `已连接 (ID: ${data.id})`);
          return;
        }
        if (type === '1002') {
          refreshUsers(data);
          return;
        }
        if (type === '1003') {
          joinedRoom()
          return;
        }
        if (type === '1004') {
          addCandidate(data);
          return;
        }
        if (type === '1005') {
          joinConnection(data);
          return;
        }
        if (type === '1006') {
          joinedConnection(data);
          return;
        }
        if (type === '1007') {
          alert(`房间人数已满 (${data.current}/${data.max})`);
          updateStatus('error', '房间已满');
          return;
        }
        if (type === '1008') {
          updateRoomInfo(data.current, data.max);
          return;
        }
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

    return ws;
  }

  return connect();
}

// 初始化连接
const signalingServer = connectSignalingServer();

function showUserSelectModal() {
  const modal = document.getElementById('userSelectModal');
  const userList = document.getElementById('userSelectList');
  
  // 清空之前的列表
  userList.innerHTML = '';
  
  // 添加用户选项
  users.forEach(user => {
    if (!user.isMe) {
      const item = document.createElement('div');
      item.className = 'user-select-item';
      const id = `user-${user.id}`;
      
      item.innerHTML = `
        <label>
          <input type="checkbox" value="${user.id}">
          <span>${user.getDisplayName()}</span>
        </label>
      `;
      
      // 点击整行时切换复选框状态
      item.addEventListener('click', (e) => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        // 如果点击的是复选框本身，不需要额外处理
        if (e.target === checkbox) return;
        
        checkbox.checked = !checkbox.checked;
        e.preventDefault(); // 止件冒泡
      });
      
      userList.appendChild(item);
    }
  });
  
  modal.style.display = 'block';
}

function cancelSendFile() {
  const modal = document.getElementById('userSelectModal');
  modal.style.display = 'none';
  pendingFile = null;
}

async function confirmSendFile() {
  const modal = document.getElementById('userSelectModal');
  const sendButton = modal.querySelector('.modal-footer button:last-child');
  const progressContainer = modal.querySelector('.progress-container');
  const progressBar = modal.querySelector('.progress-bar-inner');
  const progressText = modal.querySelector('.progress-text');
  const userList = document.getElementById('userSelectList');
  const selectedUsers = Array.from(document.querySelectorAll('#userSelectList input[type="checkbox"]:checked'))
    .map(checkbox => users.find(u => u.id === checkbox.value))
    .filter(user => user);
  
  if (selectedUsers.length > 0 && pendingFile) {
    sendButton.disabled = true;
    sendButton.textContent = '发送中...';
    userList.style.display = 'none';
    progressContainer.style.display = 'block';
    
    try {
      const fileInfo = { name: pendingFile.name, size: pendingFile.size };
      const totalUsers = selectedUsers.length;
      const fileType = getFileType(pendingFile.name);
      
      for (let i = 0; i < selectedUsers.length; i++) {
        const user = selectedUsers[i];
        progressText.textContent = `正在发送给 ${user.getDisplayName()}... (${i + 1}/${totalUsers})`;
        
        const onProgress = (sent, total) => {
          const userProgress = (sent / total) * 100;
          const totalProgress = ((i * 100) + userProgress) / totalUsers;
          progressBar.style.width = totalProgress + '%';
        };
        
        await user.sendFile(fileInfo, pendingFile, onProgress);
      }
      
      // 根据文件类型显示不同的消息
      const fileTypeText = fileType === 'image' ? '[图片]' : 
                          fileType === 'video' ? '[视频]' : '[文件]';
      const recipientNames = selectedUsers.map(u => u.getDisplayName()).join(', ');
      addChatItem(me.id, `${fileTypeText} ${fileInfo.name} (发送给: ${recipientNames})`);
      
    } catch (error) {
      console.error('发送文件失败:', error);
      alert('发送文件失败，请重试');
    } finally {
      sendButton.disabled = false;
      sendButton.textContent = '发送';
      userList.style.display = 'block';
      progressContainer.style.display = 'none';
      progressBar.style.width = '0%';
    }
  }
  
  modal.style.display = 'none';
  pendingFile = null;
}

function diagnoseConnection() {
  console.log('=== Connection Diagnosis ===');
  console.log('WebSocket State:', signalingServer.readyState);
  console.log('Local ID:', me.id);
  console.log('Connected Users:', users.map(u => ({
    id: u.id,
    isMe: u.isMe,
    rtcState: u.rtcConn?.connectionState,
    iceState: u.rtcConn?.iceConnectionState,
    dataChannelState: u.chatChannel?.readyState
  })));
}

// 添加诊断按钮
const diagButton = document.createElement('button');
diagButton.textContent = '连接诊断';
diagButton.onclick = diagnoseConnection;
document.body.appendChild(diagButton);

// 在连接状态变化时添加系统消息
function onConnectionStateChange(userId, state) {
  const user = users.find(u => u.id === userId);
  const displayName = user ? user.getDisplayName() : userId;
  
  const stateMessages = {
    'connecting': `正在与 ${displayName} 建连接...`,
    'connected': `与 ${displayName} 连接成功`,
    'disconnected': `与 ${displayName} 的连接已断开`,
    'failed': `与 ${displayName} 的连接失败`
  };
  
  if (stateMessages[state]) {
    addChatItem('系统', stateMessages[state], true);
  }
}

// 修改昵称设置功能
function setupNickname() {
  const lastNickname = localStorage.getItem('userNickname');
  const nickname = prompt('请输入您的昵称:', lastNickname || '');
  
  if (nickname) {
    console.log('Setting new nickname:', nickname);
    localStorage.setItem('userNickname', nickname);
    
    // 更新自己的昵称
    me.setNickname(nickname);
    
    // 更新用户列表中的昵称
    const currentUser = users.find(u => u.isMe);
    if (currentUser) {
      currentUser.setNickname(nickname);
    }
    
    // 立即更新所有显示
    updateAllDisplays(nickname);
    
    // 广播昵称
    try {
      broadcastNickname();
      console.log('Nickname broadcast completed');
    } catch (err) {
      console.error('Failed to broadcast nickname:', err);
      addChatItem('系统', '昵称广播失败，其他用户可能看不到您的新昵称', true);
    }
  }
}

// 添加一个函数来更新所有显示
function updateAllDisplays(newNickname) {
  // 更新用户列表
  refreshUsersHTML();
  
  // 更新聊天记录中的显示
  const chatItems = document.querySelectorAll('.chat-item');
  chatItems.forEach(item => {
    const userDiv = item.querySelector('.chat-item_user');
    const userId = item.dataset.userId;
    
    if (userDiv && userId === me.id) {
      // 更新聊天记录中自己的显示名称
      userDiv.textContent = `（我）${newNickname} :`;
    }
  });
  
  // 更新连接状态显示
  const statusIndicator = document.getElementById('connectionStatus');
  if (statusIndicator && me.id) {
    const currentText = statusIndicator.textContent;
    if (currentText.includes(me.id)) {
      statusIndicator.textContent = currentText.replace(me.id, newNickname);
    }
  }

  // 更新用户选择模态框中的显示
  const userSelectList = document.getElementById('userSelectList');
  if (userSelectList) {
    const spans = userSelectList.querySelectorAll('span');
    spans.forEach(span => {
      const userId = span.parentElement.querySelector('input').value;
      const user = users.find(u => u.id === userId);
      if (user) {
        span.textContent = user.getDisplayName();
      }
    });
  }
  
  // 添加系统消息
  addChatItem('系统', `您已修改昵称为 ${newNickname}`, true);
}

// 广播昵称给其他用户
function broadcastNickname() {
  const nicknameData = {
    type: 'nickname',
    nickname: me.nickname,
    fromId: me.id
  };

  const nicknameMsg = JSON.stringify(nicknameData);
  console.log('Broadcasting nickname data:', nicknameData); // 添加日志
  
  users.forEach(u => {
    if (!u.isMe) {
      try {
        const message = `##NICKNAME##${nicknameMsg}`;
        console.log(`Sending nickname message to ${u.id}:`, message); // 添加日志
        u.sendMessage(message);
        console.log(`Sent nickname to user ${u.id}`);
      } catch (err) {
        console.error(`Failed to send nickname to ${u.id}:`, err);
      }
    }
  });
}

// 修改XChatUser的消息处理
function initUser(user) {
  user.onmessage = (msg) => {
    console.log(`Received message from ${user.id}:`, msg); // 添加日志
    
    if (msg.startsWith('##NICKNAME##')) {
      try {
        // 修改这里，确保正确截取JSON字符串
        const jsonStr = msg.replace('##NICKNAME##', '');
        console.log('Parsing nickname JSON:', jsonStr); // 添加日志
        
        const nicknameData = JSON.parse(jsonStr);
        console.log('Received nickname data:', nicknameData); // 添加日志
        
        if (nicknameData.type === 'nickname' && nicknameData.fromId) {
          // 找到发送昵称的用户
          const fromUser = users.find(u => u.id === nicknameData.fromId);
          if (fromUser) {
            const oldName = fromUser.getDisplayName();
            fromUser.setNickname(nicknameData.nickname);
            console.log(`Updated nickname for user ${fromUser.id} to ${nicknameData.nickname}`); // 添加日志
            
            refreshUsersHTML();
            addChatItem('系统', `${oldName} 修改昵称为 ${nicknameData.nickname}`, true);
          } else {
            console.warn(`User ${nicknameData.fromId} not found`); // 添加日志
          }
        }
      } catch (e) {
        console.error('Failed to parse nickname message:', e);
        console.error('Original message:', msg); // 添加原始消息日志
      }
    } else {
      addChatItem(user.id, msg);
    }
  };
  
  user.onReviceFile = (file) => {
    addLinkItem(user.id, file);
  };
}

// 添加修改昵称的按钮
const nicknameButton = document.createElement('button');
nicknameButton.textContent = '修改昵称';
nicknameButton.onclick = setupNickname;
nicknameButton.className = 'nickname-button';
// 将按钮添加到右侧面板的最上方
document.querySelector('.right').prepend(nicknameButton);

// 添加房间信息显示
function updateRoomInfo(current, max) {
  const roomInfo = document.querySelector('.room-info') || createRoomInfoElement();
  roomInfo.textContent = `在线人数: ${current}/${max}`;
  
  // 更新状态样式
  if (current >= max) {
    roomInfo.classList.add('room-full');
  } else {
    roomInfo.classList.remove('room-full');
  }
}

function createRoomInfoElement() {
  const roomInfo = document.createElement('div');
  roomInfo.className = 'room-info';
  document.querySelector('.right').prepend(roomInfo);
  return roomInfo;
}

// 添加文件类型判断函数
function getFileType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
  const videoExts = ['mp4', 'webm', 'ogg'];
  
  if (imageExts.includes(ext)) return 'image';
  if (videoExts.includes(ext)) return 'video';
  return 'other';
}

// 添加媒体预览函数
function showMediaPreview(url, filename, type) {
  const modal = document.createElement('div');
  modal.className = 'media-preview-modal';
  
  let mediaHtml = '';
  if (type === 'image') {
    mediaHtml = `<img src="${url}" alt="${filename}">`;
  } else if (type === 'video') {
    mediaHtml = `
      <video src="${url}" controls>
        您的浏览器不支持视频播放
      </video>
    `;
  }
  
  modal.innerHTML = `
    <div class="media-preview-content">
      <div class="media-preview-header">
        <span class="media-preview-title">${filename}</span>
        <button onclick="this.parentElement.parentElement.parentElement.remove()">关闭</button>
      </div>
      <div class="media-preview-body">
        ${mediaHtml}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 点击模态框背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// 修改表情面板创建函数
function createEmojiPanel() {
  // 创建工具栏容器
  const toolbarContainer = document.createElement('div');
  toolbarContainer.className = 'toolbar-container';
  
  // 创建文件按钮
  const fileContainer = document.createElement('div');
  fileContainer.className = 'file-button-container';
  
  const fileButton = document.createElement('button');
  fileButton.className = 'file-toggle-button';
  fileButton.innerHTML = '📎';
  fileButton.title = '发送文件';
  
  // 创建隐藏的文件输入框
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.style.display = 'none';
  
  fileInput.onchange = (e) => {
    if (e.target.files.length > 0) {
      sendFile(e.target.files[0]);
      e.target.value = '';
    }
  };
  
  fileButton.onclick = () => {
    fileInput.click();
  };
  
  fileContainer.appendChild(fileButton);
  fileContainer.appendChild(fileInput);
  
  // 创建表情按钮容器
  const emojiContainer = document.createElement('div');
  emojiContainer.className = 'emoji-container';
  
  // 创建表情切换按钮
  const toggleButton = document.createElement('button');
  toggleButton.className = 'emoji-toggle-button';
  toggleButton.innerHTML = '😊';
  toggleButton.title = '表情';
  
  // 创建表情面板
  const emojiPanel = document.createElement('div');
  emojiPanel.className = 'emoji-panel';
  emojiPanel.style.display = 'none';
  
  // 预设表情列表
  const emojis = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
    '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰',
    '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜',
    '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏',
    '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
    '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠'
  ];

  // 创建表情按钮
  emojis.forEach(emoji => {
    const emojiButton = document.createElement('button');
    emojiButton.className = 'emoji-button';
    emojiButton.textContent = emoji;
    emojiButton.onclick = () => {
      insertEmoji(emoji);
      emojiPanel.style.display = 'none';
    };
    emojiPanel.appendChild(emojiButton);
  });

  // 切换表情面板显示
  toggleButton.onclick = (e) => {
    e.stopPropagation();
    emojiPanel.style.display = emojiPanel.style.display === 'none' ? 'flex' : 'none';
  };

  // 点击其他地方时隐藏表情面板
  document.addEventListener('click', (e) => {
    if (!emojiContainer.contains(e.target)) {
      emojiPanel.style.display = 'none';
    }
  });

  // 将表情按钮和面板添加到表情容器
  emojiContainer.appendChild(toggleButton);
  emojiContainer.appendChild(emojiPanel);

  // 组装工具栏
  toolbarContainer.appendChild(fileContainer);
  toolbarContainer.appendChild(emojiContainer);
  
  // 添加到输入框上方
  const messageInput = document.getElementById('messageInput');
  messageInput.parentElement.insertBefore(toolbarContainer, messageInput);
}

// 插入表情到输入框
function insertEmoji(emoji) {
  const messageInput = document.getElementById('messageInput');
  const start = messageInput.selectionStart;
  const end = messageInput.selectionEnd;
  const text = messageInput.value;
  const before = text.substring(0, start);
  const after = text.substring(end);
  
  messageInput.value = before + emoji + after;
  messageInput.selectionStart = messageInput.selectionEnd = start + emoji.length;
  messageInput.focus();
}

// 在页面加载时建表情面板
createEmojiPanel();

// 添加格式化时间的辅助函数
function formatTime(date) {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  const pad = (n) => n.toString().padStart(2, '0');
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const timeStr = `${hours}:${minutes}:${seconds}`;
  
  if (isToday) {
    return timeStr;
  } else {
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    return `${year}-${month}-${day} ${timeStr}`;
  }
}

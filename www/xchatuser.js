connOption = 
{ 
  ordered: true, 
  maxRetransmits: 10, // 最大重传次数
  bufferedAmountLowThreshold: 1024 * 16 // 设置缓冲区低阈值为 16KB
}
class XChatUser {
  id = null;
  isMe = false;
  nickname = null;

  rtcConn = null;
  connAddressTarget = null;
  connAddressMe = null;
  chatChannel = null;
  candidateArr = [];

  onicecandidate = () => { };
  onmessage = () => { };
  onReviceFile = () => { };


  receivedSize = 0;
  receivedChunks = [];
  fileInfo = null;

  pendingCandidates = []; // 添加待处理的 ICE candidates 数组

  // 添加一个Promise来跟踪DataChannel的就绪状态
  dataChannelReady = null;
  dataChannelReadyResolve = null;

  constructor() {
    // 初始化DataChannel就绪Promise
    this.dataChannelReady = new Promise(resolve => {
      this.dataChannelReadyResolve = resolve;
    });
  }

  async createConnection() {
    if (this.rtcConn) {
      this.rtcConn.close();
      this.rtcConn = null;
    }

    this.rtcConn = new RTCPeerConnection({ 
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    });
    
    // 添加ICE候选者处理
    this.rtcConn.onicecandidate = event => {
      if (event.candidate) {
        console.log('New ICE candidate:', event.candidate);
        this.candidateArr.push(event.candidate);
        this.onicecandidate(event.candidate, this.candidateArr);
      }
    };

    // 添加连接状态监听
    this.rtcConn.onconnectionstatechange = () => {
      console.log(`Connection state for ${this.id}:`, this.rtcConn.connectionState);
      if (this.rtcConn.connectionState === 'connected') {
        // 确保DataChannel已创建
        if (!this.chatChannel) {
          this.chatChannel = this.rtcConn.createDataChannel('chat', connOption);
          this.dataChannel_initEvent();
        }
      }
    };

    this.rtcConn.ondatachannel = (event) => {
      console.log(`DataChannel received for ${this.id}`);
      if (event.channel) {
        this.chatChannel = event.channel;
        this.dataChannel_initEvent();
      }
    };

    // 创建数据通道
    try {
      this.chatChannel = this.rtcConn.createDataChannel('chat', connOption);
      this.dataChannel_initEvent();
    } catch (error) {
      console.warn('Failed to create data channel:', error);
      // 如果创建失败，等待对方创建
    }

    const offer = await this.rtcConn.createOffer();
    await this.rtcConn.setLocalDescription(offer);
    this.connAddressMe = this.rtcConn.localDescription;

    return this;
  }

  closeConnection() {
    if (this.rtcConn) {
      this.rtcConn.close();
    }
    this.rtcConn = null;
    this.chatChannel = null;
    this.connAddressTarget = null;
    this.connAddressMe = null;
    this.onicecandidate = () => { };
    // 重置DataChannel就绪状态
    this.dataChannelReady = new Promise(resolve => {
      this.dataChannelReadyResolve = resolve;
    });
  }

  async connectTarget(target) {
    if (!target) {
      throw new Error('connAddressTarget is null');
    }
    if (this.isMe || !this.id) {
      return this;
    }

    try {
      if (this.rtcConn) {
        this.rtcConn.close();
        this.rtcConn = null;
      }

      this.rtcConn = new RTCPeerConnection({ 
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      });

      // 添加ICE候选者处理
      this.rtcConn.onicecandidate = event => {
        if (event.candidate) {
          console.log('New ICE candidate:', event.candidate);
          this.candidateArr.push(event.candidate);
          this.onicecandidate(event.candidate, this.candidateArr);
        }
      };

      // 添加连接状态监听
      this.rtcConn.onconnectionstatechange = () => {
        console.log(`Connection state changed: ${this.rtcConn.connectionState}`);
        if (this.rtcConn.connectionState === 'connected') {
          // 确保DataChannel已创建
          if (!this.chatChannel) {
            this.chatChannel = this.rtcConn.createDataChannel('chat', connOption);
            this.dataChannel_initEvent();
          }
        }
      };

      this.rtcConn.ondatachannel = (event) => {
        console.log(`DataChannel received for ${this.id}`);
        if (event.channel) {
          this.chatChannel = event.channel;
          this.dataChannel_initEvent();
        }
      };

      // 先设置远程描述
      this.connAddressTarget = new RTCSessionDescription({ type: 'offer', sdp: target});
      await this.rtcConn.setRemoteDescription(this.connAddressTarget);
      
      // 创建并设置本地描述
      this.connAddressMe = await this.rtcConn.createAnswer();
      await this.rtcConn.setLocalDescription(this.connAddressMe);

      // 处理之前存储的候选者
      if (this.pendingCandidates.length > 0) {
        console.log('Processing pending candidates:', this.pendingCandidates.length);
        for (const candidate of this.pendingCandidates) {
          await this.rtcConn.addIceCandidate(new RTCIceCandidate(candidate));
        }
        this.pendingCandidates = [];
      }

      return this;
    } catch (error) {
      console.error('Error in connectTarget:', error);
      throw error;
    }
  }

  async addIceCandidate(candidate) {
    if (!this.rtcConn) {
      console.warn('No RTCPeerConnection to add ICE candidate');
      return;
    }

    try {
      if (!this.rtcConn.remoteDescription) {
        console.log('Storing ICE candidate for later');
        this.pendingCandidates.push(candidate);
        return;
      }
      console.log('Adding ICE candidate:', candidate);
      await this.rtcConn.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  }

  async setRemoteSdp(target) {
    if (!this.rtcConn) {
      console.error('RTCPeerConnection is null');
      return;
    }

    try {
      if (this.rtcConn.signalingState === 'have-local-offer') {
        await this.rtcConn.setRemoteDescription({ type: 'answer', sdp: target});
        console.log('Remote SDP set as answer.');

        // 处理之前存储的候选者
        if (this.pendingCandidates.length > 0) {
          console.log('Processing pending candidates:', this.pendingCandidates.length);
          for (const candidate of this.pendingCandidates) {
            await this.rtcConn.addIceCandidate(new RTCIceCandidate(candidate));
          }
          this.pendingCandidates = [];
        }
      } else {
        console.warn('Cannot set answer SDP: signaling state is', this.rtcConn.signalingState);
      }
    } catch (err) {
      console.error('Error handling answer SDP:', err);
      throw err;
    }
  }

  dataChannel_initEvent() {
    // 添加状态变化监听
    this.chatChannel.onopen = () => {
      console.log(`DataChannel ${this.id} is open`);
      // 当DataChannel打开时，解析就绪Promise
      this.dataChannelReadyResolve(true);
    };
    
    this.chatChannel.onclose = () => {
      console.log(`DataChannel ${this.id} is closed`);
      // 重置Promise以便重新连接
      this.dataChannelReady = new Promise(resolve => {
        this.dataChannelReadyResolve = resolve;
      });
    };
    
    this.chatChannel.onerror = (error) => {
      console.error(`DataChannel ${this.id} error:`, error);
    };

    // 接收消息
    this.chatChannel.onmessage = e => {
      const message = e.data;
      if (typeof message === 'string') {
        if (message.startsWith('##FILE_S##')) {
          // 文件传输前的头信息
          this.receivedChunks = [];
          this.receivedSize = 0;
          this.fileInfo = JSON.parse(message.substring(10));
        } else if (message === '##FILE_E##') {
        } else {
          this.onmessage(message);
        }
      } else if (this.receivedChunks) {
        if (message instanceof ArrayBuffer) {
          this.receivedChunks.push(message);
        } else if (message instanceof Uint8Array) {
          this.receivedChunks.push(message.buffer);
        } else {
          console.error('unknow message type', message);
        }
        this.receivedSize += message.byteLength;
        console.log(this.fileInfo.size, this.receivedSize, `${Math.floor(this.receivedSize / this.fileInfo.size * 100)}%`);
        if (this.fileInfo.size === this.receivedSize) {
          // 文件传输结束的尾信息
          // console.log(this.receivedChunks);
          let blob = new Blob(this.receivedChunks);
          let url = URL.createObjectURL(blob);
          console.log('finish recive');
          this.onReviceFile({  url, name: this.fileInfo.name });
          blob = null;
          this.receivedChunks = null;
          this.receivedSize = 0;
          this.fileInfo = null;
        }
      }
    };
  }
  checkBufferedAmount() {
    const maxBufferedAmount = 1024 * 128; // 设置最大缓冲区限制（例如 256KB）
    if (this.chatChannel.bufferedAmount >= maxBufferedAmount) {
      // console.log('Data channel is full, waiting...');
      // 如果缓冲区满了，暂停发送
      return false;
    } else {
      // 缓冲区未满，可以继续发送
      return true;
    }
  }
  sendFileBytes(file, onProgress) {
    return new Promise((resolve, reject) => {
      const chunkSize = 16 * 1024;
      const totalChunks = Math.ceil(file.size / chunkSize);
      let currentChunk = 0;
      let totalSent = 0;

      const fileReader = new FileReader();
      
      fileReader.onload = async () => {
        try {
          while(!this.checkBufferedAmount()) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          this.chatChannel.send(fileReader.result);
          
          totalSent += fileReader.result.byteLength;
          if (onProgress) {
            onProgress(totalSent, file.size);
          }
        } catch (e) {
          console.error(e);
          reject(e);
          return;
        }

        currentChunk++;

        if (currentChunk < totalChunks) {
          sendNextChunk();
        } else {
          resolve();
        }
      };

      function sendNextChunk() {
        const start = currentChunk * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        try {
          const chunk = file.slice(start, end);
          fileReader.readAsArrayBuffer(chunk);
        } catch (e) {
          console.error(e);
          reject(e);
        }
      }

      sendNextChunk();
    });
  }

  async sendFile(fileInfo, file, onProgress) {
    const fileInfoStr = '##FILE_S##' + JSON.stringify(fileInfo);
    await this.sendMessage(fileInfoStr);
    await this.sendFileBytes(file, onProgress);
    await this.sendMessage('##FILE_E##');
  }
  
  async sendMessage(message) {
    // 添加重试机制
    let retries = 0;
    const maxRetries = 5;
    const retryInterval = 1000; // 1秒

    while (retries < maxRetries) {
      try {
        if (!this.chatChannel) {
          console.log(this.id, '------chatChannel is null, waiting...');
          await new Promise(resolve => setTimeout(resolve, retryInterval));
          retries++;
          continue;
        }

        if (this.chatChannel.readyState === 'open') {
          await this.chatChannel.send(message);
          return;
        } else {
          console.log(`Channel state for ${this.id}:`, this.chatChannel.readyState);
          await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
      } catch (error) {
        console.error(`Send message attempt ${retries + 1} failed:`, error);
        retries++;
        if (retries === maxRetries) {
          throw new Error('Failed to send message after multiple retries');
        }
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    }
  }

  setNickname(name) {
    this.nickname = name;
  }

  getDisplayName() {
    return this.nickname || this.id;
  }
}
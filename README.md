
# 局域网聊天/文件传输工具

> 本项目基于 [internal-chat](https://github.com/sunzsh/internal-chat) 二次开发

## 功能特点

- 支持文字聊天
- 支持文件传输（拖拽或点击📎按钮）
- 支持表情发送
- 支持图片/视频预览
- 支持修改昵称
- 显示在线用户列表
- 显示连接状态
- 最多支持10个用户同时在线

## 运行步骤

### 1. 启动信令服务器

```bash
# 进入server目录
cd server

# 安装依赖
npm install

# 启动服务器
node index.js
```

服务器将在8081端口启动，监听所有IP地址（0.0.0.0）。

### 2. 部署前端文件

将www目录下的所有文件部署到Web服务器。可以使用以下方式之一：

#### 使用Python的简单HTTP服务器:
```bash
# 进入www目录
cd www
python -m http.server 8080
```

#### 或使用Node.js的http-server:
```bash
npm install -g http-server
cd www
http-server
```

### 3. 访问应用

1. 在浏览器中访问 `http://localhost:8080` (或你部署的Web服务器地址)
2. 第一次连接时会提示输入信令服务器的IP地址
3. 输入运行信令服务器的机器IP地址
4. 然后会提示输入昵称
5. 连接成功后即可开始聊天和传输文件

## 项目结构

```
.
├── server/                 # 服务器端代码
│   ├── index.js           # 服务器入口文件
│   ├── data.js            # 数据处理模块
│   └── package.json       # 服务器依赖配置
│
└── www/                   # 前端代码
    ├── index.html         # 主页面
    ├── index.js           # 主要业务逻辑
    ├── xchatuser.js       # WebRTC相关类
    ├── style.css          # 样式文件
    └── favicon.ico        # 网站图标
```

## 注意事项

1. 信令服务器和Web服务器需要在同一个局域网内
2. 确保防火墙允许8081端口的WebSocket连接
3. 最多支持10个用户同时在线（可在server/data.js中修改maxUsers配置）
4. 建议使用现代浏览器（Chrome、Firefox等）访问
5. 这是一个基于WebRTC的P2P应用，数据传输是点对点的，服务器只负责信令协调

## 技术栈

- 前端：原生JavaScript、WebRTC、WebSocket
- 后端：Node.js、ws（WebSocket库）
- 通信：WebRTC P2P、WebSocket信令服务器

## 相关链接

- [原项目地址](https://github.com/sunzsh/internal-chat)

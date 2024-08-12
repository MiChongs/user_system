const {io} = require("../index");
const {Message} = require("../models/message");
io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('send_message', async (data) => {
        const {senderId, recipientId, content} = data;

        // 存储消息到数据库
        const message = await Message.create({senderId, recipientId, content});

        // 向接收方发送消息
        io.to(recipientId).emit('receive_message', message);

        // 更新消息状态为已送达
        message.delivered = true;
        await message.save();
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});
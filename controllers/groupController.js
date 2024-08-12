const {validationResult} = require("express-validator");
const {Group} = require("../models/group/group");
const {User} = require("../models/user");
const {getToken} = require("../global");
const {findUserInfo} = require("../function/findUser");
const {GroupMember} = require("../models/group/groupMember");
const {GroupMessage} = require("../models/group/groupMessage");

exports.leaveGroup = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const [{msg}] = errors.errors;
        return res.json({code: 400, message: msg});
    }
    const {groupNumber} = req.body;

    const token = getToken(req.headers.authorization)

    try {
        findUserInfo(req, res, async (token, user) => {
            const group = await Group.findOne({where: {groupNumber}});

            if (!group || !user) {
                return res.json({message: '未找到组或用户'});
            }

            await GroupMember.destroy({where: {groupId: group.id, userId: user.id}});

            res.status(200).json({message: '退出群组成功'});
        })
    } catch (error) {
        return res.json({message: '内部服务器错误', error: error.message});
    }
}

exports.sendGroupMessage = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const [{msg}] = errors.errors;
        return res.json({code: 400, message: msg});
    }
    try {
        findUserInfo(req, res, async (token, user) => {
            const {groupId, content} = req.body;
            const group = await Group.findByPk(groupId);
            const sender = await User.findByPk(user.id);

            if (!group || !sender) {
                return res.status(404).json({message: '未找到组或用户'});
            }

            const message = await GroupMessage.create({groupId, senderId: user.id, content});

            // 这里可以通过 WebSocket 实时通知群组成员
            io.to(group.id).emit('receive_group_message', message);

            res.status(200).json({message: '消息已成功发送', data: message});
        })
    } catch (error) {
        return res.json({message: '内部服务器错误', error: error.message});
    }
}
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const { User } = require('../models/user');
const { findUserInfo } = require('../function/findUser');
const { logWhitelistOperation } = require('../utils/whitelistLogger');
const {Whitelist} = require("../models/whitelist");

/**
 * 检查用户是否在白名单中
 * @param {string} tag - 功能标签
 */
const checkWhitelist = async (req, res) => {
    try {
        const { appid, tag } = req.body;
        
        if (!appid || !tag) {
            return res.json({
                code: 400,
                msg: '参数不完整'
            });
        }

        // 从请求头获取token
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.json({
                code: 401,
                msg: '未登录'
            });
        }

        // 解析token获取用户信息
        findUserInfo(req, res, async (token, user, app) => {
            if (!user) {
                return res.json({
                    code: 401,
                    msg: '用户不存在'
                });
            }

            // 检查白名单
            const whitelist = await Whitelist.findOne({
                where: {
                    appid,
                    value: user.account,
                    type: 'user',
                    enabled: true,
                    tags: {
                        [Op.contains]: [tag]
                    },
                    [Op.or]: [
                        { expireAt: null },
                        { expireAt: { [Op.gt]: new Date() } }
                    ]
                }
            });

            // 记录操作日志
            await logWhitelistOperation({
                whitelistId: whitelist?.id || 0,
                appid,
                operationType: 'check',
                operatorId: user.id,
                operatorType: 'user',
                status: !!whitelist,
                detail: {
                    tag,
                    account: user.account,
                    checkResult: !!whitelist
                },
                ip: req.ip
            });

            return res.json({
                code: 200,
                msg: '查询成功',
                data: {
                    inWhitelist: !!whitelist
                }
            });
        });
    } catch (error) {
        return res.status(500).json({
            code: 500,
            msg: '服务器错误',
            error: error.message
        });
    }
};

module.exports = checkWhitelist;

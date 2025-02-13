const { Whitelist } = require('../models/whitelist');
const { Op } = require('sequelize');
const { findUserInfo } = require('./findUser');
const { logWhitelistOperation } = require('../utils/whitelistLogger');
const NodeCache = require('node-cache');
const { isArray } = require('lodash');

// 创建缓存实例，TTL为5分钟，检查周期为1分钟
const whitelistCache = new NodeCache({ 
    stdTTL: 300,
    checkperiod: 60,
    useClones: false
});

/**
 * 生成缓存key
 * @param {string} appid 应用ID
 * @param {string} account 用户账号
 * @param {string|string[]} tags 标签或标签数组
 * @returns {string} 缓存key
 */
const generateCacheKey = (appid, account, tags) => {
    const normalizedTags = isArray(tags) ? tags.sort().join(',') : tags;
    return `whitelist:${appid}:${account}:${normalizedTags}`;
};

/**
 * 检查白名单权限
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 * @param {Function} callback 回调函数
 * @param {string|string[]} [customTags] 自定义标签或标签数组
 * @returns {Promise<void>}
 */
async function checkWhiteList(req, res, callback, customTags = null) {
    try {
        const { appid, tag } = req.body;
        const tags = customTags || tag;
        
        // 验证必要参数
        if (!appid || (!tags && !isArray(tags))) {
            return res.json({
                code: 400,
                message: '参数不完整或格式错误'
            });
        }

        // 验证标签格式
        const normalizedTags = isArray(tags) ? tags : [tags];
        if (!normalizedTags.every(t => typeof t === 'string' && t.length > 0)) {
            return res.json({
                code: 400,
                message: '标签格式错误'
            });
        }

        // 验证授权头
        if (!req.headers.authorization) {
            return res.json({
                code: 401,
                message: '用户未授权'
            });
        }

        // 获取客户端IP
        const clientIp = req.headers['x-forwarded-for'] || 
                        req.connection.remoteAddress || 
                        req.socket.remoteAddress;

        // 使用findUserInfo验证用户身份并获取用户信息
        findUserInfo(req, res, async (token, user, app) => {
            if (!user) {
                await logWhitelistOperation({
                    whitelistId: null,
                    appid,
                    operationType: 'check',
                    operatorId: 0,
                    operatorType: 'user',
                    status: false,
                    detail: {
                        tags: normalizedTags,
                        reason: '用户不存在或未授权',
                        timestamp: new Date()
                    },
                    ip: clientIp
                });

                return res.json({
                    code: 401,
                    message: '用户不存在或未授权'
                });
            }

            try {
                // 检查缓存
                const cacheKey = generateCacheKey(appid, user.account, normalizedTags);
                let whitelist = whitelistCache.get(cacheKey);
                let fromCache = true;

                if (!whitelist) {
                    fromCache = false;
                    // 查询白名单
                    whitelist = await Whitelist.findOne({
                        where: {
                            appid,
                            value: user.account,
                            type: 'user',
                            enabled: true,
                            tags: {
                                [Op.contains]: normalizedTags
                            },
                            [Op.or]: [
                                { expireTime: null },
                                { expireTime: { [Op.gt]: new Date() } }
                            ]
                        },
                        attributes: ['id', 'tags', 'expireTime', 'enabled'] // 只选择需要的字段
                    });

                    // 缓存结果
                    if (whitelist) {
                        whitelistCache.set(cacheKey, whitelist);
                    }
                }

                // 记录白名单检查操作
                await logWhitelistOperation({
                    whitelistId: whitelist ? whitelist.id : null,
                    appid,
                    operationType: 'check',
                    operatorId: user.id,
                    operatorType: 'user',
                    status: !!whitelist,
                    detail: {
                        tags: normalizedTags,
                        account: user.account,
                        reason: whitelist ? '验证通过' : '用户不在白名单中或权限已过期',
                        timestamp: new Date(),
                        expireTime: whitelist ? whitelist.expireTime : null,
                        fromCache
                    },
                    ip: clientIp
                });

                if (!whitelist) {
                    return res.json({
                        code: 403,
                        message: '用户不在白名单中或权限已过期'
                    });
                }

                // 执行回调，传入验证结果
                if (typeof callback === 'function') {
                    callback(whitelist);
                }

                return res.json({
                    code: 200,
                    message: '白名单验证通过',
                    data: {
                        ...whitelist.toJSON(),
                        fromCache
                    }
                });
            } catch (error) {
                await logWhitelistOperation({
                    whitelistId: null,
                    appid,
                    operationType: 'check',
                    operatorId: user.id,
                    operatorType: 'user',
                    status: false,
                    detail: {
                        tags: normalizedTags,
                        error: error.message,
                        reason: '白名单验证过程中发生错误',
                        timestamp: new Date()
                    },
                    ip: clientIp
                });

                console.error('白名单验证错误:', error);
                return res.json({
                    code: 500,
                    message: '白名单验证过程中发生错误'
                });
            }
        });
    } catch (error) {
        await logWhitelistOperation({
            whitelistId: null,
            appid: req.body.appid,
            operationType: 'check',
            operatorId: 0,
            operatorType: 'user',
            status: false,
            detail: {
                tags: customTags || req.body.tag,
                error: error.message,
                reason: '系统内部错误',
                timestamp: new Date()
            },
            ip: clientIp
        });

        console.error('checkWhiteList错误:', error);
        return res.json({
            code: 500,
            message: '服务器内部错误'
        });
    }
}

module.exports = checkWhiteList;
const { Admin } = require('../models/admin');
const { getToken } = require("../global");
const {AdminToken} = require("../models/adminToken");

/**
 * # 根据动态条件查找管理员
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} callback - 回调函数，参数为 (token, admin)
 */
async function findAdminInfo(req, res, callback) {
    try {
        if (!req.headers.authorization) {
            return res.json({
                code: 401,
                message: '管理员未授权'
            });
        }

        const tokenValue = getToken(req.headers.authorization);

        const adminToken = await AdminToken.findOne({
            where: {
                token: tokenValue
            }
        });

        if (!adminToken) {
            return res.json({
                code: 401,
                message: '管理员Token错误'
            });
        }

        const admin = await Admin.findOne({
            where: {
                account: adminToken.account
            }
        });

        if (!admin) {
            return res.json({
                code: 401,
                message: '管理员不存在'
            });
        }

        if (!admin.status) {
            return res.json({
                code: 401,
                message: '管理员账号已被禁用'
            });
        }

        // Call the callback function with token and admin
        callback(adminToken, admin);
    } catch (e) {
        return res.json({
            code: 500,
            message: '服务器错误',
            error: e.message
        });
    }
}

module.exports = { findAdminInfo };

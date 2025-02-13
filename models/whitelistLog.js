const { DataTypes } = require('sequelize');
const { mysql } = require('../database');
const {Whitelist} = require("./whitelist");

const WhitelistLog = mysql.define('WhitelistLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '日志ID'
    },
    whitelistId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: Whitelist,
            key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: '关联的白名单ID，可为空'
    },
    appid: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
            notEmpty: true
        },
        comment: '应用ID'
    },
    operationType: {
        type: DataTypes.ENUM('check', 'add', 'update', 'delete', 'enable', 'disable'),
        allowNull: false,
        validate: {
            notEmpty: true,
            isIn: [['check', 'add', 'update', 'delete', 'enable', 'disable']]
        },
        comment: '操作类型'
    },
    operatorId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 0
        },
        comment: '操作者ID，0表示系统或未知用户'
    },
    operatorType: {
        type: DataTypes.ENUM('user', 'admin', 'system'),
        allowNull: false,
        defaultValue: 'user',
        validate: {
            isIn: [['user', 'admin', 'system']]
        },
        comment: '操作者类型'
    },
    status: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        comment: '操作结果：true成功，false失败'
    },
    detail: {
        type: DataTypes.JSON,
        allowNull: true,
        validate: {
            isValidDetail(value) {
                if (value) {
                    // 确保timestamp存在且为有效日期
                    if (!value.timestamp || isNaN(new Date(value.timestamp).getTime())) {
                        throw new Error('detail.timestamp必须是有效的日期');
                    }
                    // 确保reason存在
                    if (!value.reason) {
                        throw new Error('detail.reason是必需的');
                    }
                }
            }
        },
        comment: '操作详情，包含时间戳、原因等信息'
    },
    ip: {
        type: DataTypes.STRING(50),
        allowNull: true,
        validate: {
            isIP(value) {
                if (value && !require('net').isIP(value)) {
                    throw new Error('无效的IP地址格式');
                }
            }
        },
        comment: '操作IP地址'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '创建时间'
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '更新时间'
    }
}, {
    tableName: 'whitelist_logs',
    indexes: [
        {
            name: 'idx_whitelist_logs_appid',
            fields: ['appid']
        },
        {
            name: 'idx_whitelist_logs_operator',
            fields: ['operatorId', 'operatorType']
        },
        {
            name: 'idx_whitelist_logs_created_at',
            fields: ['createdAt']
        }
    ],
    comment: '白名单操作日志表'
});

// 添加关联
WhitelistLog.belongsTo(Whitelist, {
    foreignKey: 'whitelistId',
    as: 'whitelist'
});

module.exports = {WhitelistLog};

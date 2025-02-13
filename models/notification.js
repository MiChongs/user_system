const { DataTypes } = require('sequelize');
const { mysql } = require('../database');
const { User } = require('./user');
const { App } = require('./app');

const Notification = mysql.define('Notification', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '通知ID'
    },
    appid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: App,
            key: 'id'
        },
        comment: '应用ID'
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: User,
            key: 'id'
        },
        comment: '接收用户ID,为空表示全局通知'
    },
    type: {
        type: DataTypes.ENUM,
        values: [
            'system',      // 系统通知
            'lottery',     // 抽奖通知
            'reward',      // 奖励通知
            'warning',     // 警告通知
            'update',      // 更新通知
            'security'     // 安全通知
        ],
        allowNull: false,
        comment: '通知类型'
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '通知标题'
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '通知内容'
    },
    level: {
        type: DataTypes.ENUM('info', 'success', 'warning', 'error'),
        defaultValue: 'info',
        comment: '通知级别'
    },
    isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否已读'
    },
    readTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '阅读时间'
    },
    expireTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '过期时间'
    },
    data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '附加数据'
    }
}, {
    tableName: 'notifications',
    timestamps: true,
    indexes: [
        {
            fields: ['appid', 'userId', 'isRead']
        },
        {
            fields: ['createdAt']
        }
    ]
});

module.exports = { Notification };
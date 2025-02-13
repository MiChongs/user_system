const {DataTypes} = require('sequelize');
const {mysql} = require('../database');
const dayjs = require('../function/dayjs');
const {User} = require('./user');

const UserLog = mysql.define('UserLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '日志ID'
    },
    appid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '应用ID',
        index: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '用户ID',
        index: true
    },
    type: {
        type: DataTypes.TEXT('tiny'),
        allowNull: false,
        comment: '日志类型',
        validate: {
            isIn: [['login', 'register', 'info_update', 'bind', 'daily_sign',
                'heartbeat', 'custom_id_update', 'password_update', 'email_verify',
                'device_login', 'device_logout', 'status_change', 'vip_change',
                'integral_change', 'user_operation', 'security', 'content_analysis', 'analysis_stats', 'quota_update', 'batch_analysis',
                'lottery_draw', 'lottery_cancel', 'lottery_update', 'lottery_query', 'lottery_reward', 'lottery_notification','analysis_failed','email_verification'
            ]]
        }
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '日志内容'
    },
    details: {
        type: DataTypes.TEXT('medium'),
        allowNull: true,
        comment: '详细信息(JSON)',
        get() {
            const rawValue = this.getDataValue('details');
            return rawValue ? JSON.parse(rawValue) : null;
        },
        set(value) {
            this.setDataValue('details', value ? JSON.stringify(value) : null);
        }
    },
    ip: {
        type: DataTypes.TEXT('tiny'),
        allowNull: true,
        comment: 'IP地址'
    },
    device: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '设备信息'
    },
    location: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'IP地理位置',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci'
    },
    country: {
        type: DataTypes.TEXT('tiny'),
        allowNull: true,
        comment: '国家/地区',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci'
    },
    region: {
        type: DataTypes.TEXT('tiny'),
        allowNull: true,
        comment: '省份/州',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci'
    },
    city: {
        type: DataTypes.TEXT('tiny'),
        allowNull: true,
        comment: '城市',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci'
    },
    district: {
        type: DataTypes.TEXT('tiny'),
        allowNull: true,
        comment: '区县',
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci'
    },
    isp: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '网络服务商'
    },
    coordinates: {
        type: DataTypes.TEXT('tiny'),
        allowNull: true,
        comment: '地理坐标',
        get() {
            const value = this.getDataValue('coordinates');
            return value ? JSON.parse(value) : null;
        },
        set(value) {
            this.setDataValue('coordinates', value ? JSON.stringify(value) : null);
        }
    },
    timezone: {
        type: DataTypes.TEXT('tiny'),
        allowNull: true,
        comment: '时区'
    },
    risk_level: {
        type: DataTypes.ENUM('low', 'medium', 'high'),
        allowNull: true,
        defaultValue: 'low',
        comment: '风险等级'
    },
    status: {
        type: DataTypes.ENUM('success', 'failed', 'blocked'),
        allowNull: false,
        defaultValue: 'success',
        comment: '操作状态'
    },
    error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '错误信息'
    },
    duration: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '操作耗时(ms)'
    },
    user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '浏览器标识'
    },
    platform: {
        type: DataTypes.TEXT('tiny'),
        allowNull: true,
        comment: '操作平台'
    },
    time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '记录时间',
        get() {
            return dayjs(this.getDataValue('time')).format('YYYY-MM-DD HH:mm:ss');
        }
    }
}, {
    tableName: 'user_logs',
    timestamps: false,
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    indexes: [
        {
            fields: ['appid', 'userId'],
            name: 'idx_appid_userid'
        },
        {
            fields: [
                {
                    name: 'type',
                    length: 50
                }
            ],
            name: 'idx_type'
        },
        {
            fields: ['time'],
            name: 'idx_time'
        },
        {
            fields: ['risk_level'],
            name: 'idx_risk_level'
        },
        {
            fields: ['status'],
            name: 'idx_status'
        },
        {
            fields: [
                {
                    name: 'ip',
                    length: 50
                }
            ],
            name: 'idx_ip'
        },
        {
            fields: [
                {
                    name: 'country',
                    length: 50
                },
                {
                    name: 'region',
                    length: 50
                },
                {
                    name: 'city',
                    length: 50
                }
            ],
            name: 'idx_location'
        }
    ]
});
module.exports = {UserLog};
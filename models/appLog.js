const { DataTypes } = require("sequelize");
const { mysql } = require("../database");
const { App } = require("./app");
const dayjs = require('dayjs');

const AppLog = mysql.define('AppLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '日志ID'
    },
    log_type: {
        type: DataTypes.ENUM,
        allowNull: false,
        comment: '日志类型',
        values: [
            // 应用状态相关
            'app_create',
            'app_update',
            'app_delete',
            'app_enable',
            'app_disable',
            
            // 配置变更相关
            'config_update',
            'security_update',
            'email_config_update',
            'register_config_update',
            'login_config_update',
            
            // 功能操作相关
            'splash_create',
            'splash_update',
            'splash_delete',
            'notice_create',
            'notice_update',
            'notice_delete',
            'banner_create',
            'banner_update',
            'banner_delete',
            
            // 用户管理相关
            'user_freeze',
            'user_unfreeze',
            'user_delete',
            'batch_user_operation',
            
            // 其他操作
            'whitelist_update',
            'version_update',
            'card_generate',
            'system_maintenance'
        ]
    },
    log_content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '日志内容'
    },
    log_time: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        comment: '创建时间',
        get() {
            return dayjs(this.getDataValue('log_time')).format('YYYY-MM-DD HH:mm:ss');
        }
    },
    log_ip: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '操作IP'
    },
    log_admin_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '操作管理员ID'
    },
    appid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '应用ID',
        references: {
            model: App,
            key: 'id'
        }
    },
    log_location: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '操作地理位置'
    },
    log_device: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '操作设备'
    },
    log_status: {
        type: DataTypes.ENUM('success', 'failed', 'warning'),
        allowNull: false,
        defaultValue: 'success',
        comment: '操作状态'
    },
    log_details: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '详细信息',
        get() {
            const rawValue = this.getDataValue('log_details');
            return rawValue ? JSON.parse(rawValue) : null;
        },
        set(value) {
            this.setDataValue('log_details', JSON.stringify(value));
        }
    },
    affected_users: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '影响用户数'
    },
    change_summary: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '变更摘要',
        get() {
            const rawValue = this.getDataValue('change_summary');
            return rawValue ? JSON.parse(rawValue) : null;
        },
        set(value) {
            this.setDataValue('change_summary', JSON.stringify(value));
        }
    }
}, {
    tableName: 'app_logs',
    timestamps: false,
    indexes: [
        {
            name: 'idx_app_log_time',
            fields: ['log_time']
        },
        {
            name: 'idx_app_log_type',
            fields: ['log_type']
        },
        {
            name: 'idx_app_log_admin',
            fields: ['log_admin_id']
        },
        {
            name: 'idx_app_log_app',
            fields: ['appid']
        }
    ]
});

module.exports = { AppLog }; 
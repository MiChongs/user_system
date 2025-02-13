const {mysql} = require("../database");
const {DataTypes} = require("sequelize");
const {Admin} = require("./admin");
const dayjs = require('dayjs');


const AdminLog = mysql.define('AdminLog', {
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
            // 账号相关
            'admin_login',
            'admin_logout',
            'admin_register',
            'admin_update',
            'password_change',
            'email_change',
            'profile_update',
            
            // 权限相关
            'permission_grant',
            'permission_revoke',
            'role_assign',
            'role_remove',
            
            // 安全相关
            'enable_2fa',
            'disable_2fa',
            'security_alert',
            'login_failed',
            'password_reset',
            
            // 系统配置
            'system_config',
            'email_config',
            'security_config',
            'backup_config',
            
            // 其他操作
            'create_admin',
            'delete_admin',
            'freeze_admin',
            'unfreeze_admin'
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
        comment: '日志IP'
    },
    log_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '操作管理员ID',
        references: {
            model: Admin,
            key: 'id'
        }
    },
    log_location: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'IP地理位置'
    },
    log_isp: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '网络运营商'
    },
    log_device: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '设备信息'
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
    target_admin_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '被操作的管理员ID',
        references: {
            model: Admin,
            key: 'id'
        }
    },
    session_id: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '会话ID'
    },
    security_level: {
        type: DataTypes.ENUM('low', 'medium', 'high'),
        allowNull: false,
        defaultValue: 'medium',
        comment: '安全等级'
    }
}, {
    tableName: 'admin_logs',
    timestamps: false,
    indexes: [
        {
            name: 'idx_admin_log_time',
            fields: ['log_time']
        },
        {
            name: 'idx_admin_log_type',
            fields: ['log_type']
        },
        {
            name: 'idx_admin_user',
            fields: ['log_user_id']
        },
        {
            name: 'idx_admin_target',
            fields: ['target_admin_id']
        },
        {
            name: 'idx_admin_session',
            fields: ['session_id']
        }
    ]
});

module.exports = {AdminLog}
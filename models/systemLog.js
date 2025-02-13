const { DataTypes } = require("sequelize");
const { mysql } = require("../database");
const dayjs = require('dayjs');

const SystemLog = mysql.define('SystemLog', {
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
            'system_start',
            'system_stop',
            'error',
            'warning',
            'info',
            'maintenance',
            'task_execution',
            'lottery_reward',
            'lottery_notification',
            'lottery_draw',
            'lottery_cancel',
            'lottery_update',
            'lottery_query',
            'nsfw_check',
            'nsfw_check_url',
            'nsfw_check_content',
            'nsfw_check_file',
            'nsfw_check_image',
            'nsfw_check_video',
            'nsfw_check_pdf',
            'nsfw_check_archive',
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
    task_name: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '任务名称'
    },
    execution_time: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: '执行时间（秒）'
    }
}, {
    tableName: 'system_logs',
    timestamps: false,
    indexes: [
        {
            name: 'idx_system_log_time',
            fields: ['log_time']
        },
        {
            name: 'idx_system_log_type',
            fields: ['log_type']
        }
    ]
});

module.exports = { SystemLog }; 
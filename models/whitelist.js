const { DataTypes } = require('sequelize');
const { mysql } = require('../database');

const Whitelist = mysql.define('whitelist', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    appid: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '应用ID',
    },
    value: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: '白名单值'
    },
    type: {
        type: DataTypes.ENUM('user', 'ip', 'device', 'email', 'phone'),
        allowNull: false,
        comment: '白名单类型'
    },
    tags: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        comment: '功能标签'
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: '描述'
    },
    enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
    },
    expireAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '过期时间'
    },
    tagsString: {
        type: DataTypes.VIRTUAL,
        get() {
            const tags = this.getDataValue('tags');
            return Array.isArray(tags) ? JSON.stringify(tags.sort()) : '[]';
        },
        set(value) {
            throw new Error('Do not try to set the `tagsString` value!');
        }
    }
}, {
    tableName: 'whitelist',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['appid', 'value', 'type'],
            name: 'whitelist_unique'
        },
        {
            fields: ['appid'],
            name: 'whitelist_appid'
        },
        {
            fields: ['type'],
            name: 'whitelist_type'
        },
        {
            fields: ['enabled'],
            name: 'whitelist_enabled'
        },
        {
            fields: ['expireAt'],
            name: 'whitelist_expire'
        }
    ]
});

module.exports = {Whitelist};

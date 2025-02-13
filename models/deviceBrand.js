const { DataTypes } = require('sequelize');
const { mysql } = require('../database');

const DeviceBrand = mysql.define('DeviceBrand', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '品牌ID'
    },
    name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '品牌名称'
    },
    name_en: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '品牌英文名'
    },
    logo: {
        type: DataTypes.STRING(255),
        comment: '品牌logo'
    },
    website: {
        type: DataTypes.STRING(255),
        comment: '官网地址'
    },
    description: {
        type: DataTypes.TEXT,
        comment: '品牌描述'
    },
    status: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: '状态'
    },
    sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序'
    }
}, {
    tableName: 'device_brands',
    timestamps: true,
    indexes: [
        {
            name: 'idx_name',
            fields: ['name']
        },
        {
            name: 'idx_status_sort',
            fields: ['status', 'sort_order']
        }
    ]
});

module.exports = { DeviceBrand }; 
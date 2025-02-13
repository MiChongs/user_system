const { DataTypes } = require('sequelize');
const { mysql } = require('../database');
const { DeviceBrand } = require('./deviceBrand');

const DeviceModel = mysql.define('DeviceModel', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: '型号ID'
    },
    brand_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '品牌ID',
        references: {
            model: DeviceBrand,
            key: 'id'
        }
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '型号名称'
    },
    marketing_name: {
        type: DataTypes.STRING(100),
        comment: '营销名称'
    },
    model_number: {
        type: DataTypes.STRING(50),
        comment: '型号编号'
    },
    release_date: {
        type: DataTypes.DATE,
        comment: '发布日期'
    },
    type: {
        type: DataTypes.ENUM('smartphone', 'tablet', 'laptop', 'other'),
        defaultValue: 'smartphone',
        comment: '设备类型'
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
    tableName: 'device_models',
    timestamps: true,
    indexes: [
        {
            name: 'idx_brand_name',
            fields: ['brand_id', 'name']
        },
        {
            name: 'idx_type_status',
            fields: ['type', 'status']
        }
    ]
});

// 建立关联关系
DeviceModel.belongsTo(DeviceBrand, {
    foreignKey: 'brand_id',
    as: 'brand'
});

DeviceBrand.hasMany(DeviceModel, {
    foreignKey: 'brand_id',
    as: 'models'
});

// 添加查询方法
DeviceModel.findByBrand = async function(brandId) {
    return await this.findAll({
        where: { 
            brand_id: brandId,
            status: true 
        },
        include: [{
            model: DeviceBrand,
            as: 'brand',
            where: { status: true }
        }]
    });
};

DeviceModel.findLatestModels = async function(limit = 10) {
    return await this.findAll({
        where: { status: true },
        include: [{
            model: DeviceBrand,
            as: 'brand',
            where: { status: true }
        }],
        order: [
            ['release_date', 'DESC'],
            ['sort_order', 'ASC']
        ],
        limit
    });
};

module.exports = { DeviceModel }; 
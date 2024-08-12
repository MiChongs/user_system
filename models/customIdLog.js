const {mysql} = require("../database");
const {DataTypes} = require("sequelize");
const {User} = require("./user");
const {App} = require("./app");

const CustomIdLog = mysql.define('customIdLog', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: '日志ID'
    }, customId: {
        type: DataTypes.STRING, allowNull: false, comment: '自定义ID'
    }, userId: {
        type: DataTypes.INTEGER, allowNull: false, references: {
            model: User, key: 'id',
        }, comment: '用户ID', onUpdate: 'CASCADE', onDelete: 'CASCADE'
    }, content: {
        type: DataTypes.STRING, allowNull: true, comment: '日志内容'
    }, appid: {
        type: DataTypes.INTEGER, allowNull: true, comment: '应用ID', references: {
            model: App, key: 'id',
        }, onUpdate: 'CASCADE', onDelete: 'CASCADE'
    }, time: {
        type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW, comment: '时间'
    }, userStatus: {
        type: DataTypes.ENUM, values: ['vip', 'normal'], defaultValue: 'normal', allowNull: true, comment: '用户会员状态'
    },
}, {
    timestamps: false,
    freezeTableName: true,
    tableName: 'customIdLog',
    underscored: true,
    charset: 'utf8',
    collate: 'utf8_general_ci',
    indexes: [{
        unique: true, fields: ['id'],
    },],
    comment: '自定义ID日志表',
    getterMethods: {
        customId() {
            return this.getDataValue('customId');
        },
    },
})

module.exports = {CustomIdLog}
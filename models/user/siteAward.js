const {mysql} = require("../../database");
const {DataTypes} = require("sequelize");
const {User} = require("../user");
const {Site} = require("../sites");
const {App} = require("../app");


const SiteAward = mysql.define('siteAward', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, comment: '网站奖励ID'
    }, siteId: {
        type: DataTypes.INTEGER, allowNull: false, comment: '网站ID', references: {
            model: Site, key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE'
        }
    }, userId: {
        type: DataTypes.INTEGER, allowNull: false, comment: '用户ID', references: {
            model: User, key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE'
        }
    }, award: {
        type: DataTypes.ENUM, allowNull: false, values: ['vip', 'integral'], comment: '奖励类型'
    }, awardNum: {
        type: DataTypes.INTEGER, allowNull: false, comment: '奖励数量'
    }, createdAt: {
        type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW, comment: '创建时间'
    }, appid: {
        type: DataTypes.INTEGER, allowNull: false, comment: '应用ID', references: {
            model: App, key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE'
        }
    }
}, {
    tableName: 'site_award', timestamps: false, comment: '网站奖励表'
});

module.exports = {
    SiteAward
}
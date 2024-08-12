const {DataTypes} = require("sequelize");
const {mysql} = require("../../database");
const {User} = require("../user");
const {App} = require("../app");
const {Site} = require("../sites");


const SiteAudit = mysql.define('site_audits', {
    id: {
        type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false, comment: '审核ID',
    }, site_id: {
        type: DataTypes.INTEGER, allowNull: true, comment: '站点ID', references: {
            model: Site, key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
    }, audit_date: {
        type: DataTypes.DATE, allowNull: true,
    }, audit_status: {
        type: DataTypes.ENUM('pass', 'fail', 'wait'), allowNull: true, defaultValue: 'wait',
    }, audit_notes: {
        type: DataTypes.TEXT, defaultValue: '无原因', allowNull: true,
    }, create_at: {
        type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW,
    }, audit_user_id: {
        type: DataTypes.INTEGER, allowNull: true, comment: '审核人ID', references: {
            model: User, key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
    }, userId: {
        type: DataTypes.INTEGER, allowNull: false, comment: '用户ID', references: {
            model: User, key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
    }, appId: {
        type: DataTypes.INTEGER, allowNull: false, comment: '应用ID', references: {
            model: App, key: 'id', onDelete: 'CASCADE', onUpdate: 'CASCADE',
        },
    },
}, {
    timestamps: false,
});

module.exports = {
    SiteAudit
};
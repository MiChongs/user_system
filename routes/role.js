const express = require("express");
const {roleJwt} = require("../middleware/roleJwt");
const roleController = require("../controllers/user/role/roleController");
const {check} = require("express-validator");
const userController = require("../controllers/userController");
const roleRouter = express.Router();

roleRouter.use(roleJwt)

roleRouter.post('/login', [check('appid').notEmpty().withMessage('隶属于应用id不得为空').isInt().withMessage('应用id不符合要求'), check('account').notEmpty().withMessage('用户名不得为空'), check('password').notEmpty().withMessage('密码不得为空').isLength({
    min: 8, max: 24
}).withMessage('密码最少8位，最多24位')], roleController.login)
roleRouter.post('/wait-audit-sites', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], roleController.waitAuditSites)
roleRouter.post('/audit-site', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('id').not().notEmpty().withMessage('站点ID不得为空'), check('status').not().notEmpty().withMessage('审核状态不得为空')], roleController.auditSite)
roleRouter.post('/sites', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空')], roleController.siteList)
roleRouter.post('/delete-site', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('id').not().notEmpty().withMessage('站点ID不得为空')], roleController.deleteSite)
roleRouter.post('/site-detail', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('id').not().notEmpty().withMessage('站点ID不得为空')], roleController.getSiteById)
roleRouter.post('/sites-by-user', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('userId').not().notEmpty().withMessage('用户ID不得为空')], roleController.getSitesByUserId)
roleRouter.post('/update-site', [check('appid').not().notEmpty().withMessage('隶属于应用id不得为空'), check('id').not().notEmpty().withMessage('站点ID不得为空')], roleController.updateSite)
module.exports = roleRouter;
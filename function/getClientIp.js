/**
 * 获取客户端真实IP地址
 * @param {Object} req Express请求对象
 * @returns {string} 客户端IP地址
 */
function getClientIp(req) {
    // 按优先级获取IP
    return req.headers['x-forwarded-for']?.split(',')[0] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress || 
           req.connection.socket?.remoteAddress || 
           '未知IP';
}

module.exports = {
    getClientIp
};

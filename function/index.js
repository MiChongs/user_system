
function getAvatar(url) {
    if (url.indexOf('http') >= 0) {
        return url
    } else {
        return process.env.BASE_SERVER_URL + '/avatars/' + url
    }
}

module.exports = {
    getAvatar
}
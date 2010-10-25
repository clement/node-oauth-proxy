var clutch  = require('clutch'),
    manager = require('./manager'),
    proxy   = require('./proxy');

exports.proxy = clutch.route404([
        ['*', proxy.proxyRequest]
    ]);

exports.manager = clutch.route404([
        ['GET /$', manager.views.list]/*,
        ['* /edit/(\\d+)/$', manager.views.edit],
        ['* /reset/(\\d+)/$', manager.views.resetAuth]*/
    ]);

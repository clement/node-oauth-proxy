var HttpProxy = require('http-proxy').HttpProxy,
    OAuth     = require('./oauth').OAuth,
    querystring = require('querystring'),
    url         = require('url'),
    request     = require('request');

NONE = 1;
AUTHENTICATED = 2;
REQUESTED = 3;

function OauthProxy(req, res, db) {
    HttpProxy.call(this, req, res);

    this.url = url.parse(req.url, true);
    this.req.full_url = this.req.url;
    this.req.url = this.url.pathname + (this.url.search ? this.url.search : '') + (this.url.hash ? this.url.hash : '');
    
    this.db = db;
    this.record = db.get(req.headers['host']);
};

OauthProxy.prototype = {
    proxyRequest: function (port, server) {
        if (this.record) {
            if (this.record.authentication == REQUESTED &&
                    this.url.query && this.url.query.oauthproxycb /**hackish**/) {
                return this.accessToken();
            }
            else if (this.record.authentication == AUTHENTICATED) {
                return this.proxyOauthRequest(port, server);
            }
            else if (this.record.authentication == NONE) {
                return this.requestToken();
            }
        }

        return HttpProxy.prototype.proxyRequest.call(this, port, server);
    },

    proxyOauthRequest: function(port, server) {
        var message = { method: this.req.method, action: this.req.full_url };
        var self = this;

        var end = function () {
            self.req.headers['Authorization'] = self.authorizationHeader(self.completeRequest(message).parameters);
            HttpProxy.prototype.proxyRequest.call(self, port, server);
        };

        if (this.req.headers['Content-Type'] == 'application/x-www-form-urlencoded') {
            // We need to add those parameters to the signature
            var postData = '';
            this.req.addListener('data', function (buf) { postData += buf; });
            this.req.addListener('end', function () {
                    message.parameters = querystring.parse(postData);
                    end();
                });
        }
        else {
            end();
        }
    },

    accessToken: function () {
        // We just need to get an access token
        // TODO check this is the right token we're getting in the QS
        var self = this;
        this.oauthRequest({ method: 'POST',
                            action: this.record.access_full_url,
                            parameters: {
                                oauth_verifier: this.url.query.oauth_verifier
                            }
                          },
                          function (payload) {
                            self.updateRecord({ token: payload.oauth_token,
                                                tokenSecret: payload.oauth_token_secret,
                                                authentication: AUTHENTICATED });
                            // Redirect to the original url, but remove the parameters
                            delete self.url.query.oauth_verifier;
                            delete self.url.query.oauthproxycb;
                            var qs = querystring.stringify(self.url.query),
                                hash = self.url.hash;
                            self.redirect(self.url.pathname + (qs?'?'+qs:'') + (hash?hash:''));
                          });
    },

    requestToken: function () {
        var self = this;
        this.oauthRequest({ method:'POST',
                            action:this.record.request_full_url,
                            parameters: {
                                oauth_callback: OAuth.addToURL(this.req.full_url, {oauthproxycb: 1})
                            }
                          },
                          function (payload) {
                            self.updateRecord({ token: payload.oauth_token,
                                                tokenSecret: payload.oauth_token_secret,
                                                authentication: REQUESTED });
                            self.redirect(OAuth.addToURL(self.record.authorize_full_url, {oauth_token: payload.oauth_token}));
                          });
    },

    oauthRequest: function(message, cb) {
        this.completeRequest(message);
        request({ uri: message.action,
                  method: message.method,
                  headers: {
                    'Authorization': this.authorizationHeader(message.parameters)
                  }
                },
                function (error, response, body) {
                    // TODO: deal with errors
                    body = querystring.parse(body);
                    cb(body);
                });
    },

    completeRequest: function (message) {
        OAuth.completeRequest(message, this.record);
        return message;
    },

    updateRecord: function (up) {
        for (property in up) {
            this.record[property] = up[property];
        }
        this.db.set(this.record.host, this.record);
    },

    authorizationHeader: function (params) {
        return OAuth.getAuthorizationHeader(this.realm, params);
    },

    redirect: function (loc) {
        this.res.writeHead(302, {'Location': loc});
        this.res.end();
    }
};

OauthProxy.prototype.__proto__ = HttpProxy.prototype;


exports.OauthProxy = OauthProxy;
exports.proxyRequest = function (req, res, db) {
    var host = req.headers['host'].split(':');
    (new OauthProxy(req, res, db)).proxyRequest(host[1] ? host[1] : 80, host[0]);
};

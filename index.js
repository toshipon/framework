/**
 * @module Framework
 * @author Peter Širka <petersirka@gmail.com>
 * @copyright Peter Širka 2012-2014
 * @version 1.5.0
 */

'use strict';

var qs = require('querystring');
var os = require('os');

var fs = require('fs');
var zlib = require('zlib');
var path = require('path');
var crypto = require('crypto');
var parser = require('url');
var events = require('events');
var sys = require('sys');
var internal = require('./internal');
var http = require('http');
var directory = process.cwd();
var child = require('child_process');

var ENCODING = 'utf8';
var UNDEFINED = 'undefined';
var STRING = 'string';
var FUNCTION = 'function';
var NUMBER = 'number';
var OBJECT = 'object';
var BOOLEAN = 'boolean';

var REQUEST_COMPRESS_EXTENSION = ['js', 'css', 'txt'];
var EXTENSION_JS = '.js';
var EXTENSION_COFFEE = '.coffee';
var RESPONSE_HEADER_CACHECONTROL = 'Cache-Control';
var RESPONSE_HEADER_CONTENTTYPE = 'Content-Type';
var CONTENTTYPE_TEXTPLAIN = 'text/plain';
var CONTENTTYPE_TEXTHTML = 'text/html';
var REQUEST_COMPRESS_CONTENTTYPE = [CONTENTTYPE_TEXTPLAIN, 'text/javascript', 'text/css', 'application/x-javascript', CONTENTTYPE_TEXTHTML];
var _controller = '';
var _test = '';

global.Builders = global.builders = require('./builders');
var utils = global.Utils = global.utils = require('./utils');
global.Mail = global.MAIL = require('./mail');

global.include = global.INCLUDE = global.source = global.SOURCE = function(name) {
    return framework.source(name);
};

global.MODULE = function(name) {
    return framework.module(name);
};

global.DATABASE = function() {
    return framework.database.apply(framework, arguments);
};

global.CONFIG = function(name) {
    return framework.config[name];
};

global.RESOURCE = function(name, key) {
    return framework.resource(name, key);
};

global.MODEL = function(name) {
    return framework.model(name);
};

if (typeof(setImmediate) === UNDEFINED) {
    global.setImmediate = function(cb) {
        process.nextTick(cb);
    };
}

function Framework() {

    this.id = null;
    this.version = 1502;
    this.version_header = '1.5.2';

    this.versionNode = parseInt(process.version.replace('v', '').replace(/\./g, ''), 10);

    this.handlers = {
        onrequest: this._request.bind(this),
        onxss: this.onXSS.bind(this),
        onupgrade: this._upgrade.bind(this),
        onservice: this._service.bind(this)
    };

    this.config = {

        debug: false,

        name: 'total.js',
        version: '1.01',
        author: '',
        secret: os.hostname() + '-' + os.platform() + '-' + os.arch(),

        'etag-version': '',

        'directory-contents': '/contents/',
        'directory-controllers': '/controllers/',
        'directory-views': '/views/',
        'directory-definitions': '/definitions/',
        'directory-temp': '/tmp/',
        'directory-templates': '/templates/',
        'directory-models': '/models/',
        'directory-resources': '/resources/',
        'directory-public': '/public/',
        'directory-angular': '/app/',
        'directory-modules': '/modules/',
        'directory-source': '/source/',
        'directory-components': '/components/',
        'directory-logs': '/logs/',
        'directory-tests': '/tests/',
        'directory-databases': '/databases/',
        'directory-workers': '/workers/',

        // all HTTP static request are routed to directory-public
        'static-url': '',
        'static-url-js': '/js/',
        'static-url-css': '/css/',
        'static-url-image': '/img/',
        'static-url-video': '/video/',
        'static-url-font': '/font/',
        'static-url-download': '/download/',
        'static-accepts': ['.jpg', '.png', '.gif', '.ico', EXTENSION_JS, EXTENSION_COFFEE, '.css', '.txt', '.xml', '.woff', '.otf', '.ttf', '.eot', '.svg', '.zip', '.rar', '.pdf', '.docx', '.xlsx', '.doc', '.xls', '.html', '.htm', '.appcache', '.map', '.ogg', '.mp4', '.mp3', '.webp', '.webm', '.swf', '.package'],

        // 'static-accepts-custom': [],

        'default-layout': '_layout',

        'angular-version': '1.2.16',
        'angular-i18n-version': '1.2.15',

        // default maximum request size / length
        // default 5 kB
        'default-request-length': 1024 * 5,
        'default-websocket-request-length': 1024 * 5,
        'default-websocket-encodedecode': true,

        // in milliseconds
        'default-request-timeout': 3000,

        // otherwise is used ImageMagick (Heroku supports ImageMagick)
        // gm = graphicsmagick or im = imagemagick
        'default-image-converter': 'gm',
        'default-image-quality': 93,

        'allow-gzip': true,
        'allow-websocket': true,
        'allow-compile-js': true,
        'allow-compile-css': true,
        'allow-compress-html': true,
        'allow-performance': false,
    };

    this.global = {};
    this.resources = {};
    this.connections = {};
    this.functions = {};
    this.versions = null;

    this.isDebug = true;
    this.isTest = false;
    this.isLoaded = false;

    this.routes = {
        web: [],
        files: [],
        websockets: [],
        partial: {},
        partialGlobal: [],
        redirects: {},
        resize: {}
    };

    this.helpers = {};
    this.modules = {};
    this.models = {};
    this.sources = {};
    this.components = {};
    this.controllers = {};
    this.tests = {};
    this.errors = [];
    this.problems = [];
    this.changes = [];
    this.server = null;
    this.port = 0;
    this.ip = '';

    this.workers = {};
    this.databases = {};
    this.directory = directory;
    this.isLE = os.endianness ? os.endianness() === 'LE' : true;
    this.isHTTPS = false;

    this.temporary = {
        path: {},
        processing: {},
        range: {},
        views: {}
    };

    this.stats = {

        request: {
            pending: 0,
            web: 0,
            xhr: 0,
            file: 0,
            websocket: 0,
            get: 0,
            post: 0,
            put: 0,
            upload: 0,
            xss: 0,
            blocked: 0,
            'delete': 0
        },

        response: {
            view: 0,
            json: 0,
            websocket: 0,
            timeout: 0,
            custom: 0,
            binary: 0,
            pipe: 0,
            file: 0,
            destroy: 0,
            stream: 0,
            streaming: 0,
            plain: 0,
            empty: 0,
            redirect: 0,
            forwarding: 0,
            restriction: 0,
            notModified: 0,
            mmr: 0,
            sse: 0,
            error400: 0,
            error401: 0,
            error403: 0,
            error404: 0,
            error408: 0,
            error431: 0,
            error500: 0,
            error501: 0
        }
    };

    // intialize cache
    this.cache = new FrameworkCache(this);
    this.fs = new FrameworkFileSystem(this);
    this.path = new FrameworkPath(this);
    this.restrictions = new FrameworkRestrictions(this);

    this._request_check_redirect = false;
    this._request_check_referer = false;
    this._request_check_POST = false;
    this._length_partial_private = 0;
    this._length_partial_global = 0;
    this._length_files = 0;

    this.isCoffee = false;
    this.isWindows = os.platform().substring(0, 3).toLowerCase() === 'win';

    var self = this;
}

// ======================================================
// PROTOTYPES
// ======================================================

Framework.prototype = {

    get async() {

        var self = this;

        if (typeof(self._async) === UNDEFINED)
            self._async = new utils.Async(self);

        return self._async;
    }
}

Framework.prototype.__proto__ = new events.EventEmitter();

/*
    Refresh framework internal information
    @clear {Boolean} || optional, default true - clear TMP directory
    return {Framework}
*/
Framework.prototype.refresh = function(clear) {
    var self = this;

    self.emit('clear', 'refresh');

    self.resources = {};
    self.databases = {};
    self.configure();
    self.configureMapping();
    self.temporary.path = {};
    self.temporary.range = {};
    self.temporary.views = {};
    self.emit('reconfigure');

    if (clear || true)
        self.clear();

    return self;
};

/*
    Add/Register a new controller
    @name {String}
    @definition {Object} :: optional, controller definition
    return {Framework}
*/
Framework.prototype.controller = function(name, definition) {

    var self = this;

    // is controller initialized?
    if (self.controllers[name])
        return self.controllers[name];

    // get controller name to internal property
    _controller = name;

    var obj = null;

    if (!definition) {

        var filename = path.join(directory, self.config['directory-controllers'], name);
        if (self.isCoffee) {
            if (fs.existsSync(filename + EXTENSION_COFFEE))
                filename += EXTENSION_COFFEE;
            else
                filename += EXTENSION_JS;
        } else
            filename += EXTENSION_JS;

        obj = require(filename);

    } else
        obj = definition();

    self.controllers[name] = obj;

    if (obj.install) {
        obj.install.call(self, self, name);
        return self;
    }

    if (obj.init) {
        obj.init.call(self, self, name);
        return self;
    }

    return self;
};

Framework.prototype._routeSort = function() {

    var self = this;

    self.routes.web.sort(function(a, b) {
        if (a.priority > b.priority)
            return -1;

        if (a.priority < b.priority)
            return 1;

        return 0;
    });

    self.routes.websockets.sort(function(a, b) {
        if (a.priority > b.priority)
            return -1;

        if (a.priority < b.priority)
            return 1;

        return 0;
    });

    return self;
};

/*
    @name {String} :: file name of database
    return {nosql}
*/
Framework.prototype.database = function(name) {

    var self = this;

    var db = self.databases[name];

    if (typeof(db) !== UNDEFINED)
        return db;

    self._verify_directory('databases');

    db = require('./nosql').load(path.join(directory, this.config['directory-databases'], name), path.join(directory, this.config['directory-databases'], name + '-binary'), true);
    self.databases[name] = db;

    return db;
};

/*
    Stop the server and exit
    @code {Number} :: optional, exit code - default 0
    return {Framework}
*/
Framework.prototype.stop = function(code) {
    var self = this;

    if (typeof(process.send) === FUNCTION)
        process.send('stop');

    self.cache.stop();
    self.server.close();

    process.exit(code || 0);
    return self;
};

/**
 * Add a redirect route
 * @param  {String} host Domain with protocol.
 * @param  {String} newHost Domain with protocol.
 * @param  {Boolean} withPath Copy path (default: true).
 * @param  {Boolean} permanent Is permanent redirect (302)? (default: false)
 * @return {Framework}
 */
Framework.prototype.redirect = function(host, newHost, withPath, permanent) {
    var self = this;

    if (host[host.length - 1] === '/')
        host = host.substring(0, host.length - 1);

    if (newHost[newHost.length - 1] === '/')
        newHost = newHost.substring(0, newHost.length - 1);

    self.routes.redirects[host] = {
        url: newHost,
        path: withPath,
        permanent: permanent
    };
    self._request_check_redirect = true;

    return self;
};

/**
 * Auto resize picture according the path
 * @param {String} url Relative path.
 * @param {String} width New width (optional).
 * @param {String} height New height (optional).
 * @param {Object} options Additional options.
 * @param {String Array} ext Allowed file extension (optional).
 * @param {String} path Source directory (optional).
 * @return {Framework}
 */
Framework.prototype.resize = function(url, width, height, options, path, extensions) {
    var self = this;
    var extension = null;
    var index = url.lastIndexOf('.');

    if (index !== -1)
        extension = [url.substring(index)];
    else
        extension = extensions || ['.jpg', '.png', '.gif'];

    var length = extension.length;
    for (var i = 0; i < length; i++)
        extension[i] = (extension[i][0] !== '.' ? '.' : '') + extension[i].toLowerCase();

    index = url.lastIndexOf('/');
    if (index !== -1)
        url = url.substring(0, index);

    if (url[0] !== '/')
        url = '/' + url;

    if (url[url.length - 1] !== '/')
        url += '/';

    path = path || url;

    if (!options)
        options = {};

    self.routes.resize[url] = {
        width: width,
        height: height,
        extension: extension,
        path: path || url,
        grayscale: options.grayscale,
        blur: options.blur,
        rotate: options.rotate,
        flip: options.flip,
        flop: options.flop,
        sepia: options.sepia,
        quality: options.quality
    };

    return self;
};

/**
 * Add a route
 * @param  {String} url
 * @param  {Function} funcExecute Action.
 * @param  {String Array} flags
 * @param  {Number} maximumSize Maximum length of request data.
 * @param  {String Array} partial Loads partial content.
 * @param  {Number timeout Response timeout.
 * @return {Framework}
 */
Framework.prototype.route = function(url, funcExecute, flags, maximumSize, partial, timeout) {

    if (url === '')
        url = '/';

    if (utils.isArray(maximumSize)) {
        var tmp = partial;
        partial = maximumSize;
        maximumSize = tmp;
    }

    if (typeof(funcExecute) === OBJECT || funcExecute instanceof Array) {
        var tmp = funcExecute;
        funcExecute = flags;
        flags = tmp;
    }

    if (!utils.isArray(flags) && typeof(flags) === 'object') {
        maximumSize = flags['max'] || flags['length'] || flags['maximum'] || flags['maximumSize'] || flags['size'];
        partial = flags['partials'] || flags['partial'];
        timeout = flags['timeout'];
        flags = flags['flags'] || flags['flag'];
    }

    var self = this;
    var priority = 0;
    var index = url.indexOf(']');
    var subdomain = null;
    var isASTERIX = url.indexOf('*') !== -1;

    priority = url.count('/');

    if (isASTERIX) {
        url = url.replace('*', '').replace('//', '/');
        priority = (-10) - priority;
    }

    if (index > 0) {
        subdomain = url.substring(1, index).trim().toLowerCase().split(',');
        url = url.substring(index + 1);
        priority += 2;
    }

    var isRaw = false;

    if (flags) {
        var tmp = [];
        for (var i = 0; i < flags.length; i++) {
            var flag = flags[i].toString().toLowerCase();
            switch (flag) {
                case 'raw':
                    isRaw = true;
                    break;
                case 'authorize':
                    priority += 2;
                    tmp.push('authorize');
                    break;
                case 'unauthorize':
                    priority += 2;
                    tmp.push('unauthorize');
                    break;
                case 'logged':
                    priority += 2;
                    tmp.push('authorize');
                    console.log('OBSOLETE: flag "logged" - use "authorize".');
                    break;
                case 'unlogged':
                    tmp.push('unauthorize');
                    console.log('OBSOLETE: flag "unlogged" - use "unauthorize".');
                    break;
                case 'referer':
                case 'referrer':
                    tmp.push('referer');
                    break;
                default:
                    tmp.push(flag);
                    break;
            }
        }
        flags = tmp;
        priority += (flags.length * 2);
    } else
        flags = ['get'];

    var isMixed = flags.indexOf('mmr') !== -1;

    if (isMixed && url.indexOf('{') !== -1)
        throw new Error('Mixed route cannot contain dynamic path.');

    if (isMixed && flags.indexOf('upload') !== -1)
        throw new Error('Multipart mishmash: mmr vs. upload.');

    var isMember = false;

    if (flags.indexOf('logged') === -1 && flags.indexOf('authorize') === -1 && flags.indexOf('unauthorize') === -1)
        isMember = true;

    var routeURL = internal.routeSplit(url.trim());
    var arr = [];

    if (url.indexOf('{') !== -1) {
        routeURL.forEach(function(o, i) {
            if (o.substring(0, 1) === '{')
                arr.push(i);
        });
        priority -= arr.length;
    }

    if (url.indexOf('#') !== -1)
        priority -= 100;

    if (flags.indexOf('proxy') !== -1 && flags.indexOf('json') === -1) {
        flags.push('json');
        priority++;
    }

    if ((flags.indexOf('json') !== -1 || isRaw) && (flags.indexOf('post') === -1 && flags.indexOf('put') === -1) && flags.indexOf('patch') === -1) {
        flags.push('post');
        priority++;
    }

    if (isMixed) {
        if (flags.indexOf('post') === -1 && flags.indexOf('put') === -1 && flags.indexOf('upload') === -1) {
            flags.push('upload');
            priority++
        }
    }

    if (flags.indexOf('get') === -1 &&
        flags.indexOf('options') === -1 &&
        flags.indexOf('post') === -1 &&
        flags.indexOf('delete') === -1 &&
        flags.indexOf('put') === -1 &&
        flags.indexOf('upload') === -1 &&
        flags.indexOf('head') === -1 &&
        flags.indexOf('trace') === -1 &&
        flags.indexOf('patch') === -1 &&
        flags.indexOf('propfind') === -1)
        flags.push('get');

    if (flags.indexOf('referer') !== -1)
        self._request_check_referer = true;

    if (!self._request_check_POST && (flags.indexOf('post') !== -1 || flags.indexOf('put') !== -1 || flags.indexOf('upload') !== -1 || flags.indexOf('mmr') !== -1 || flags.indexOf('json') !== -1 || flags.indexOf('patch') !== -1 || flags.indexOf('options') !== -1))
        self._request_check_POST = true;

    if (!(partial instanceof Array))
        partial = null;

    self.routes.web.push({
        priority: priority,
        subdomain: subdomain,
        name: (_controller || '').length === 0 ? 'unknown' : _controller,
        url: routeURL,
        param: arr,
        flags: flags || [],
        onExecute: funcExecute,
        maximumSize: (maximumSize || self.config['default-request-length']) * 1024,
        partial: partial,
        timeout: timeout || self.config['default-request-timeout'],
        isJSON: flags.indexOf('json') !== -1,
        isRAW: isRaw,
        isMEMBER: isMember,
        isXSS: flags.indexOf('xss') !== -1,
        isASTERIX: isASTERIX
    });

    if (_controller.length === 0)
        self._routeSort();

    return self;
};

/*
    Add a new partial route
    @name {String or Function} :: if @name is function, route will be a global partial content
    @funcExecute {Function} :: optional
    return {Framework}
*/
Framework.prototype.partial = function(name, funcExecute) {
    var self = this;

    if (typeof(name) === FUNCTION) {
        self.routes.partialGlobal.push(name);
        self._length_partial_global = Object.keys(self.routes.partialGlobal).length;
        return self;
    }

    self.routes.partial[name] = funcExecute;
    self._length_partial_private = Object.keys(self.routes.partial).length;

    return self;
};

/*
    Add a new websocket route
    @url {String}
    @funcInitialize {Function}
    @flags {String Array or Object} :: optional
    @protocols {String Array} :: optional, websocket-allow-protocols
    @allow {String Array} :: optional, allow origin
    @maximumSize {Number} :: optional, default by the config
    return {Framework}
*/
Framework.prototype.websocket = function(url, funcInitialize, flags, protocols, allow, maximumSize) {

    if (url === '')
        url = '/';

    if (typeof(funcExecute) === OBJECT) {
        var tmp = flags;
        funcExecute = flags;
        flags = tmp;
    }

    if (!utils.isArray(flags) && typeof(flags) === 'object') {
        protocols = flags['protocols'] || flags['protocol'];
        allow = flags['allow'] || flags['origin'];
        maximumSize = flags['max'] || flags['length'] || flags['maximum'] || flags['maximumSize'];
        flags = flags['flags'];
    }

    var self = this;
    var priority = 0;
    var index = url.indexOf(']');
    var subdomain = null;
    var isASTERIX = url.indexOf('*') !== -1;

    priority = url.count('/');

    if (index > 0) {
        subdomain = url.substring(1, index).trim().toLowerCase().split(',');
        url = url.substring(index + 1);
        priority += 2;
    }

    if (isASTERIX) {
        url = url.replace('*', '').replace('//', '/');
        priority = (-10) - priority;
    }

    var arr = [];
    var routeURL = internal.routeSplit(url.trim());

    if (url.indexOf('{') !== -1) {
        routeURL.forEach(function(o, i) {
            if (o.substring(0, 1) === '{')
                arr.push(i);
        });
        priority -= arr.length;
    }

    if (typeof(allow) === STRING)
        allow = allow[allow];

    if (typeof(protocols) === STRING)
        protocols = protocols[protocols];

    if (typeof(flags) === STRING)
        flags = flags[flags];

    var isJSON = false;
    var isBINARY = false;
    var tmp = [];

    if (typeof(flags) === UNDEFINED)
        flags = [];

    for (var i = 0; i < flags.length; i++) {
        flags[i] = flags[i].toString().toLowerCase();

        if (flags[i] === 'json')
            isJSON = true;

        if (flags[i] === 'binary')
            isBINARY = true;

        if (flags[i] === 'raw') {
            isBINARY = false;
            isJSON = false;
        }

        if (flags[i] !== 'json' && flags[i] !== 'binary' && flags[i] !== 'raw')
            tmp.push(flags[i]);
    }

    flags = tmp;

    priority += (flags.length * 2);

    var isMember = false;

    if (!flags || (flags.indexOf('logged') === -1 && flags.indexOf('authorize') === -1))
        isMember = true;

    self.routes.websockets.push({
        name: (_controller || '').length === 0 ? 'unknown' : _controller,
        url: routeURL,
        param: arr,
        subdomain: subdomain,
        priority: priority,
        flags: flags || [],
        onInitialize: funcInitialize,
        protocols: protocols || [],
        allow: allow || [],
        length: (maximumSize || self.config['default-websocket-request-length']) * 1024,
        isMEMBER: isMember,
        isJSON: isJSON,
        isBINARY: isBINARY,
        isASTERIX: isASTERIX
    });

    if (_controller.length === 0)
        self._routeSort();

    return self;
};

/*
    Alias for routeFile
*/
Framework.prototype.file = function(name, funcValidation, funcExecute) {
    var self = this;
    self.routes.files.push({
        controller: (_controller || '').length === 0 ? 'unknown' : _controller,
        name: name,
        onValidation: funcValidation,
        onExecute: funcExecute || funcValidation
    });
    self._length_files++;
    return self;
};

/*
    Error caller
    @err {Error}
    @name {String} :: controller name
    @uri {URI} :: optional
    return {Framework}
*/
Framework.prototype.error = function(err, name, uri) {
    var self = this;

    if (self.errors !== null) {
        self.errors.push({
            error: err,
            name: name,
            uri: uri,
            date: new Date()
        });

        if (self.errors.length > 50)
            self.errors.shift();
    }

    self.onError(err, name, uri);
    return self;
};

/*
    Problem caller
    @message {String}
    @name {String} :: controller name
    @uri {URI} :: optional
    @ip {String} :: optional
    return {Framework}
*/
Framework.prototype.problem = function(message, name, uri, ip) {
    var self = this;

    if (self.problems !== null) {
        self.problems.push({
            message: message,
            name: name,
            uri: uri,
            ip: ip
        });

        if (self.problems.length > 50)
            self.problems.shift();
    }

    self.emit('problem', message, name, uri, ip);
    return self;
};

/*
    Change caller
    @message {String}
    @name {String} :: controller name
    @uri {URI} :: optional
    @ip {String} :: optional
    return {Framework}
*/
Framework.prototype.change = function(message, name, uri, ip) {
    var self = this;

    if (self.changes !== null) {
        self.changes.push({
            message: message,
            name: name,
            uri: uri,
            ip: ip
        });

        if (self.changes.length > 50)
            self.changes.shift();
    }

    self.emit('change', message, name, uri, ip);
    return self;
};

/*
    Module caller
    @name {String}
    return {Object} :: framework return require();
*/
Framework.prototype.module = function(name) {

    var self = this;
    var module = self.modules[name];

    if (typeof(module) !== UNDEFINED)
        return module;

    if (self.isLoaded)
        return null;

    var configDirectory = self.config['directory-modules'];
    var filename = path.join(directory, configDirectory, name);
    var isDirectory = false;

    if (self.isCoffee) {
        if (fs.existsSync(filename))
            filename += EXTENSION_COFFEE;
        else
            filename += EXTENSION_JS;
    } else
        filename += EXTENSION_JS;

    if (!fs.existsSync(filename)) {

        filename = path.join(directory, configDirectory, name, name);

        if (self.isCoffee) {
            if (fs.existsSync(filename + EXTENSION_COFFEE))
                filename += EXTENSION_COFFEE;
            else
                filename += EXTENSION_JS;
        } else
            filename += EXTENSION_JS;

        if (!fs.existsSync(filename)) {

            filename = path.join(directory, configDirectory, name, 'index');
            if (self.isCoffee) {
                if (fs.existsSync(filename + EXTENSION_COFFEE))
                    filename += EXTENSION_COFFEE;
                else
                    filename += EXTENSION_JS;
            } else
                filename += EXTENSION_JS;

        } else
            module = require(filename);

        if (fs.existsSync(filename))
            module = require(filename);

        isDirectory = true;

    } else
        module = require(filename);

    if (typeof(module) === UNDEFINED)
        return null;

    _controller = '#module-' + name;

    if (module !== null && typeof(module.directory) === UNDEFINED)
        module.directory = isDirectory ? path.join(directory, configDirectory) : path.join(directory, configDirectory, name);

    self.modules[name] = module;
    return module;
};

/*
    Component caller
    @name {String}
    return {Object} :: framework return require();
*/
Framework.prototype.component = function(name) {
    var self = this;
    var component = self.components[name];

    if (typeof(component) !== UNDEFINED)
        return component;

    if (self.isLoaded)
        return null;

    var configDirectory = self.config['directory-components'];
    var filename = path.join(directory, configDirectory, name);
    var isDirectory = false;

    if (self.isCoffee) {
        if (fs.existsSync(filename + EXTENSION_COFFEE))
            filename += EXTENSION_COFFEE;
        else
            filename += EXTENSION_JS;
    } else
        filename += EXTENSION_JS;

    if (!fs.existsSync(filename)) {

        filename = path.join(directory, configDirectory, name, name);

        if (self.isCoffee) {
            if (fs.existsSync(filename + EXTENSION_COFFEE))
                filename += EXTENSION_COFFEE;
            else
                filename += EXTENSION_JS;
        } else
            filename += EXTENSION_JS;

        if (!fs.existsSync(filename)) {

            filename = path.join(directory, configDirectory, name, 'index');

            if (self.isCoffee) {
                if (fs.existsSync(filename + EXTENSION_COFFEE))
                    filename += EXTENSION_COFFEE;
                else
                    filename += EXTENSION_JS;
            } else
                filename += EXTENSION_JS;

            if (fs.existsSync(filename))
                component = require(filename);

        } else
            component = require(filename);

        isDirectory = true;
    } else
        component = require(filename);

    if (typeof(component) === UNDEFINED)
        return null;

    if (component !== null && typeof(component.directory) === UNDEFINED)
        component.directory = isDirectory ? path.join(directory, configDirectory) : path.join(directory, configDirectory, name);

    _controller = '';

    self.components[name] = component;
    if (component.install)
        component.install.call(self, self, name, component.directory);

    if (typeof(component.render) === UNDEFINED)
        throw new Error('Component must contain "export.render" function.');

    return component;
};

/*
    Install/Init modules
    return {Framework}
*/
Framework.prototype.install = function() {

    var self = this;
    var dir = path.join(directory, self.config['directory-controllers']);
    var framework = self;

    function install_controller(directory, level) {
        fs.readdirSync(directory).forEach(function(o) {

            var isDirectory = fs.statSync(path.join(directory, o)).isDirectory();
            if (isDirectory) {
                level++;
                install_controller(path.join(directory, o), level);
                return;
            }

            var ext = path.extname(o).toLowerCase();
            if (ext !== EXTENSION_JS && ext !== EXTENSION_COFFEE)
                return;

            self.controller((level > 0 ? directory.replace(dir, '') + '/' : '') + o.substring(0, o.length - ext.length));
        });
    }

    if (fs.existsSync(dir))
        install_controller(dir, 0);

    dir = path.join(directory, self.config['directory-modules']);

    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(function(o) {

            var ext = path.extname(o);
            var isDirectory = fs.statSync(path.join(dir + o)).isDirectory();
            var extLower = ext.toLowerCase();

            if (!isDirectory && extLower !== EXTENSION_JS && extLower !== EXTENSION_COFFEE)
                return;

            var name = o.replace(ext, '');

            if (name === '#')
                return;

            var module = self.module(name);

            if (module === null || typeof(module.install) === UNDEFINED)
                return;

            try {
                module.install(self, self, name);
            } catch (err) {
                self.error(err, name);
            }
        });
    }

    self._routeSort();

    dir = path.join(directory, self.config['directory-components']);
    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(function(o) {

            var ext = path.extname(o);
            var isDirectory = fs.statSync(path.join(dir + o)).isDirectory();
            var extLower = ext.toLowerCase();

            if (!isDirectory && extLower !== EXTENSION_JS && extLower !== EXTENSION_COFFEE)
                return;

            var name = o.replace(ext, '');

            if (name === '#')
                return;

            self.component(name);
        });
    }

    dir = path.join(directory, self.config['directory-definitions']);

    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(function(o) {
            var ext = path.extname(o).toLowerCase();
            if (ext !== EXTENSION_JS && (ext !== EXTENSION_COFFEE))
                return;
            var data = fs.readFileSync(path.join(dir, o), 'utf8').toString();

            if (self.isCoffee)
                require('coffee-script').eval(data)
            else
                eval(data);
        });
    }

    return self;
};

/*
    Inject configuration from URL
    @url {String}
    @debug {Boolean} :: optional, is debug configuration
    @rewrite {Boolean} :: optional (default true), rewrite all values or append new values only
    return {Framework}
*/
Framework.prototype.injectConfig = function(url, debug, rewrite) {

    var self = this;

    if (typeof(debug) !== UNDEFINED && self.config.debug !== debug)
        return self;

    if (typeof(rewrite) === UNDEFINED)
        rewrite = true;

    utils.request(url, 'GET', '', function(error, data) {

        if (error) {
            self.error(error, 'injectConfig - ' + url, null);
            return;
        }

        self.configure(data.split('\n'), rewrite);

    });

    return self;
};

/*
    Inject versions mapping
    @url {String}
    @rewrite {Boolean} :: optional (default true), rewrite all values or append (+ rewrite old) values (default false)
    return {Framework}
*/
Framework.prototype.injectVersions = function(url, rewrite) {

    var self = this;

    if (typeof(rewrite) === UNDEFINED)
        rewrite = false;

    utils.request(url, 'GET', '', function(error, data) {

        if (error) {
            self.error(error, 'injectVersions - ' + url, null);
            return;
        }

        self.configureMapping(data, rewrite);

    });

    return self;
};

/*
    Inject module from URL
    @name {String} :: name of module
    @url {String}
    return {Framework}
*/
Framework.prototype.injectModule = function(name, url) {

    var self = this;
    var framework = self;

    utils.request(url, 'GET', '', function(error, data) {

        if (error) {
            self.error(error, 'injectModule - ' + name, null);
            return;
        }

        try {
            var result = eval('(new (function(){var module = this;var exports = {};this.exports=exports;' + data + '})).exports');
            _controller = '#module-' + name;

            self.routes.web = self.routes.web.remove(function(route) {
                return route.name === _controller;
            });

            self.routes.files = self.routes.files.remove(function(route) {
                return route.name === _controller;
            });

            self.routes.websockets = self.routes.websockets.remove(function(route) {
                return route.name === _controller;
            });

            if (typeof(result.install) !== UNDEFINED) {
                result.install(self, name);
                self._routeSort();
            }

            self.modules[name] = result;
            _controller = '';

        } catch (ex) {
            self.error(ex, 'injectModule - ' + name, null);
        }
    });

    return self;
};

/*
    Inject model from URL
    @name {String} :: name of model
    @url {String}
    return {Framework}
*/
Framework.prototype.injectModel = function(name, url) {

    var self = this;
    var framework = self;

    utils.request(url, 'GET', '', function(error, data) {

        if (error) {
            self.error(error, 'injectModel - ' + name, null);
            return;
        }

        try {
            var result = eval('(new (function(){var module = this;var exports = {};this.exports=exports;' + data + '})).exports');
            self.models[name] = result;

        } catch (ex) {
            self.error(ex, 'injectModel - ' + name, null);
        }
    });

    return self;
};

/*
    Inject source from URL
    @name {String} :: name of source
    @url {String}
    return {Framework}
*/
Framework.prototype.injectSource = function(name, url) {

    var self = this;
    var framework = self;

    utils.request(url, 'GET', '', function(error, data) {

        if (error) {
            self.error(error, 'injectSource - ' + name, null);
            return;
        }

        try {
            var result = eval('(new (function(){var module = this;var exports = {};this.exports=exports;' + data + '})).exports');
            self.sources[name] = result;

        } catch (ex) {
            self.error(ex, 'injectSource - ' + name, null);
        }
    });

    return self;
};
/*
    Inject controller from URL
    @name {String} :: name of controller
    @url {String}
    return {Framework}
*/
Framework.prototype.injectController = function(name, url) {

    var self = this;

    utils.request(url, 'GET', '', function(error, data) {

        if (error) {
            self.error(error, 'injectController - ' + name, null);
            return;
        }

        try {
            var result = eval('(new (function(framework){var module = this;var exports = {};this.exports=exports;' + data + '})).exports');
            _controller = name;

            self.routes.web = self.routes.web.remove(function(route) {
                return route.name === _controller;
            });

            self.routes.files = self.routes.files.remove(function(route) {
                return route.name === _controller;
            });

            self.routes.websockets = self.routes.websockets.remove(function(route) {
                return route.name === _controller;
            });

            if (typeof(result.install) !== UNDEFINED) {
                result.install(self, name);
                self._routeSort();
            }

            self.controllers[name] = result;
            _controller = '';

        } catch (ex) {
            self.error(ex, 'injectController - ' + name, null);
        }
    });

    return self;
};

/*
    Inject definition from URL
    @url {String}
    return {Framework}
*/
Framework.prototype.injectDefinition = function(url) {

    var self = this;
    var framework = self;

    utils.request(url, 'GET', '', function(error, data) {

        if (error) {
            self.error(error, 'injectDefinition - ' + url, null);
            return;
        }

        try {
            eval(data);
        } catch (ex) {
            self.error(ex, 'injectDefinition - ' + url, null);
        }
    });

    return self;
};

/*
    Inject definition from URL
    @url {String}
    return {Framework}
*/
Framework.prototype.injectComponent = function(name, url) {

    var self = this;
    var framework = self;

    utils.request(url, 'GET', '', function(error, data) {

        if (error) {
            self.error(error, 'injectComponent - ' + name, null);
            return;
        }

        try {
            var result = eval('(new (function(){var module = this;var exports = {};this.exports=exports;' + data + '})).exports');

            if (typeof(result.install) !== UNDEFINED)
                result.install(self, name);

            self.components[name] = result;

        } catch (ex) {
            self.error(ex, 'injectComponent - ' + name, null);
        }
    });

    return self;
};

/**
 * Eval code
 * @see {@link http://docs.totaljs.com/Framework/#framework.eval|Documentation}
 * @param  {String or Function} script Function to eval or Code or URL address.
 * @return {Framework}
 */
Framework.prototype.eval = function(script) {

    var self = this;
    var framework = self;

    if (typeof(script) === FUNCTION) {
        try {
            eval('(' + script.toString() + ')()');
        } catch (ex) {
            self.error(ex, 'eval - ' + script.toString(), null);
        }
        return self;
    }

    if ((script.startsWith('http://', true) || script.startsWith('https://', true)) && scripts.trim().indexOf('\n') === -1) {
        utils.request(script, 'GET', '', function(err, data) {

            if (!err) {
                // recursive calling
                self.eval(data.toString());
                return;
            }
            self.error(err);
        });
    }

    try {
        eval(script);
    } catch (ex) {
        self.error(ex, 'eval - ' + script, null);
    }

    return self;
};

/*
    Error Handler
    @err {Error}
    @name {String} :: name of Controller (optional)
    @uri {Uri} :: optional
*/
Framework.prototype.onError = function(err, name, uri) {
    console.log(err.toString(), err.stack);
    console.log('--------------------------------------------------------------------');
    return this;
};

/*
    Pre-request handler
    @req {ServerRequest}
    @res {ServerResponse}
    return {Boolean}
*/
Framework.prototype.onRequest = null;

/*
    Authorization handler
    @req {ServerRequest}
    @res {ServerResponse} OR {WebSocketClient}
    @flags {String array}
    @callback {Function} - @callback(Boolean), true is [authorize]d and false is [unauthorize]d
*/
Framework.prototype.onAuthorization = null;

/*
    Prefix delegate
    @req {ServerRequest}
    return {String} :: return prefix (default return empty string)
*/
Framework.prototype.onPrefix = null;

/*
    Versioning static files (this delegate call LESS CSS by the background property)
    @name {String} :: name of static file (style.css or script.js)
    return {String} :: return new name of static file (style-new.css or script-new.js)
*/
Framework.prototype.onVersion = null;

/*
    Route validator / Request restriction
    @req {ServerRequest}
    @res {ServerResponse}
    return {Boolean}
*/
Framework.prototype.onRoute = null;

/*
    Global framework validation
    @name {String}
    @value {String}
    return {Boolean or utils.isValid() or StringErrorMessage};
*/
Framework.prototype.onValidation = null;

/**
 * Mail handler
 * @type {Function(address, subject, body, callback)}
 */
Framework.prototype.onMail = function(address, subject, body, callback) {

    var message = Mail.create(subject, body);

    if (address instanceof Array) {
        var length = address.length;
        for (var i = 0; i < length; i++)
            message.to(address[i]);
    } else
        message.to(address);

    var self = this;

    message.from(self.config['mail.address.from'] || '', self.config['name']);

    var tmp = self.config['mail.address.reply'];

    if (tmp && tmp.length > 0 && tmp.isEmail())
        message.reply(self.config['mail.address.reply']);

    tmp = self.config['mail.address.copy'];

    if (tmp && tmp.length > 0 && tmp.isEmail())
        message.bcc(tmp);

    var options = {};
    var opt = self.config['mail.smtp.options'];

    if (opt && opt.isJSON())
        options = JSON.parse(opt);

    message.send(self.config['mail.smtp'], options, callback);

    return self;
};

/*
    Validate request data
    @data {String}
    return {Boolean}
*/
Framework.prototype.onXSS = function(data) {

    if (data === null || data.length === 0)
        return false;

    data = decodeURIComponent(data);
    return (data.indexOf('<') !== -1 && data.lastIndexOf('>') !== -1);
};

/*
    Render HTML for views
    @argument {String params}

    this === controller

    return {String}
*/
Framework.prototype.onMeta = function() {

    var self = this;
    var builder = '';
    var length = arguments.length;

    for (var i = 0; i < length; i++) {

        var arg = utils.encode(arguments[i]);
        if (arg === null || arg.length === 0)
            continue;

        switch (i) {
            case 0:
                builder += '<title>' + (arg + (self.url !== '/' ? ' - ' + self.config['name'] : '')) + '</title>';
                break;
            case 1:
                builder += '<meta name="description" content="' + arg + '" />';
                break;
            case 2:
                builder += '<meta name="keywords" content="' + arg + '" />';
                break;
            case 3:
                var tmp = arg.substring(0, 6);
                var img = tmp === 'http:/' || tmp === 'https:' || arg.substring(0, 2) === '//' ? arg : self.hostname(self.routeImage(arg));
                builder += '<meta property="og:image" content="' + img + '" /><meta name="twitter:image" content="' + img + '" />';
                break;
        }
    }

    return builder;
};

// @arguments {Object params}
Framework.prototype.log = function() {

    var self = this;
    var now = new Date();
    var filename = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padLeft(2, '0') + '-' + now.getDate().toString().padLeft(2, '0');
    var time = now.getHours().toString().padLeft(2, '0') + ':' + now.getMinutes().toString().padLeft(2, '0') + ':' + now.getSeconds().toString().padLeft(2, '0');
    var str = '';
    var length = arguments.length;

    for (var i = 0; i < length; i++)
        str += (str.length > 0 ? ' ' : '') + (arguments[i] || '');

    self._verify_directory('logs');
    fs.appendFile(utils.combine(self.config['directory-logs'], filename + '.log'), time + ' | ' + str + '\n');
    return self;
};

/*
    Return string of framework usage information
    @detailed {Boolean} :: default (false)
    return {String}
*/
Framework.prototype.usage = function(detailed) {
    var self = this;
    var memory = process.memoryUsage();
    var cache = Object.keys(self.cache.repository);
    var resources = Object.keys(self.resources);
    var controllers = Object.keys(self.controllers);
    var connections = Object.keys(self.connections);
    var workers = Object.keys(self.workers);
    var modules = Object.keys(self.modules);
    var models = Object.keys(self.models);
    var components = Object.keys(self.components);
    var helpers = Object.keys(self.helpers);
    var staticFiles = Object.keys(self.temporary.path);
    var staticRange = Object.keys(self.temporary.range);
    var redirects = Object.keys(self.routes.redirects);
    var size = 0;
    var sizeDatabase = 0;
    var dir = utils.combine(self.config['directory-temp']);
    var output = {};

    output.framework = {
        pid: process.pid,
        node: process.version,
        version: 'v' + self.version_header,
        platform: process.platform,
        processor: process.arch,
        uptime: Math.floor(process.uptime() / 60),
        memoryTotal: (memory.heapTotal / 1024 / 1024).floor(2),
        memoryUsage: (memory.heapUsed / 1024 / 1024).floor(2),
        mode: self.config.debug ? 'debug' : 'release',
        port: self.port,
        ip: self.ip,
        directory: process.cwd()
    };

    output.counter = {
        resource: resources.length,
        controller: controllers.length,
        module: modules.length,
        component: components.length,
        cache: cache.length,
        worker: workers.length,
        connection: connections.length,
        helper: helpers.length,
        error: self.errors.length,
        problem: self.problem.length
    };

    output.routing = {
        webpage: self.routes.web.length,
        websocket: self.routes.websockets.length,
        file: self.routes.files.length,
        partial: Object.keys(self.routes.partial).length,
        global: self.routes.partialGlobal.length,
        redirect: redirects.length
    };

    output.stats = {
        request: self.stats.request,
        response: self.stats.response
    };

    output.redirects = redirects;

    if (self.restrictions.isRestrictions) {

        output.restrictions = {
            allowed: [],
            blocked: [],
            allowedHeaders: self.restrictions.allowedCustomKeys,
            blockedHeaders: self.restrictions.blockedCustomKeys
        };
    }

    if (!detailed)
        return output;

    output.controllers = [];

    controllers.forEach(function(o) {
        var item = self.controllers[o];
        output.controllers.push({
            name: o,
            usage: typeof(item.usage) === UNDEFINED ? null : item.usage()
        });
    });

    output.connections = [];

    connections.forEach(function(o) {
        output.connections.push({
            name: o,
            online: self.connections[o].online
        });
    });

    output.modules = [];

    modules.forEach(function(o) {
        var item = self.modules[o];
        output.modules.push({
            name: o,
            usage: typeof(item.usage) === UNDEFINED ? null : item.usage()
        });
    });

    output.components = [];

    components.forEach(function(o) {
        var item = self.components[o];
        output.components.push({
            name: o,
            usage: typeof(item.usage) === UNDEFINED ? null : item.usage()
        });
    });

    output.models = [];

    models.forEach(function(o) {
        var item = self.models[o];
        output.models.push({
            name: o,
            usage: typeof(item.usage) === UNDEFINED ? null : item.usage()
        });
    });

    output.helpers = helpers;
    output.cache = cache;
    output.resources = resources;
    output.errors = self.errors;
    output.problems = self.problems;
    output.changes = self.changes;

    return output;
};

/*
    3rd CSS compiler (Sync)
    @filename {String}
    @content {String} :: Content of CSS file
    return {String}
*/
Framework.prototype.onCompileCSS = null;

/*
    3rd JavaScript compiler (Sync)
    @filename {String}
    @content {String} :: Content of JavaScript file
    return {String}
*/
Framework.prototype.onCompileJS = null;

/*
    Compile JavaScript and CSS
    @req {ServerRequest}
    @filename {String}
    return {String or NULL};
*/
Framework.prototype.compileStatic = function(req, filename) {

    if (!fs.existsSync(filename))
        return null;

    var self = this;
    var index = filename.lastIndexOf('.');
    var ext = filename.substring(index).toLowerCase();
    var output = fs.readFileSync(filename).toString(ENCODING);

    switch (ext) {
        case EXTENSION_JS:
            output = self.config['allow-compile-js'] ? self.onCompileJS === null ? internal.compile_javascript(output, self) : self.onCompileJS(filename, output) : output;
            break;

        case '.css':
            output = self.config['allow-compile-css'] ? self.onCompileCSS === null ? internal.compile_css(output) : self.onCompileCSS(filename, output) : output;
            var matches = output.match(/url\(.*?\)/g);
            if (matches !== null) {
                matches.forEach(function(o) {
                    var url = o.substring(4, o.length - 1);
                    output = output.replace(o, 'url(' + self._version(url) + ')');
                });
            }

            break;
    }

    self._verify_directory('temp');

    var fileCompiled = utils.combine(self.config['directory-temp'], req.uri.pathname.replace(/\//g, '-').substring(1));
    fs.writeFileSync(fileCompiled, output);

    return fileCompiled;
};

/*
    Serve static files
    @req {ServerRequest}
    @res {ServerResponse}
    return {Framework}
*/
Framework.prototype.responseStatic = function(req, res) {

    var self = this;

    if (res.success)
        return self;

    var name = req.url;
    var index = name.indexOf('?');

    if (index !== -1)
        name = name.substring(0, index);

    index = name.lastIndexOf('/');
    var resizer = self.routes.resize[name.substring(0, index + 1)] || null;
    var isResize = false;

    if (resizer !== null) {
        name = name.substring(index + 1);
        index = name.lastIndexOf('.');
        isResize = resizer.extension === '*' || resizer.extension.indexOf(name.substring(index).toLowerCase()) !== -1;
        if (isResize)
            name = resizer.path + name;
    }

    var filename = utils.combine(self.config['directory-public'], decodeURIComponent(name));

    if (!isResize) {
        self.responseFile(req, res, filename, '');
        return self;
    }

    self.responseImage(req, res, filename, function(image) {

        if (resizer.width || resizer.height) {
            if (resizer.width && resizer.height)
                image.resizeCenter(resizer.width, resizer.height);
            else
                image.resize(resizer.width, resizer.height);
        }

        if (resizer.grayscale)
            image.grayscale();

        if (resizer.blur)
            image.blur(typeof(resizer.blur) === 'number' ? resizer.blur : 1);

        if (resizer.rotate && typeof(resizer.rotate) == NUMBER)
            image.rotate(resizer.rotate);

        if (resizer.flop)
            image.flop();

        if (resizer.flip)
            image.flip();

        if (resizer.sepia)
            image.sepia(typeof(resizer.sepia) === 'number' ? resizer.sepia : 100);

        image.quality(self.config['default-image-quality']);
        image.minify();

    });

    return self;
};

/**
 * Is processed static file?
 * @param  {String / Request}  filename Filename or Request object.
 * @return {Boolean}
 */
Framework.prototype.isProcessed = function(filename) {

    var self = this;

    if (filename.url) {
        var name = filename.url;
        var index = name.indexOf('?');

        if (index !== -1)
            name = name.substring(0, index);

        filename = utils.combine(self.config['directory-public'], decodeURIComponent(name));
    }

    if (typeof(self.temporary.path[filename]) !== UNDEFINED)
        return true;

    return false;
};

/**
 * Processing
 * @param  {String / Request}  filename Filename or Request object.
 * @return {Boolean}
 */
Framework.prototype.isProcessing = function(filename) {

    var self = this;

    if (filename.url) {
        var name = filename.url;
        var index = name.indexOf('?');

        if (index !== -1)
            name = name.substring(0, index);

        filename = utils.combine(self.config['directory-public'], decodeURIComponent(name));
    }

    var name = this.temporary.processing[filename];
    if (typeof(self.temporary.processing[filename]) !== UNDEFINED)
        return true;
    return false;
};

/**
 * Disable HTTP cache for current request/response
 * @param  {Request}  req Request
 * @param  {Response} res (optional) Response
 * @return {Framework}
 */
Framework.prototype.noCache = function(req, res) {

    req.noCache();

    if (res)
        res.noCache();

    return this;
};

/*
    Response file
    @req {ServerRequest}
    @res {ServerResponse}
    @filename {String}
    @downloadName {String} :: optional
    @headers {Object} :: optional
    @filepath {String} :: path to file (INTERNAL)
    return {Framework}
*/
Framework.prototype.responseFile = function(req, res, filename, downloadName, headers, key) {

    var self = this;

    if (res.success)
        return self;

    req.clear(true);

    key = key || filename;
    var name = self.temporary.path[key];

    if (framework.config.debug)
        name = undefined;

    if (name === null) {
        self.response404(req, res);
        return self;
    }

    var extension = path.extname(key).substring(1);

    if (extension.length === 0)
        extension = path.extname(name).substring(1);

    if (self.config['static-accepts'].indexOf('.' + extension) === -1) {
        self.response404(req, res);
        return self;
    }

    var etag = utils.etag(req.url, self.config['etag-version']);

    if (!self.config.debug && req.headers['if-none-match'] === etag) {

        res.success = true;
        res.writeHead(304);
        res.end();

        self.stats.response.notModified++;
        self._request_stats(false, req.isStaticFile);

        if (!req.isStaticFile)
            self.emit('request-end', req, res);

        return self;
    }

    if (typeof(name) === UNDEFINED) {

        if (!fs.existsSync(filename)) {

            // virtual directory App
            var tmpname = self.isWindows ? filename.replace(self.config['directory-public'].replace(/\//g, '\\'), self.config['directory-angular'].replace(/\//g, '\\')) : filename.replace(self.config['directory-public'], self.config['directory-angular']);
            var notfound = true;

            if (tmpname !== filename) {
                filename = tmpname;
                notfound = !fs.existsSync(filename);
            }

            if (notfound) {
                self.temporary.path[key] = null;
                self.response404(req, res);
                return self;
            }
        }

        name = filename;

        // compile JavaScript and CSS
        if (extension === 'js' || extension === 'css') {
            if (name.lastIndexOf('.min.') === -1 && name.lastIndexOf('-min.') === -1) {
                name = self.compileStatic(req, name);
                self.temporary.path[key] = name;
            }
        }

        name += ';' + fs.statSync(name).size;

        self.temporary.path[key] = name;

        if (self.config.debug)
            delete self.temporary.path[key];
    }

    var index = name.lastIndexOf(';');
    var size = null;

    if (index === -1)
        index = name.length;
    else
        size = name.substring(index + 1);

    name = name.substring(0, index);

    var accept = req.headers['accept-encoding'] || '';
    var returnHeaders = {};

    returnHeaders['Accept-Ranges'] = 'bytes';
    returnHeaders[RESPONSE_HEADER_CACHECONTROL] = 'public';
    returnHeaders['Expires'] = new Date().add('d', 15);
    returnHeaders['Vary'] = 'Accept-Encoding';

    if (headers)
        utils.extend(returnHeaders, headers, true);

    if (downloadName && downloadName.length > 0)
        returnHeaders['Content-Disposition'] = 'attachment; filename="' + downloadName + '"';

    if (etag.length > 0)
        returnHeaders['Etag'] = etag;

    if (!returnHeaders[RESPONSE_HEADER_CONTENTTYPE])
        returnHeaders[RESPONSE_HEADER_CONTENTTYPE] = utils.getContentType(extension);

    var compress = self.config['allow-gzip'] && REQUEST_COMPRESS_CONTENTTYPE.indexOf(returnHeaders[RESPONSE_HEADER_CONTENTTYPE]) !== -1;
    var range = req.headers['range'] || '';
    var supportsGzip = accept.lastIndexOf('gzip') !== -1;

    res.success = true;

    if (range.length > 0)
        return self.responseRange(name, range, returnHeaders, req, res);

    if (size !== null && size !== '0' && !compress)
        returnHeaders['Content-Length'] = size;

    var stream;

    if (compress && supportsGzip) {

        returnHeaders['Content-Encoding'] = 'gzip';
        res.writeHead(200, returnHeaders);
        stream = fs.createReadStream(name).pipe(zlib.createGzip());
        stream.pipe(res);

        self.stats.response.file++;
        self._request_stats(false, req.isStaticFile);

        if (!req.isStaticFile)
            self.emit('request-end', req, res);

        return self;

    }

    res.writeHead(200, returnHeaders);
    stream = fs.createReadStream(name);
    stream.pipe(res);
    self.stats.response.file++;
    self._request_stats(false, req.isStaticFile);

    if (!req.isStaticFile)
        self.emit('request-end', req, res);

    return self;
};

/*
    Response PIPE
    @req {ServerRequest}
    @res {ServerResponse}
    @url {String}
    @header {Object} :: optional
    @timeout {Number} :: optional
    @callback {Function} :: optional
    return {Framework}
*/
Framework.prototype.responsePipe = function(req, res, url, headers, timeout, callback) {

    var self = this;

    if (res.success)
        return self;

    var uri = parser.parse(url);
    var h = {};

    h[RESPONSE_HEADER_CACHECONTROL] = 'private';

    if (headers)
        utils.extend(h, headers, true);

    h['X-Powered-By'] = 'total.js v' + self.version_header;

    var options = {
        protocol: uri.protocol,
        auth: uri.auth,
        method: 'GET',
        hostname: uri.hostname,
        port: uri.port,
        path: uri.path,
        agent: false,
        headers: h
    };
    var connection = options.protocol === 'https:' ? https : http;
    var supportsGZIP = (req.headers['accept-encoding'] || '').lastIndexOf('gzip') !== -1;

    var client = connection.get(options, function(response) {

        var contentType = response.headers['content-type'];
        var isGZIP = (response.headers['content-encoding'] || '').lastIndexOf('gzip') !== -1;
        var compress = !isGZIP && supportsGZIP && (contentType.indexOf('text/') !== -1 || contentType.lastIndexOf('javascript') !== -1 || contentType.lastIndexOf('json') !== -1);
        var attachment = response.headers['content-disposition'] || '';

        if (attachment.length > 0)
            res.setHeader('Content-Disposition', attachment);

        res.setHeader(RESPONSE_HEADER_CONTENTTYPE, contentType);
        res.setHeader('Vary', 'Accept-Encoding');

        if (compress) {
            res.setHeader('Content-Encoding', 'gzip');
            response.pipe(zlib.createGzip()).pipe(res);
            return;
        }

        if (!supportsGZIP && isGZIP)
            response.pipe(zlib.createGunzip()).pipe(res);
        else
            response.pipe(res);
    });

    if ((timeout || 0) > 0) {
        client.setTimeout(timeout || 3000, function() {
            self.response408(req, res);
            if (callback)
                callback();
        });
    }

    client.on('close', function() {

        if (res.success)
            return;

        req.clear(true);
        res.success = true;

        self.stats.response.pipe++;
        self._request_stats(false, req.isStaticFile);
        res.success = true;

        if (!req.isStaticFile)
            self.emit('request-end', req, res);

        if (callback)
            callback();
    });

    return self;
};

/*
    Response custom
    @req {ServerRequest}
    @res {ServerResponse}
*/
Framework.prototype.responseCustom = function(req, res) {

    var self = this;

    if (res.success)
        return self;

    req.clear(true);
    self.stats.response.custom++;
    res.success = true;
    self._request_stats(false, req.isStaticFile);

    if (!req.isStaticFile)
        self.emit('request-end', req, res);

    return self;
};

/*
    Response image
    @req {ServerRequest}
    @res {ServerResponse}
    @filename {String or Stream}
    @fnProcess {Function} :: function(FrameworkImage) {}
    @headers {Object} :: optional, additional headers
    @useImageMagick {Boolean} :: optional, use ImageMagick (otherwise is used GraphicsMagick), default false
    return {Framework}
*/
Framework.prototype.responseImage = function(req, res, filename, fnProcess, headers, useImageMagick) {

    var self = this;
    var stream = null;

    if (typeof(filename) === OBJECT)
        stream = filename;

    var key = 'image-' + req.url.substring(1);
    var name = self.temporary.path[key];

    if (name === null) {
        self.response404(req, res);
        return self;
    }

    if (typeof(name) !== UNDEFINED) {
        self.responseFile(req, res, filename, '', headers, key);
        return self;
    }

    var im = useImageMagick;
    if (typeof(im) === UNDEFINED)
        im = self.config['default-image-converter'] === 'im';

    if (self.isProcessing(key)) {

        if (req.processing > self.config['default-request-timeout']) {
            // timeout
            self.response408(req, res);
            return;
        }

        req.processing += 500;

        setTimeout(function() {
            self.responseImage(req, res, filename, fnProcess, headers, im);
        }, 500);

        return;
    }

    var Image = require('./image');
    name = self.path.temp(key.replace(/\//g, '-'));

    self.temporary.processing[key] = true;

    // STREAM
    if (stream !== null) {

        fs.exists(name, function(exist) {

            if (exist) {
                delete self.temporary.processing[key];
                self.temporary.path[key] = name;
                self.responseFile(req, res, name, '', headers, key);
                return;
            }

            self._verify_directory('temp');
            var image = Image.load(stream, im);

            fnProcess(image);

            var extension = path.extname(name);
            if (extension.substring(1) !== image.outputType)
                name = name.substring(0, name.lastIndexOf(extension)) + '.' + image.outputType;

            image.save(name, function(err) {

                delete self.temporary.processing[key];

                if (err) {
                    self.temporary.path[key] = null;
                    self.response500(req, res, err);
                    return;
                }

                self.temporary.path[key] = name + ';' + fs.statSync(name).size;
                self.responseFile(req, res, name, '', headers, key);
            });

        });

        return self;
    }

    // FILENAME
    fs.exists(filename, function(exist) {

        if (!exist) {
            delete self.temporary.processing[key];
            self.temporary.path[key] = null;
            self.response404(req, res);
            return;
        }

        self._verify_directory('temp');

        var image = Image.load(filename, im);

        fnProcess(image);

        var extension = path.extname(name);
        if (extension.substring(1) !== image.outputType)
            name = name.substring(0, name.lastIndexOf(extension)) + '.' + image.outputType;

        image.save(name, function(err) {

            delete self.temporary.processing[key];

            if (err) {
                self.temporary.path[key] = null;
                self.response500(req, res, err);
                return;
            }

            self.temporary.path[key] = name + ';' + fs.statSync(name).size;
            self.responseFile(req, res, name, '', headers, key);
        });

    });

    return self;
};

/*
    Response image
    @req {ServerRequest}
    @res {ServerResponse}
    @filename {String or Stream}
    @fnProcess {Function} :: function(FrameworkImage) {}
    @headers {Object} :: optional, additional headers
    @useImageMagick {Boolean} :: optional, use ImageMagick (otherwise is used GraphicsMagick), default false
    return {Framework}
*/
Framework.prototype.responseImageWithoutCache = function(req, res, filename, fnProcess, headers, useImageMagick) {

    var self = this;
    var stream = null;

    if (typeof(filename) === OBJECT)
        stream = filename;

    var key = 'image-' + req.url.substring(1);
    var im = useImageMagick;
    if (typeof(im) === UNDEFINED)
        im = self.config['default-image-converter'] === 'im';


    if (self.isProcessing(key)) {

        if (req.processing > self.config['default-request-timeout']) {
            // timeout
            self.response408(req, res);
            return;
        }

        req.processing += 500;

        setTimeout(function() {
            self.responseImageWithoutCache(req, res, filename, fnProcess, headers, im);
        }, 500);

        return;
    }

    var Image = require('./image');

    // STREAM
    if (stream !== null) {
        var image = Image.load(stream, im);
        fnProcess(image);
        self.responseStream(req, res, utils.getContentType(image.outputType), image.stream(), null, headers);
        return self;
    }

    // FILENAME
    fs.exists(filename, function(exist) {

        if (!exist) {
            self.response404(req, res);
            return;
        }

        self._verify_directory('temp');
        var image = Image.load(filename, im);
        fnProcess(image);
        self.responseStream(req, res, utils.getContentType(image.outputType), image.stream(), null, headers);

    });
    return self;
};

/*
    Response stream
    @req {ServerRequest}
    @res {ServerResponse}
    @contentType {String}
    @stream {ReadStream}
    @downloadName {String} :: optional
    @headers {Object} :: optional
    return {Framework}
*/
Framework.prototype.responseStream = function(req, res, contentType, stream, downloadName, headers) {

    var self = this;

    if (res.success)
        return self;

    req.clear(true);

    if (contentType.lastIndexOf('/') === -1)
        contentType = utils.getContentType(contentType);

    var compress = self.config['allow-gzip'] && REQUEST_COMPRESS_CONTENTTYPE.indexOf(contentType) !== -1;
    var accept = req.headers['accept-encoding'] || '';
    var returnHeaders = {};

    returnHeaders[RESPONSE_HEADER_CACHECONTROL] = 'public';
    returnHeaders['Expires'] = new Date().add('d', 15);
    returnHeaders['Vary'] = 'Accept-Encoding';

    if (headers)
        utils.extend(returnHeaders, headers, true);

    downloadName = downloadName || '';

    if (downloadName.length > 0)
        returnHeaders['Content-Disposition'] = 'attachment; filename=' + encodeURIComponent(downloadName);

    returnHeaders[RESPONSE_HEADER_CONTENTTYPE] = contentType;

    if (compress && accept.lastIndexOf('gzip') !== -1) {

        returnHeaders['Content-Encoding'] = 'gzip';
        res.writeHead(200, returnHeaders);
        var gzip = zlib.createGzip();
        stream.pipe(gzip).pipe(res);

        self.stats.response.stream++;
        self._request_stats(false, req.isStaticFile);

        if (!req.isStaticFile)
            self.emit('request-end', req, res);

        return self;
    }

    res.writeHead(200, returnHeaders);
    stream.pipe(res);

    self.stats.response.stream++;
    self._request_stats(false, req.isStaticFile);

    if (!req.isStaticFile)
        self.emit('request-end', req, res);

    return self;
};

/*
    Internal :: Response Range
    @name {String}
    @range {String}
    @headers {Object}
    @res {ServerResponse}
    @req {ServerRequest}
    return {Framework}
*/
Framework.prototype.responseRange = function(name, range, headers, req, res) {

    var self = this;
    var arr = range.replace(/bytes=/, '').split('-');
    var beg = parseInt(arr[0] || '0', 10);
    var end = parseInt(arr[1] || '0', 10);
    var total = self.temporary.range[name] || 0;

    if (total === 0) {
        // sync
        total = fs.statSync(name).size;
        self.temporary.range[name] = total;
    }

    if (end === 0)
        end = total - 1;

    if (beg > end) {
        beg = 0;
        end = total - 1;
    }

    var length = (end - beg) + 1;

    headers['Content-Length'] = length;
    headers['Content-Range'] = 'bytes ' + beg + '-' + end + '/' + total;

    res.writeHead(206, headers);
    var stream = fs.createReadStream(name, {
        start: beg,
        end: end
    });
    stream.pipe(res);

    self.stats.response.streaming++;
    self._request_stats(false, req.isStaticFile);

    if (!req.isStaticFile)
        self.emit('request-end', req, res);

    return self;
};

/*
    Set last modified header or Etag
    @req {ServerRequest}
    @res {ServerResponse}
    @value {String or Date}

    if @value === {String} set ETag
    if @value === {Date} set LastModified

    return {Controller};
*/
Framework.prototype.setModified = function(req, res, value) {

    var self = this;
    var isEtag = typeof(value) === STRING;

    if (isEtag) {
        res.setHeader('Etag', value + ':' + self.config['etag-version']);
        return self;
    }

    value = value || new Date();
    res.setHeader('Last-Modified', value.toUTCString());

    return self;
};

/*
    Check if ETag or Last Modified has modified
    @req {ServerRequest}
    @res {ServerResponse}
    @compare {String or Date}
    @strict {Boolean} :: if strict then use equal date else use great than date (default: false)

    if @compare === {String} compare if-none-match
    if @compare === {Date} compare if-modified-since

    this method automatically flush response (if not modified)
    --> response 304

    return {Boolean};
*/
Framework.prototype.notModified = function(req, res, compare, strict) {

    var self = this;
    var type = typeof(compare);

    if (type === BOOLEAN) {
        var tmp = compare;
        compare = strict;
        strict = tmp;
        type = typeof(compare);
    }

    var isEtag = type === STRING;

    var val = req.headers[isEtag ? 'if-none-match' : 'if-modified-since'];

    if (isEtag) {

        if (typeof(val) === UNDEFINED)
            return false;

        var myetag = compare + ':' + self.config['etag-version'];

        if (val !== myetag)
            return false;

    } else {

        if (typeof(val) === UNDEFINED)
            return false;

        var date = typeof(compare) === UNDEFINED ? new Date().toUTCString() : compare.toUTCString();


        if (strict) {
            if (new Date(Date.parse(val)) === new Date(date))
                return false;
        } else {
            if (new Date(Date.parse(val)) < new Date(date))
                return false;
        }
    }

    res.success = true;
    res.writeHead(304);
    res.end();

    self.stats.response.notModified++;
    self._request_stats(false, req.isStaticFile);

    if (!req.isStaticFile)
        self.emit('request-end', req, res);

    return true;
};

/*
    Response with 400 error
    @req {ServerRequest}
    @res {ServerResponse}
    return {Framework}
*/
Framework.prototype.response400 = function(req, res) {
    var self = this;

    if (res.success)
        return self;

    self._request_stats(false, req.isStaticFile);
    req.clear(true);

    res.success = true;

    var headers = {};
    var status = 400;
    headers[RESPONSE_HEADER_CONTENTTYPE] = CONTENTTYPE_TEXTPLAIN;
    res.writeHead(status, headers);
    res.end(utils.httpStatus(status));

    if (!req.isStaticFile)
        self.emit('request-end', req, res);

    self.stats.response.error400++;
    return self;
};

/*
    Response with 401 error
    @req {ServerRequest}
    @res {ServerResponse}
    return {Framework}
*/
Framework.prototype.response401 = function(req, res) {
    var self = this;

    if (res.success)
        return self;

    self._request_stats(false, req.isStaticFile);
    req.clear(true);

    res.success = true;
    var headers = {};
    var status = 401;
    headers[RESPONSE_HEADER_CONTENTTYPE] = CONTENTTYPE_TEXTPLAIN;
    res.writeHead(status, headers);
    res.end(utils.httpStatus(status));

    if (!req.isStaticFile)
        self.emit('request-end', req, res);

    self.stats.response.error401++;
    return self;
};

/*
    Response with 403 error
    @req {ServerRequest}
    @res {ServerResponse}
    return {Framework}
*/
Framework.prototype.response403 = function(req, res) {
    var self = this;

    if (res.success)
        return self;

    self._request_stats(false, req.isStaticFile);
    req.clear(true);

    res.success = true;
    var headers = {};
    var status = 403;
    headers[RESPONSE_HEADER_CONTENTTYPE] = CONTENTTYPE_TEXTPLAIN;
    res.writeHead(status, headers);
    res.end(utils.httpStatus(status));

    if (!req.isStaticFile)
        self.emit('request-end', req, res);

    self.stats.response.error403++;
    return self;
};

/*
    Response with 404 error
    @req {ServerRequest}
    @res {ServerResponse}
    return {Framework}
*/
Framework.prototype.response404 = function(req, res) {
    var self = this;

    if (res.success)
        return self;

    self._request_stats(false, req.isStaticFile);
    req.clear(true);

    res.success = true;
    var headers = {};
    var status = 404;
    headers[RESPONSE_HEADER_CONTENTTYPE] = CONTENTTYPE_TEXTPLAIN;
    res.writeHead(status, headers);
    res.end(utils.httpStatus(status));

    if (!req.isStaticFile)
        self.emit('request-end', req, res);

    self.stats.response.error404++;
    return self;
};

/*
    Response with 408 error
    @req {ServerRequest}
    @res {ServerResponse}
    return {Framework}
*/
Framework.prototype.response408 = function(req, res) {
    var self = this;

    if (res.success)
        return self;

    self._request_stats(false, req.isStaticFile);
    req.clear(true);
    res.success = true;

    var headers = {};
    var status = 408;
    headers[RESPONSE_HEADER_CONTENTTYPE] = CONTENTTYPE_TEXTPLAIN;
    res.writeHead(status, headers);
    res.end(utils.httpStatus(status));

    if (!req.isStaticFile)
        self.emit('request-end', req, res);

    self.stats.response.error408++;
    return self;
};

/*
    Response with 431 error
    @req {ServerRequest}
    @res {ServerResponse}
    return {Framework}
*/
Framework.prototype.response431 = function(req, res) {
    var self = this;

    if (res.success)
        return self;

    self._request_stats(false, req.isStaticFile);
    req.clear(true);

    res.success = true;
    var headers = {};
    var status = 431;
    headers[RESPONSE_HEADER_CONTENTTYPE] = CONTENTTYPE_TEXTPLAIN;
    res.writeHead(status, headers);
    res.end(utils.httpStatus(status));

    if (!req.isStaticFile)
        self.emit('request-end', req, res);

    self.stats.response.error431++;
    return self;
};

/*
    Response with 500 error
    @req {ServerRequest}
    @res {ServerResponse}
    @error {Error}
    return {Framework}
*/
Framework.prototype.response500 = function(req, res, error) {
    var self = this;

    if (res.success)
        return self;

    self._request_stats(false, req.isStaticFile);
    req.clear(true);

    if (error)
        framework.error(error, null, req.uri);

    res.success = true;
    var headers = {};
    var status = 500;
    headers[RESPONSE_HEADER_CONTENTTYPE] = CONTENTTYPE_TEXTPLAIN;
    res.writeHead(status, headers);
    res.end(utils.httpStatus(status));

    if (!req.isStaticFile)
        self.emit('request-end', req, res);

    self.stats.response.error500++;
    return self;
};

/*
    Response with 501 error
    @req {ServerRequest}
    @res {ServerResponse}
    return {Framework}
*/
Framework.prototype.response501 = function(req, res) {
    var self = this;

    if (res.success)
        return self;

    self._request_stats(false, req.isStaticFile);
    req.clear(true);
    res.success = true;

    var headers = {};
    var status = 501;
    headers[RESPONSE_HEADER_CONTENTTYPE] = CONTENTTYPE_TEXTPLAIN;
    res.writeHead(status, headers);
    res.end(utils.httpStatus(status));

    if (!req.isStaticFile)
        self.emit('request-end', req, res);

    self.stats.response.error501++;
    return self;
};

/*
    Response content
    @req {ServerRequest}
    @res {ServerResponse}
    @code {Number}
    @contentBody {String}
    @contentType {String}
    @compress {Boolean}
    @headers {Object} :: optional key/value
    return {Framework}
*/
Framework.prototype.responseContent = function(req, res, code, contentBody, contentType, compress, headers) {
    var self = this;

    if (res.success)
        return self;

    req.clear(true);
    res.success = true;

    var accept = req.headers['accept-encoding'] || '';
    var returnHeaders = {};

    returnHeaders[RESPONSE_HEADER_CACHECONTROL] = 'private';
    returnHeaders['Vary'] = 'Accept-Encoding';

    // možnosť odoslať vlastné hlavičky
    if (headers)
        utils.extend(returnHeaders, headers, true);

    // Safari resolve
    if (contentType === 'application/json')
        returnHeaders[RESPONSE_HEADER_CACHECONTROL] = 'private, no-cache, no-store, must-revalidate';

    // pridáme UTF-8 do hlavičky
    if ((/text|application/).test(contentType))
        contentType += '; charset=utf-8';

    returnHeaders[RESPONSE_HEADER_CONTENTTYPE] = contentType;

    if (compress && accept.lastIndexOf('gzip') !== -1) {
        zlib.gzip(new Buffer(contentBody), function(err, data) {

            if (err) {
                res.writeHead(code, returnHeaders);
                res.end(contentBody, ENCODING);
                return;
            }

            returnHeaders['Content-Encoding'] = 'gzip';

            res.writeHead(code, returnHeaders);
            res.end(data, ENCODING);
        });

        self._request_stats(false, req.isStaticFile);

        if (!req.isStaticFile)
            self.emit('request-end', req, res);

        return self;
    }

    res.writeHead(code, returnHeaders);
    res.end(contentBody, ENCODING);

    self._request_stats(false, req.isStaticFile);

    if (!req.isStaticFile)
        self.emit('request-end', req, res);

    return self;
};

/*
    Internal function
    @req {ServerRequest}
    @res {ServerResponse}
    @url {String}
    @permanent {Boolean} :: optional
    return {Framework}
*/
Framework.prototype.responseRedirect = function(req, res, url, permanent) {

    var self = this;

    if (res.success)
        return self;

    self._request_stats(false, req.isStaticFile);

    req.clear(true);
    res.success = true;

    var headers = {
        'Location': url
    };
    headers[RESPONSE_HEADER_CONTENTTYPE] = CONTENTTYPE_TEXTHTML + '; charset=utf-8';

    res.writeHead(permanent ? 301 : 302, headers);
    res.end();

    if (!req.isStaticFile)
        self.emit('request-end', req, res);

    return self;
};

/*
    Initialization
    @http {HTTP or HTTPS}
    @config {Boolean or Object}
    @port {Number}
    @options {Object}
    return {Framework}
*/
Framework.prototype.init = function(http, config, port, ip, options) {

    var self = this;
    self.isHTTPS = typeof(http.STATUS_CODES) === UNDEFINED;

    process.argv.forEach(function(name) {
        if (name.toLowerCase().indexOf('coffee') !== -1)
            self.isCoffee = true;
    });

    if (isNaN(port) && typeof(port) !== STRING)
        port = null;

    if (port !== null && typeof(port) === OBJECT) {
        var tmp = options;
        options = port;
        port = tmp;
    } else if (ip !== null && typeof(ip) === OBJECT) {
        var tmp = options;
        options = ip;
        ip = tmp;
    }

    if (self.server !== null)
        return;

    if (typeof(config) === BOOLEAN)
        self.config.debug = config;
    else if (typeof(config) === OBJECT)
        utils.extend(self.config, config, true);

    self.isDebug = self.config.debug;
    self.configure();
    self.configureMapping();
    self.clear();

    self.cache.init();
    self.install();

    var module = self.module('#');
    if (module !== null) {
        Object.keys(module).forEach(function(o) {
            if (o === 'onLoad' || o === 'usage')
                return;
            self[o] = module[o];
        });
    }

    process.on('uncaughtException', function(e) {
        self.error(e, '', null);

        if (e.toString().indexOf('listen EADDRINUSE') !== -1) {
            if (typeof(process.send) === FUNCTION)
                process.send('stop');
            process.exit(0);
        }
    });

    process.on('SIGTERM', function() {
        self.stop();
    });

    process.on('SIGINT', function() {
        self.stop();
    });

    process.on('exit', function() {

        if (self.onExit)
            self.onExit(self);

        self.emit('exit');
    });

    process.on('message', function(msg, h) {

        if (typeof(msg) !== STRING) {
            self.emit('message', msg, h);
            return;
        }

        if (msg === 'debugging') {
            framework.console();
            framework.console = utils.noop;
            return;
        }

        if (msg === 'reconnect') {
            self.reconnect();
            return;
        }

        if (msg === 'reconfigure') {
            self.configure();
            self.configureMapping();
            self.emit(msg);
            return;
        }

        if (msg === 'reset') {
            self.clear();
            self.cache.clear();
            return;
        }

        if (msg === 'stop' || msg === 'exit') {
            self.stop();
            return;
        }

        self.emit('message', msg, h);
    });

    if (options)
        self.server = http.createServer(options, self.handlers.onrequest);
    else
        self.server = http.createServer(self.handlers.onrequest);

    if (self.config['allow-websocket'])
        self.server.on('upgrade', self.handlers.onupgrade);

    if (!port) {
        if (self.config['default-port'] === 'auto') {
            var envPort = process.env.PORT.toString();
            if (isNaN(envPort))
                port = envPort;
            else
                port = parseInt(envPort);
        } else
            port = self.config['default-port'];
    }

    self.port = port || 8000;

    if (ip !== null) {
        self.ip = ip || self.config['default-ip'] || '127.0.0.1';
        if (self.ip === 'null' || self.ip === 'undefined' || self.ip === 'auto')
            self.ip = undefined;
    } else
        self.ip = undefined;

    self.server.listen(self.port, self.ip);

    if (typeof(self.ip) === UNDEFINED || self.ip === null)
        self.ip = 'auto';

    if (module !== null) {
        if (typeof(module.onLoad) !== UNDEFINED) {
            try {
                module.onLoad.call(self, self);
            } catch (err) {
                self.error(err, '#.onLoad()');
            }
        }
    }

    self.isLoaded = true;

    try {
        self.emit('load', self);
    } catch (err) {
        self.error(err, 'framework.on("load")');
    }

    try {
        self.emit('ready', self);
    } catch (err) {
        self.error(err, 'framework.on("ready")');
    }

    if (!process.connected)
        self.console();

    self.removeAllListeners('load');
    self.removeAllListeners('ready');

    return self;
};

// Alias for framework.init
Framework.prototype.run = function(http, config, port, ip, options) {
    return this.init(http, config, port, ip, options);
};

Framework.prototype.console = function() {
    console.log('====================================================');
    console.log('PID          : ' + process.pid);
    console.log('node.js      : ' + process.version);
    console.log('total.js     : v' + framework.version_header);
    console.log('====================================================');
    console.log('Name         : ' + framework.config.name);
    console.log('Version      : ' + framework.config.version);
    console.log('Author       : ' + framework.config.author);
    console.log('Date         : ' + new Date().format('yyyy-MM-dd HH:mm:ss'));
    console.log('Mode         : ' + (framework.config.debug ? 'debug' : 'release'));
    console.log('====================================================\n');
    console.log('{2}://{0}:{1}/'.format(framework.ip, framework.port, framework.isHTTPS ? 'https' : 'http'));
    console.log('');
};

Framework.prototype.reconnect = function() {
    var self = this;

    if (typeof(self.config['default-port']) !== UNDEFINED)
        self.port = self.config['default-port'];

    if (typeof(self.config['default-ip']) !== UNDEFINED)
        self.ip = self.config['default-ip'];

    self.server.close(function() {
        self.server.listen(self.port, self.ip);
    });

    return self;
};

Framework.prototype._verify_directory = function(name) {

    var self = this;
    var prop = '$directory-' + name;

    if (self.temporary.path[prop])
        return self;

    var dir = utils.combine(self.config['directory-' + name]);

    if (!fs.existsSync(dir))
        fs.mkdirSync(dir);

    self.temporary.path[prop] = true;
    return self;
};

Framework.prototype._upgrade = function(req, socket, head) {

    if (req.headers.upgrade !== 'websocket')
        return;

    var self = this;
    var headers = req.headers;

    self.stats.request.websocket++;

    if (self.restrictions.isRestrictions) {
        if (self.restrictions.isAllowedIP) {
            if (self.restrictions.allowedIP.indexOf(req.ip) === -1) {
                self.stats.response.restriction++;
                req.connection.destroy();
                return self;
            }
        }

        if (self.restrictions.isBlockedIP) {
            if (self.restrictions.blockedIP.indexOf(req.ip) !== -1) {
                self.stats.response.restriction++;
                req.connection.destroy();
                return self;
            }
        }

        if (self.restrictions.isAllowedCustom) {
            if (!self.restrictions._allowedCustom(headers)) {
                self.stats.response.restriction++;
                req.connection.destroy();
                return self;
            }
        }

        if (self.restrictions.isBlockedCustom) {
            if (self.restrictions._blockedCustom(headers)) {
                self.stats.response.restriction++;
                req.connection.destroy();
                return self;
            }
        }
    }

    req.uri = parser.parse('ws://' + req.headers.host + req.url);
    req.data = {
        get: {}
    };

    if (req.uri.query && req.uri.query.length > 0)
        req.data.get = qs.parse(req.uri.query);

    req.session = null;
    req.user = null;
    req.flags = [req.isSecure ? 'https' : 'http'];

    var path = utils.path(req.uri.pathname);
    var websocket = new WebSocketClient(req, socket, head);

    req.path = internal.routeSplit(req.uri.pathname);

    if (self.onAuthorization === null) {
        var route = self.lookup_websocket(req, websocket.uri.pathname, true);

        if (route === null) {
            websocket.close();
            req.connection.destroy();
            return;
        }

        self._upgrade_continue(route, req, websocket, path);
        return;
    }

    self.onAuthorization.call(self, req, websocket, req.flags, function(isLogged, user) {

        if (user)
            req.user = user;

        req.flags.push(isLogged ? 'authorize' : 'unauthorize');

        var route = self.lookup_websocket(req, websocket.uri.pathname, false);

        if (route === null) {
            websocket.close();
            req.connection.destroy();
            return;
        }

        self._upgrade_continue(route, req, websocket, path);
    });

};

Framework.prototype._upgrade_continue = function(route, req, socket, path) {

    var self = this;

    if (!socket.prepare(route.flags, route.protocols, route.allow, route.length, self.version_header)) {
        socket.close();
        req.connection.destroy();
        return;
    }

    var id = path + (route.flags.length > 0 ? '#' + route.flags.join('-') : '');

    if (route.isBINARY)
        socket.type = 1;
    else if (route.isJSON)
        socket.type = 3;

    if (typeof(self.connections[id]) === UNDEFINED) {
        var connection = new WebSocket(self, path, route.name, id);
        self.connections[id] = connection;
        route.onInitialize.apply(connection, internal.routeParam(route.param.length > 0 ? internal.routeSplit(req.uri.pathname, true) : req.path, route));
    }

    socket.upgrade(self.connections[id]);
};

Framework.prototype._service = function(count) {
    var self = this;

    if (self.config.debug)
        self.resources = {};

    // every 20 minute service clears resources
    if (count % 20 === 0) {
        self.emit('clear', 'resources');
        self.resources = {};

        if (typeof(gc) !== UNDEFINED)
            gc();
    }

    // every 3 minute service clears static cache
    if (count % 3 === 0) {
        self.emit('clear', 'temporary', self.temporary);
        self.temporary.path = {};
        self.temporary.range = {};
        self.temporary.views = {};
    }

    self.emit('service', count);
};

Framework.prototype._request = function(req, res) {

    var self = this;

    if (self.config['allow-performance']) {
        req.connection.setNoDelay(true);
        req.connection.setTimeout(0);
    }

    if (self.onRequest !== null && self.onRequest(req, res))
        return;

    res.setHeader('X-Powered-By', 'total.js v' + self.version_header);

    var headers = req.headers;
    var protocol = req.connection.encrypted ? 'https' : 'http';

    if (self._request_check_redirect) {
        var redirect = self.routes.redirects[protocol + '://' + req.host];
        if (redirect) {
            self.stats.response.forwarding++;
            self.responseRedirect(req, res, redirect.url + (redirect.path ? req.url : ''), redirect.permanent);
            return self;
        }
    }

    if (self.restrictions.isRestrictions) {
        if (self.restrictions.isAllowedIP) {
            if (self.restrictions.allowedIP.indexOf(req.ip) === -1) {
                self.stats.response.restriction++;
                req.connection.destroy();
                return self;
            }
        }

        if (self.restrictions.isBlockedIP) {
            if (self.restrictions.blockedIP.indexOf(req.ip) !== -1) {
                self.stats.response.restriction++;
                req.connection.destroy();
                return self;
            }
        }

        if (self.restrictions.isAllowedCustom) {
            if (!self.restrictions._allowedCustom(headers)) {
                self.stats.response.restriction++;
                req.connection.destroy();
                return self;
            }
        }

        if (self.restrictions.isBlockedCustom) {
            if (self.restrictions._blockedCustom(headers)) {
                self.stats.response.restriction++;
                req.connection.destroy();
                return self;
            }
        }
    }

    if (self.config.debug)
        res.setHeader('Mode', 'debug');

    res.success = false;
    req.uri = parser.parse(protocol + '://' + req.host + req.url);
    req.path = internal.routeSplit(req.uri.pathname);
    req.processing = 0;

    // if is static file, return file
    if (utils.isStaticFile(req.uri.pathname)) {

        req.isStaticFile = true;
        self.stats.request.file++;
        self._request_stats(true, true);

        if (self._length_files === 0) {
            self.responseStatic(req, res);
            return;
        }

        new Subscribe(self, req, res, 3).file();
        return;
    }

    req.xhr = headers['x-requested-with'] === 'XMLHttpRequest';
    req.isProxy = headers['x-proxy'] === 'total.js';

    req.data = {
        get: {},
        post: {},
        files: []
    };
    req.flags = null;

    req.buffer_exceeded = false;
    req.buffer_data = '';
    req.buffer_has = false;

    req.session = null;
    req.user = null;
    req.prefix = '';
    req.isAuthorized = true;

    var isXSS = false;
    var accept = headers.accept;

    self._request_stats(true, false);
    self.stats.request.web++;

    if (req.uri.query && req.uri.query.length > 0) {
        if (self.onXSS !== null)
            isXSS = self.onXSS(req.uri.query);
        req.data.get = qs.parse(req.uri.query);
    }

    if (self.onRoute !== null) {
        try {
            if (!self.onRoute(req, res)) {

                if (!res.success) {
                    self._request_stats(false, false);
                    self.stats.request.blocked++;
                    req.connection.destroy();
                }

                return;
            }
        } catch (err) {
            self.response500(req, res, err);
            return;
        }
    }

    var flags = [req.method.toLowerCase()];
    var multipart = req.headers['content-type'] || '';

    flags.push(protocol);

    if (multipart.indexOf('multipart/form-data') === -1) {

        if (multipart.indexOf('application/json') !== -1)
            flags.push('json');

        if (multipart.indexOf('mixed') === -1)
            multipart = '';
        else
            flags.push('mmr');
    }

    if (multipart.length > 0)
        flags.push('upload');

    if (req.isProxy)
        flags.push('proxy');

    if (accept === 'text/event-stream')
        flags.push('sse');

    if (self.config.debug)
        flags.push('debug');

    req.prefix = self.onPrefix === null ? '' : self.onPrefix(req) || '';

    if (req.prefix.length > 0)
        flags.push('#' + req.prefix);

    flags.push('+xhr');

    if (req.xhr) {
        self.stats.request.xhr++;
        flags.push('xhr');
    }

    if (isXSS) {
        flags.push('xss');
        self.stats.request.xss++;
    }

    if (self._request_check_referer) {
        var referer = headers['referer'] || '';
        if (referer !== '' && referer.indexOf(headers['host']) !== -1)
            flags.push('referer');
    }

    req.flags = flags;

    // call event request
    self.emit('request-begin', req, res);

    if (req.method === 'GET' || req.method === 'DELETE' || req.method === 'OPTIONS') {
        if (req.method === 'DELETE')
            self.stats.request['delete']++;
        else
            self.stats.request.get++;

        new Subscribe(self, req, res, 0).end();
        return;
    }

    if (self._request_check_POST && (req.method === 'POST' || req.method === 'PUT')) {
        if (multipart.length > 0) {
            self.stats.request.upload++;
            new Subscribe(self, req, res, 2).multipart(multipart);
        } else {

            if (req.method === 'PUT')
                self.stats.request.put++;
            else
                self.stats.request.post++;

            new Subscribe(self, req, res, 1).urlencoded();
        }
        return;
    }

    self.emit('request-end', req, res);
    self._request_stats(false, false);
    self.stats.request.blocked++;
    req.connection.destroy();
};

Framework.prototype._request_stats = function(beg, isStaticFile) {

    var self = this;

    if (beg)
        self.stats.request.pending++;
    else
        self.stats.request.pending--;

    if (self.stats.request.pending < 0)
        self.stats.request.pending = 0;

    return self;
};

/*
    Get a model
    @name {String}
    return {Object}
*/
Framework.prototype.model = function(name) {
    var self = this;
    var model = self.models[name];

    if (model)
        return model;

    var filename = path.join(directory, self.config['directory-models'], name);

    if (self.isCoffee) {
        if (fs.existsSync(filename + EXTENSION_COFFEE))
            filename += EXTENSION_COFFEE;
        else
            filename += EXTENSION_JS;
    } else
        filename += EXTENSION_JS;

    model = require(filename);
    self.models[name] = model;
    return model;
};

/*
    Get a source
    @name {String}
    return {Object}
*/
Framework.prototype.source = function(name) {
    var self = this;
    var source = self.sources[name];

    if (source)
        return source;

    var filename = path.join(directory, self.config['directory-source'], name);

    if (self.isCoffee) {
        if (fs.existsSync(filename + EXTENSION_COFFEE))
            filename += EXTENSION_COFFEE;
        else
            filename += EXTENSION_JS;
    } else
        filename += EXTENSION_JS;

    source = require(filename);
    self.sources[name] = source;
    return source;
};

/**
 * Add a test function or test request
 * @param  {String}            name     Test name.
 * @param  {Url or Function}   url      Url or Callback function(next, name) {}.
 * @param  {Array}             flags    Routed flags (GET, POST, PUT, XHR, JSON ...).
 * @param  {Function}          callback Callback.
 * @param  {Object or String}  data     Request data.
 * @param  {Object}            cookies  Request cookies.
 * @param  {Object}            headers  Additional headers.
 * @return {Framework}
 */
Framework.prototype.assert = function(name, url, flags, callback, data, cookies, headers) {

    var self = this;

    if (typeof(url) === FUNCTION) {
        self.tests[_test + ': ' + name] = {
            run: url
        };
        return self;
    }

    var method = 'GET';
    var length = 0;
    var isJSON = false;

    headers = utils.extend({}, headers || {});

    if (flags instanceof Array) {
        length = flags.length;
        for (var i = 0; i < length; i++) {

            switch (flags[i].toLowerCase()) {

                case 'xhr':
                    headers['X-Requested-With'] = 'XMLHttpRequest';
                    break;

                case 'json':
                    headers['Content-Type'] = 'application/json';
                    isJSON = true;
                    break;

                case 'get':
                case 'delete':
                case 'options':
                    method = flags[i].toUpperCase();
                    break;

                case 'upload':
                    headers['Content-Type'] = 'multipart/form-data';
                    break;

                case 'post':
                case 'put':

                    method = flags[i].toUpperCase();

                    if (!headers['Content-Type'])
                        headers['Content-Type'] = 'application/x-www-form-urlencoded';

                    break;
            }
        }
    }

    headers['X-Assertion-Testing'] = '1';
    headers['X-Powered-By'] = 'total.js v' + self.version_header;

    if (cookies) {
        var builder = [];
        var keys = Object.keys(cookies);

        length = keys.length;

        for (var i = 0; i < length; i++)
            builder.push(keys[i] + '=' + encodeURIComponent(cookies[keys[i]]));

        if (builder.length > 0)
            headers['Cookie'] = builder.join('; ');
    }

    if (typeof(data) !== STRING)
        data = isJSON ? JSON.stringify(data) : qs.stringify(data);

    if (data && data.length > 0)
        headers['Content-Length'] = data.length;

    var obj = {
        url: url,
        callback: callback,
        method: method,
        data: data || '',
        headers: headers
    };

    self.tests[_test + ': ' + name] = obj;
    return self;
};

/**
 * Test in progress
 * @private
 * @param  {Boolean}   stop     Stop application.
 * @param  {Function}  callback Callback.
 * @return {Framework}
 */
Framework.prototype.testing = function(stop, callback) {

    if (typeof(stop) === UNDEFINED)
        stop = true;

    var self = this;
    var keys = Object.keys(self.tests);

    if (keys.length === 0) {

        if (callback)
            callback();

        if (stop)
            self.stop();

        return self;
    }

    var key = keys[0];
    var test = self.tests[key];
    var caption = 'Success .............. ' + key;

    delete self.tests[key];

    if (test.run) {

        try {
            test.run.call(self, function() {
                console.log(caption);
                self.testing(stop, callback);
            }, key);
        } catch (e) {
            setTimeout(function() {
                self.stop(1);
            }, 500);
            throw e;
        }
        return self;
    }

    var response = function(res) {

        res._buffer = '';

        res.on('data', function(chunk) {
            this._buffer += chunk.toString(ENCODING);
        });

        res.on('end', function() {

            var cookie = res.headers['cookie'] || '';
            var cookies = {};

            if (cookie.length !== 0) {

                var arr = cookie.split(';');
                var length = arr.length;

                for (var i = 0; i < length; i++) {
                    var c = arr[i].trim().split('=');
                    cookies[c.shift()] = unescape(c.join('='));
                }
            }

            try {
                test.callback(null, res._buffer, res.statusCode, res.headers, cookies, key);
                console.log(caption);
                self.testing(stop, callback);
            } catch (e) {
                setTimeout(function() {
                    self.stop(1);
                }, 500);
                throw e;
            }
        });

        res.resume();
    };

    var options = parser.parse((test.url.indexOf('http://') > 0 || test.url.indexOf('https://') > 0 ? '' : 'http://' + self.ip + ':' + self.port) + test.url);
    var con = options.protocol === 'https:' ? https : http;
    var req = test.method === 'POST' || test.method === 'PUT' ? con.request(options, response) : con.get(options, response);

    req.on('error', function(error) {

        setTimeout(function() {
            self.stop(1);
        }, 500);

        throw error;
    });

    if (test.data.length > 0)
        req.end(test.data, ENCODING);
    else
        req.end();

    return self;
};

/*
    Make a tests
    @stop {Boolean} :: stop framework (default true)
    @names {String array} :: only tests in names (optional)
    @callback {Functions} :: on complete test handler (optional)
    return {Framework}
*/
Framework.prototype.test = function(stop, names, cb) {

    var self = this;

    if (typeof(names) === FUNCTION) {
        cb = names;
        names = [];
    } else
        names = names || [];

    var counter = 0;
    self.isTest = true;

    var dir = self.config['directory-tests'];

    if (!fs.existsSync(utils.combine(dir))) {
        if (cb) cb();
        if (stop) setTimeout(function() {
            framework.stop(1);
        }, 500);
        return self;
    }

    fs.readdirSync(utils.combine(dir)).forEach(function(name) {

        var filename = path.join(directory, dir, name);
        var ext = path.extname(filename).toLowerCase();

        if (ext !== EXTENSION_JS && ext !== EXTENSION_COFFEE)
            return;

        if (names.length > 0 && names.indexOf(name.substring(0, name.length - 3)) === -1)
            return;

        var test = require(filename);

        try {
            var isRun = typeof(test.run) !== UNDEFINED;
            var isInstall = typeof(test.isInstall) !== UNDEFINED;
            var isInit = typeof(test.init) !== UNDEFINED;
            var isLoad = typeof(test.load) !== UNDEFINED;

            _test = name;

            if (isRun)
                test.run(self, name);
            else if (isInstall)
                test.install(self, name);
            else if (isInit)
                test.init(self, name);
            else if (isLoad)
                test.load(self, name);

            counter++;

        } catch (ex) {
            setTimeout(function() {
                framework.stop(1);
            }, 500);
            throw ex;
        }
    });

    _test = '';

    if (counter === 0) {
        if (cb) cb();
        if (stop) setTimeout(function() {
            framework.stop(1);
        }, 500);
        return self;
    }

    setTimeout(function() {
        console.log('====== TESTING ======');
        console.log('');
        self.testing(stop, function() {
            self.isTest = false;
            if (cb)
                cb();
        });
    }, 100);

    return self;
};

/*
    Clear temporary directory
    return {Framework}
*/
Framework.prototype.clear = function() {

    var self = this;
    var dir = utils.combine(self.config['directory-temp']);

    if (!fs.existsSync(dir))
        return self;

    fs.readdir(dir, function(err, files) {
        if (err)
            return;

        var arr = [];
        var length = files.length;
        for (var i = 0; i < length; i++)
            arr.push(utils.combine(self.config['directory-temp'], files[i]));

        self.unlink(arr);
    });

    // clear static cache
    self.temporary.path = {};
    self.temporary.range = {};
    return self;
};

/*
    INTERNAL: Force remove files
    return {Framework}
*/
Framework.prototype.unlink = function(arr, callback) {
    var self = this;

    if (typeof(arr) === STRING)
        arr = [arr];

    if (arr.length === 0) {
        if (callback)
            callback();
        return;
    }

    var filename = arr.shift();
    if (!filename) {
        if (callback)
            callback();
        return;
    }

    fs.unlink(filename, function() {
        self.unlink(arr, callback);
    });

    return self;
};

/*
    Cryptography (encrypt)
    @value {String}
    @key {String}
    @isUniqe {Boolean} :: optional, default true
    return {String}
*/
Framework.prototype.encrypt = function(value, key, isUnique) {

    var self = this;
    var type = typeof(value);

    if (type === UNDEFINED)
        return '';

    if (typeof(key) === BOOLEAN) {
        var tmp = isUnique;
        isUnique = key;
        key = tmp;
    }

    if (type === FUNCTION)
        value = value();

    if (type === NUMBER)
        value = value.toString();

    if (type === OBJECT)
        value = JSON.stringify(value);

    return value.encrypt(self.config.secret + '=' + key, isUnique);
};

/*
    Cryptography (decrypt)
    @value {String}
    @key {String}
    @jsonConvert {Boolean} :: optional (convert string to JSON)
    return {String or Object}
*/
Framework.prototype.decrypt = function(value, key, jsonConvert) {

    if (typeof(key) === BOOLEAN) {
        var tmp = jsonConvert;
        jsonConvert = key;
        key = tmp;
    }

    if (typeof(jsonConvert) !== BOOLEAN)
        jsonConvert = true;

    var self = this;
    var result = (value || '').decrypt(self.config.secret + '=' + key);

    if (result === null)
        return null;

    if (jsonConvert) {
        if (result.isJSON())
            return JSON.parse(result);
        return null;
    }

    return result;
};

/*
    Hash value
    @type {String} :: sha1, sha256, sha512, md5
    @value {Object}
    @salt {String or Boolean} :: custom salt {String} or secret as salt {undefined or Boolean}
    return {String}
*/
Framework.prototype.hash = function(type, value, salt) {
    var hash = crypto.createHash(type);
    var plus = '';

    if (typeof(salt) === STRING)
        plus = salt;
    else if (salt !== false)
        plus = (this.config.secret || '');

    hash.update(value.toString() + plus, ENCODING);
    return hash.digest('hex');
};

/*
    Resource reader
    @name {String} :: filename of resource
    @key {String}
    return {String}
*/
Framework.prototype.resource = function(name, key) {

    if (typeof(key) === UNDEFINED || name.length === 0) {
        key = name;
        name = 'default';
    }

    var self = this;
    var res = self.resources[name];

    if (typeof(res) !== UNDEFINED)
        return res[key];

    var fileName = utils.combine(self.config['directory-resources'], name + '.resource');

    if (!fs.existsSync(fileName))
        return '';

    var obj = fs.readFileSync(fileName).toString(ENCODING).configuration();
    self.resources[name] = obj;
    return obj[key] || '';
};

Framework.prototype.configureMapping = function(content, rewrite) {

    var self = this;
    var filename = utils.combine('/', 'versions');

    if (typeof(rewrite) === UNDEFINED)
        rewrite = true;

    if (!fs.existsSync(filename)) {
        self.versions = null;
        return;
    }

    content = (typeof(content) !== STRING ? fs.readFileSync(filename).toString(ENCODING) : content);

    if (content.length === 0) {
        self.versions = null;
        return self;
    }

    var mapping = content.configuration();
    var arr = Object.keys(mapping);

    if (rewrite) {
        self.versions = arr.length === 0 ? null : mapping;
        return self;
    }

    if (arr.length === 0)
        return self;

    if (self.versions === null)
        self.versions = {};

    var length = arr.length;

    for (var i = 0; i < length; i++) {
        var key = arr[i];
        self.versions[key] = mapping[key];
    }

    return self;
};

/*
    INTERNAL: Framework configure
    @arr {String Array or String (filename)} :: optional
    @rewrite {Boolean} :: optional, default true
    return {Framework}
*/
Framework.prototype.configure = function(arr, rewrite) {

    var self = this;
    var type = typeof(arr);

    if (type === STRING) {
        var filename = utils.combine('/', arr);
        if (!fs.existsSync(filename))
            return self;
        arr = fs.readFileSync(filename).toString(ENCODING).split('\n');
    }

    if (type === UNDEFINED) {

        var filenameA = utils.combine('/', 'config');
        var filenameB = utils.combine('/', 'config-' + (self.config.debug ? 'debug' : 'release'));

        arr = [];

        if (fs.existsSync(filenameA) && fs.lstatSync(filenameA).isFile())
            arr = arr.concat(fs.readFileSync(filenameA).toString(ENCODING).split('\n'));

        if (fs.existsSync(filenameB) && fs.lstatSync(filenameB).isFile())
            arr = arr.concat(fs.readFileSync(filenameB).toString(ENCODING).split('\n'));
    }

    if (!arr instanceof Array)
        return self;

    if (arr.length === 0)
        return self;

    if (typeof(rewrite) === UNDEFINED)
        rewrite = true;

    var obj = {};
    var accepts = null;
    var length = arr.length;

    for (var i = 0; i < length; i++) {
        var str = arr[i];

        if (str === '' || str[0] === '#' || (str[0] === '/' || str[1] === '/'))
            continue;

        var index = str.indexOf(':');
        if (index === -1)
            continue;

        var name = str.substring(0, index).trim();

        if (name === 'debug' || name === 'resources')
            continue;

        var value = str.substring(index + 1).trim();

        switch (name) {
            case 'default-request-length':
            case 'default-websocket-request-length':
            case 'default-request-timeout':
                obj[name] = utils.parseInt(value);
                break;
            case 'static-accepts-custom':
                accepts = value.replace(/\s/g, '').split(',');
                break;
            case 'static-accepts':
                obj[name] = value.replace(/\s/g, '').split(',');
                break;
            case 'default-websocket-encodedecode':
            case 'allow-gzip':
            case 'allow-websocket':
            case 'allow-compile-css':
            case 'allow-compile-js':
                obj[name] = value.toLowerCase() === 'true' || value === '1';
                break;
            case 'version':
                obj[name] = value;
                break;
            default:
                obj[name] = value.isNumber() ? utils.parseInt(value) : value.isNumber(true) ? utils.parseFloat(value) : value.isBoolean() ? value.toLowerCase() === 'true' : value;
                break;
        }
    }

    utils.extend(self.config, obj, rewrite);

    if (self.config['etag-version'] === '')
        self.config['etag-version'] = self.config.version.replace(/\.|\s/g, '');

    process.title = 'total: ' + self.config.name.removeDiacritics().toLowerCase().replace(/\s/g, '-').substring(0, 8);

    if (accepts !== null && accepts.length > 0) {
        accepts.forEach(function(accept) {
            if (self.config['static-accepts'].indexOf(accept) === -1)
                self.config['static-accepts'].push(accept);
        });
    }

    if (self.config['allow-performance'])
        http.globalAgent.maxSockets = 9999;

    self.emit('configure', self.config);
    return self;
};

/*
    Static file routing
    @name {String} :: filename
    return {String}
*/
Framework.prototype.routeJS = function(name) {
    var self = this;

    if (name.lastIndexOf(EXTENSION_JS) === -1)
        name += EXTENSION_JS;

    return self._routeStatic(name, self.config['static-url-js']);
};

/*
    Static file routing
    @name {String} :: filename
    return {String}
*/
Framework.prototype.routeCSS = function(name) {
    var self = this;

    if (name.lastIndexOf('.css') === -1)
        name += '.css';

    return self._routeStatic(name, self.config['static-url-css']);
};

/*
    Static file routing
    @name {String} :: filename
    return {String}
*/
Framework.prototype.routeImage = function(name) {
    var self = this;
    return self._routeStatic(name, self.config['static-url-image']);
};

/*
    Static file routing
    @name {String} :: filename
    return {String}
*/
Framework.prototype.routeVideo = function(name) {
    var self = this;
    return self._routeStatic(name, self.config['static-url-video']);
};

/*
    Static file routing
    @name {String} :: filename
    return {String}
*/
Framework.prototype.routeFont = function(name) {
    var self = this;
    return self._routeStatic(name, self.config['static-url-font']);
};

/*
    Static file routing
    @name {String} :: filename
    return {String}
*/
Framework.prototype.routeDownload = function(name) {
    var self = this;
    return self._routeStatic(name, self.config['static-url-download']);
};

/*
    Static file routing
    @name {String} :: filename
    return {String}
*/
Framework.prototype.routeStatic = function(name) {
    var self = this;
    return self._routeStatic(name, self.config['static-url']);
};

/*
    Internal static file routing
    @name {String} :: filename
    @directory {String} :: directory
    return {String}
*/
Framework.prototype._routeStatic = function(name, directory) {
    return directory + this._version(name);
};

/*
    Internal mapping function
    @name {String} :: filename
    return {String}
*/
Framework.prototype._version = function(name) {
    var self = this;

    if (self.versions !== null)
        name = self.versions[name] || name;

    if (self.onVersion !== null)
        name = self.onVersion(name) || name;

    return name;
};

/*
    Internal function
    @req {HttpRequest}
    @url {String}
    @flags {String Array}
    @noLoggedUnlogged {Boolean} :: optional, default false
    return {ControllerRoute}
*/
Framework.prototype.lookup = function(req, url, flags, noLoggedUnlogged) {

    var self = this;
    var isSystem = url[0] === '#';

    if (isSystem)
        req.path = [url];

    var subdomain = req.subdomain === null ? null : req.subdomain.join('.');
    var length = self.routes.web.length;

    for (var i = 0; i < length; i++) {

        var route = self.routes.web[i];

        if (!internal.routeCompareSubdomain(subdomain, route.subdomain))
            continue;

        if (route.isASTERIX) {
            if (!internal.routeCompare(req.path, route.url, isSystem, true))
                continue;
        } else {
            if (!internal.routeCompare(req.path, route.url, isSystem))
                continue;
        }

        if (isSystem)
            return route;

        if (route.flags !== null && route.flags.length > 0) {

            var result = internal.routeCompareFlags(flags, route.flags, noLoggedUnlogged ? true : route.isMEMBER);
            if (result === -1)
                req.isAuthorized = false;

            if (result < 1)
                continue;

        } else {

            if (flags.indexOf('xss') !== -1)
                continue;
        }

        return route;
    }

    return null;
};

/*
    Internal function
    @req {HttpRequest}
    @url {String}
    return {WebSocketRoute}
*/
Framework.prototype.lookup_websocket = function(req, url, noLoggedUnlogged) {

    var self = this;
    var subdomain = req.subdomain === null ? null : req.subdomain.join('.');
    var length = self.routes.websockets.length;

    for (var i = 0; i < length; i++) {

        var route = self.routes.websockets[i];

        if (!internal.routeCompareSubdomain(subdomain, route.subdomain))
            continue;

        if (route.isASTERIX) {
            if (!internal.routeCompare(req.path, route.url, false, true))
                continue;
        } else {
            if (!internal.routeCompare(req.path, route.url, false))
                continue;
        }

        if (route.flags !== null && route.flags.length > 0) {

            var result = internal.routeCompareFlags(req.flags, route.flags, noLoggedUnlogged ? true : route.isMEMBER);

            if (result === -1)
                req.isAuthorized = false;

            if (result < 1)
                continue;

        }

        return route;
    }

    return null;
};

/*
    Accepts file
    @extension {String}
    @contentType {String} :: optional
    return {Framework}
*/
Framework.prototype.accepts = function(extension, contentType) {

    var self = this;

    if (extension[0] !== '.')
        extension = '.' + extension;

    if (self.config['static-accepts'].indexOf(extension) === -1)
        self.config['static-accepts'].push(extension);

    if (contentType)
        utils.setContentType(extension, contentType);

    return self;
};

/*
    @name {String}
    @id {String} :: optional, Id of process
    @timeout {Number} :: optional, timeout - default undefined (none)
    return {Worker(fork)}
*/
Framework.prototype.worker = function(name, id, timeout) {

    var self = this;
    var fork = null;
    var type = typeof(id);

    if (type === NUMBER && typeof(timeout) === UNDEFINED) {
        timeout = id;
        id = null;
        type = UNDEFINED;
    }

    if (type === STRING)
        fork = self.workers[id] || null;

    if (fork !== null)
        return fork;

    var filename = utils.combine(self.config['directory-workers'], name);

    if (self.isCoffee) {
        if (fs.existsSync(filename + EXTENSION_COFFEE))
            filename += EXTENSION_COFFEE;
        else
            filename += EXTENSION_JS;
    } else
        filename += EXTENSION_JS;

    fork = child.fork(filename, {
        cwd: directory
    });
    id = name + '_' + new Date().getTime();
    fork.__id = id;
    self.workers[id] = fork;

    fork.on('exit', function() {
        var self = this;
        if (self.__timeout)
            clearTimeout(self.__timeout);

        delete framework.workers[self.__id];
    });

    if (typeof(timeout) !== NUMBER)
        return fork;

    fork.__timeout = setTimeout(function() {

        fork.kill();
        fork = null;

    }, timeout);

    return fork;
};

// *********************************************************************************
// =================================================================================
// Framework Restrictions
// 1.01
// =================================================================================
// *********************************************************************************

function FrameworkRestrictions(framework) {
    this.framework = framework;
    this.isRestrictions = false;
    this.isAllowedIP = false;
    this.isBlockedIP = false;
    this.isAllowedCustom = false;
    this.isBlockedCustom = false;
    this.allowedIP = [];
    this.blockedIP = [];
    this.allowedCustom = {};
    this.blockedCustom = {};
    this.allowedCustomKeys = [];
    this.blockedCustomKeys = [];
};

/*
    Allow IP or custom header
    @name {String} :: IP or Header name
    @value {RegExp} :: optional, header value
    return {Framework}
*/
FrameworkRestrictions.prototype.allow = function(name, value) {

    var self = this;

    // IP address
    if (typeof(value) === UNDEFINED) {
        self.allowedIP.push(name);
        self.refresh();
        return self.framework;
    }

    // Custom header
    if (typeof(self.allowedCustom[name]) === UNDEFINED)
        self.allowedCustom[name] = [value];
    else
        self.allowedCustom[name].push(value);

    self.refresh();
    return self.framework;

};

/*
    Disallow IP or custom header
    @name {String} :: IP or Header name
    @value {RegExp} :: optional, header value
    return {Framework}
*/
FrameworkRestrictions.prototype.disallow = function(name, value) {

    var self = this;

    // IP address
    if (typeof(value) === UNDEFINED) {
        self.blockedIP.push(name);
        self.refresh();
        return self.framework;
    }

    // Custom header
    if (typeof(self.blockedCustom[name]) === UNDEFINED)
        self.blockedCustom[name] = [value];
    else
        self.blockedCustom[name].push(value);

    self.refresh();
    return self.framework;

};

/*
    INTERNAL: Refresh internal informations
    return {Framework}
*/
FrameworkRestrictions.prototype.refresh = function() {

    var self = this;

    self.isAllowedIP = self.allowedIP.length > 0;
    self.isBlockedIP = self.blockedIP.length > 0;

    self.isAllowedCustom = !utils.isEmpty(self.allowedCustom);
    self.isBlockedCustom = !utils.isEmpty(self.blockedCustom);

    self.allowedCustomKeys = Object.keys(self.allowedCustom);
    self.blockedCustomKeys = Object.keys(self.blockedCustom);

    self.isRestrictions = self.isAllowedIP || self.isBlockedIP || self.isAllowedCustom || self.isBlockedCustom;

    return self.framework;
};

/*
    Clear all restrictions for IP
    return {Framework}
*/
FrameworkRestrictions.prototype.clearIP = function() {
    var self = this;
    self.allowedIP = [];
    self.blockedIP = [];
    self.refresh();
    return self.framework;
}

/*
    Clear all restrictions for custom headers
    return {Framework}
*/
FrameworkRestrictions.prototype.clearHeaders = function() {
    var self = this;
    self.allowedCustom = {};
    self.blockedCustom = {};
    self.allowedCustomKeys = [];
    self.blockedCustomKeys = [];
    self.refresh();
    return self.framework;
}

/*
    INTERNAL: Restrictions using
    return {Framework}
*/
FrameworkRestrictions.prototype._allowedCustom = function(headers) {

    var self = this;
    var length = self.allowedCustomKeys.length;

    for (var i = 0; i < length; i++) {

        var key = self.allowedCustomKeys[i];
        var value = headers[key];
        if (typeof(value) === UNDEFINED)
            return false;

        var arr = self.allowedCustom[key];
        var max = arr.length;

        for (var j = 0; j < max; j++) {

            if (value.search(arr[j]) !== -1)
                return false;

        }
    }

    return true;
};

/*
    INTERNAL: Restrictions using
    return {Framework}
*/
FrameworkRestrictions.prototype._blockedCustom = function(headers) {

    var self = this;
    var length = self.blockedCustomKeys.length;

    for (var i = 0; i < length; i++) {

        var key = self.blockedCustomKeys[i];
        var value = headers[key];

        if (typeof(value) === UNDEFINED)
            return false;

        var arr = self.blockedCustom[key];
        var max = arr.length;

        for (var j = 0; j < max; j++) {
            if (value.search(arr[j]) !== -1)
                return true;
        }

    }

    return false;
};

// *********************************************************************************
// =================================================================================
// Framework File System
// 1.01
// =================================================================================
// *********************************************************************************

function FrameworkFileSystem(framework) {

    this.framework = framework;
    this.config = framework.config;

    this.create = {
        css: this.createCSS.bind(this),
        js: this.createJS.bind(this),
        view: this.createView.bind(this),
        content: this.createContent.bind(this),
        template: this.createTemplate.bind(this),
        resource: this.createResource.bind(this),
        temporary: this.createTemporary.bind(this),
        worker: this.createWorker.bind(this),
        file: this.createFile.bind(this)
    };

    this.rm = {
        css: this.deleteCSS.bind(this),
        js: this.deleteJS.bind(this),
        view: this.deleteView.bind(this),
        content: this.deleteContent.bind(this),
        template: this.deleteTemplate.bind(this),
        resource: this.deleteResource.bind(this),
        temporary: this.deleteTemporary.bind(this),
        worker: this.deleteWorker.bind(this),
        file: this.deleteFile.bind(this)
    };
}

/*
    Delete a file - CSS
    @name {String}
    return {Boolean}
*/
FrameworkFileSystem.prototype.deleteCSS = function(name) {
    var self = this;

    if (name.lastIndexOf('.css') === -1)
        name += '.css';

    var filename = utils.combine(self.config['directory-public'], self.config['static-url-css'], name);
    return self.deleteFile(filename);
};

/*
    Delete a file - JS
    @name {String}
    return {Boolean}
*/
FrameworkFileSystem.prototype.deleteJS = function(name) {
    var self = this;

    if (name.lastIndexOf(EXTENSION_JS) === -1)
        name += EXTENSION_JS;

    var filename = utils.combine(self.config['directory-public'], self.config['static-url-js'], name);
    return self.deleteFile(filename);
};

/*
    Delete a file - View
    @name {String}
    return {Boolean}
*/
FrameworkFileSystem.prototype.deleteView = function(name) {
    var self = this;

    if (name.lastIndexOf('.html') === -1)
        name += '.html';

    var filename = utils.combine(self.config['directory-views'], name);
    return self.deleteFile(filename);
};

/*
    Delete a file - Content
    @name {String}
    return {Boolean}
*/
FrameworkFileSystem.prototype.deleteContent = function(name) {
    var self = this;

    if (name.lastIndexOf('.html') === -1)
        name += '.html';

    var filename = utils.combine(self.config['directory-contents'], name);
    return self.deleteFile(filename);
};

/*
    Delete a file - Worker
    @name {String}
    return {Boolean}
*/
FrameworkFileSystem.prototype.deleteWorker = function(name) {
    var self = this;

    if (name.lastIndexOf(EXTENSION_JS) === -1)
        name += EXTENSION_JS;

    var filename = utils.combine(self.config['directory-workers'], name);
    return self.deleteFile(filename);
};

/*
    Delete a file - Template
    @name {String}
    return {Boolean}
*/
FrameworkFileSystem.prototype.deleteTemplate = function(name) {
    var self = this;

    if (name.lastIndexOf('.html') === -1)
        name += '.html';

    var filename = utils.combine(self.config['directory-templates'], name);
    return self.deleteFile(filename);
};

/*
    Delete a file - Resource
    @name {String}
    return {Boolean}
*/
FrameworkFileSystem.prototype.deleteResource = function(name) {
    var self = this;

    if (name.lastIndexOf('.resource') === -1)
        name += '.resource';

    var filename = utils.combine(self.config['directory-resources'], name);
    return self.deleteFile(filename);
};

/*
    Delete a file - Temporary
    @name {String}
    return {Boolean}
*/
FrameworkFileSystem.prototype.deleteTemporary = function(name) {
    var self = this;
    var filename = utils.combine(self.config['directory-temp'], name);
    return self.deleteFile(filename);
};

/*
    Internal :: Delete a file
    @name {String}
    return {Boolean}
*/
FrameworkFileSystem.prototype.deleteFile = function(filename) {
    var self = this;

    fs.exists(filename, function(exist) {
        if (!exist)
            return;
        fs.unlink(filename);
    });

    return true;
};

/*
    Create a file with the CSS
    @name {String}
    @content {String}
    @rewrite {Boolean} :: optional (default false)
    @append {Boolean} :: optional (default false)
    return {Boolean}
*/
FrameworkFileSystem.prototype.createCSS = function(name, content, rewrite, append) {

    var self = this;

    if ((content || '').length === 0)
        return false;

    if (name.lastIndexOf('.css') === -1)
        name += '.css';

    var filename = utils.combine(self.config['directory-public'], self.config['static-url-css'], name);
    return self.createFile(filename, content, append, rewrite);
};

/*
    Create a file with the JavaScript
    @name {String}
    @content {String}
    @rewrite {Boolean} :: optional (default false)
    @append {Boolean} :: optional (default false)
    return {Boolean}
*/
FrameworkFileSystem.prototype.createJS = function(name, content, rewrite, append) {

    var self = this;

    if ((content || '').length === 0)
        return false;

    if (name.lastIndexOf(EXTENSION_JS) === -1)
        name += EXTENSION_JS;

    var filename = utils.combine(self.config['directory-public'], self.config['static-url-js'], name);
    return self.createFile(filename, content, append, rewrite);
};

/*
    Create a file with the template
    @name {String}
    @content {String}
    @rewrite {Boolean} :: optional (default false)
    @append {Boolean} :: optional (default false)
    return {Boolean}
*/
FrameworkFileSystem.prototype.createTemplate = function(name, content, rewrite, append) {

    var self = this;

    if ((content || '').length === 0)
        return false;

    if (name.lastIndexOf('.html') === -1)
        name += '.html';

    self.framework._verify_directory('templates');

    var filename = utils.combine(self.config['directory-templates'], name);
    return self.createFile(filename, content, append, rewrite);
};

/*
    Create a file with the view
    @name {String}
    @content {String}
    @rewrite {Boolean} :: optional (default false)
    @append {Boolean} :: optional (default false)
    return {Boolean}
*/
FrameworkFileSystem.prototype.createView = function(name, content, rewrite, append) {

    var self = this;

    if ((content || '').length === 0)
        return false;

    if (name.lastIndexOf('.html') === -1)
        name += '.html';

    self.framework._verify_directory('views');

    var filename = utils.combine(self.config['directory-views'], name);
    return self.createFile(filename, content, append, rewrite);
};

/*
    Create a file with the content
    @name {String}
    @content {String}
    @rewrite {Boolean} :: optional (default false)
    @append {Boolean} :: optional (default false)
    return {Boolean}
*/
FrameworkFileSystem.prototype.createContent = function(name, content, rewrite, append) {

    var self = this;

    if ((content || '').length === 0)
        return false;

    if (name.lastIndexOf('.html') === -1)
        name += '.html';

    self.framework._verify_directory('contents');

    var filename = utils.combine(self.config['directory-contents'], name);
    return self.createFile(filename, content, append, rewrite);
};

/*
    Create a file with the worker
    @name {String}
    @content {String}
    @rewrite {Boolean} :: optional (default false)
    @append {Boolean} :: optional (default false)
    return {Boolean}
*/
FrameworkFileSystem.prototype.createWorker = function(name, content, rewrite, append) {

    var self = this;

    if ((content || '').length === 0)
        return false;

    if (name.lastIndexOf(EXTENSION_JS) === -1)
        name += EXTENSION_JS;

    self.framework._verify_directory('workers');

    var filename = utils.combine(self.config['directory-workers'], name);
    return self.createFile(filename, content, append, rewrite);
};

/*
    Create a file with the resource
    @name {String}
    @content {String or Object}
    @rewrite {Boolean} :: optional (default false)
    @append {Boolean} :: optional (default false)
    return {Boolean}
*/
FrameworkFileSystem.prototype.createResource = function(name, content, rewrite, append) {

    var self = this;

    if ((content || '').length === 0)
        return false;

    if (name.lastIndexOf('.resource') === -1)
        name += '.resource';

    var builder = content;

    if (typeof(content) === OBJECT) {
        builder = '';
        Object.keys(content).forEach(function(o) {
            builder += o.padRight(20, ' ') + ': ' + content[o] + '\n';
        });
    }

    self.framework._verify_directory('resources');

    var filename = utils.combine(self.config['directory-resources'], name);
    return self.createFile(filename, builder, append, rewrite);
};

/*
    Create a temporary file
    @name {String}
    @stream {Stream}
    @callback {Function} :: function(err, filename) {}
    return {Boolean}
*/
FrameworkFileSystem.prototype.createTemporary = function(name, stream, callback) {
    var self = this;

    self.framework._verify_directory('temp');

    var filename = utils.combine(self.config['directory-temp'], name);
    var writer = fs.createWriteStream(filename);

    if (callback) {
        writer.on('error', function(err) {
            callback(err, filename);
        });
        writer.on('end', function() {
            callback(null, filename);
        });
    }

    stream.pipe(writer);
    return self;
};

/*
    Internal :: Create a file with the content
    @filename {String}
    @content {String}
    @append {Boolean}
    @rewrite {Boolean}
    @callback {Function} :: optional
    return {Boolean}
*/
FrameworkFileSystem.prototype.createFile = function(filename, content, append, rewrite, callback) {

    var self = this;

    if (content.substring(0, 7) === 'http://' || content.substring(0, 8) === 'https://') {

        utils.request(content, 'GET', null, function(err, data) {

            if (!err)
                self.createFile(filename, data, append, rewrite);

            if (typeof(callback) === FUNCTION)
                callback(err, filename);

        });

        return true;
    }

    if ((content || '').length === 0)
        return false;

    var exists = fs.existsSync(filename);

    if (exists && append) {
        var data = fs.readFileSync(filename).toString(ENCODING);

        if (data.indexOf(content) === -1) {
            fs.appendFileSync(filename, '\n' + content);
            return true;
        }

        return false;
    }

    if (exists && !rewrite)
        return false;

    fs.writeFileSync(filename, content, ENCODING);

    if (typeof(callback) === FUNCTION)
        callback(null, filename);

    return true;
};

// *********************************************************************************
// =================================================================================
// Framework path
// =================================================================================
// *********************************************************************************

function FrameworkPath(framework) {
    this.framework = framework;
    this.config = framework.config;
}

/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.public = function(filename) {
    var self = this;
    self.framework._verify_directory('public');
    return utils.combine(self.config['directory-public'], filename || '').replace(/\\/g, '/');
};

/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.logs = function(filename) {
    var self = this;
    self.framework._verify_directory('logs');
    return utils.combine(self.config['directory-logs'], filename || '').replace(/\\/g, '/');
};

/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.components = function(filename) {
    var self = this;
    return utils.combine(self.config['directory-components'], filename || '').replace(/\\/g, '/');
};

/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.models = function(filename) {
    var self = this;
    return utils.combine(self.config['directory-models'], filename || '').replace(/\\/g, '/');
};
/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.temp = function(filename) {
    var self = this;
    self.framework._verify_directory('temp');
    return utils.combine(self.config['directory-temp'], filename || '').replace(/\\/g, '/');
};

FrameworkPath.prototype.temporary = function(filename) {
    return this.temp(filename);
};

/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.views = function(filename) {
    var self = this;
    self.framework._verify_directory('views');
    return utils.combine(self.config['directory-views'], filename || '').replace(/\\/g, '/');
};

/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.templates = function(filename) {
    var self = this;
    self.framework._verify_directory('templates');
    return utils.combine(self.config['directory-templates'], filename || '').replace(/\\/g, '/');
};

/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.workers = function(filename) {
    var self = this;
    self.framework._verify_directory('workers');
    return utils.combine(self.config['directory-workers'], filename || '').replace(/\\/g, '/');
};

/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.databases = function(filename) {
    var self = this;
    self.framework._verify_directory('databases');
    return utils.combine(self.config['directory-databases'], filename || '').replace(/\\/g, '/');
};

/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.contents = function(filename) {
    var self = this;
    self.framework._verify_directory('contents');
    return utils.combine(self.config['directory-contents'], filename || '').replace(/\\/g, '/');
};

/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.modules = function(filename) {
    var self = this;
    self.framework._verify_directory('modules');
    return utils.combine(self.config['directory-modules'], filename || '').replace(/\\/g, '/');
};

/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.controllers = function(filename) {
    var self = this;
    self.framework._verify_directory('controllers');
    return utils.combine(self.config['directory-controllers'], filename || '').replace(/\\/g, '/');
};

/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.definitions = function(filename) {
    var self = this;
    self.framework._verify_directory('definitions');
    return utils.combine(self.config['directory-definitions'], filename || '').replace(/\\/g, '/');
};

/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.tests = function(filename) {
    var self = this;
    self.framework._verify_directory('tests');
    return utils.combine(self.config['directory-tests'], filename || '').replace(/\\/g, '/');
};

/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.resources = function(filename) {
    var self = this;
    self.framework._verify_directory('resources');
    return utils.combine(self.config['directory-resources'], filename || '').replace(/\\/g, '/');
};

/*
    @filename {String} :: optional
    return {String}
*/
FrameworkPath.prototype.root = function(filename) {
    return path.join(directory, filename || '');
};

// *********************************************************************************
// =================================================================================
// Cache declaration
// =================================================================================
// *********************************************************************************

/*
    Cache class
    @framework {Framework}
*/
function FrameworkCache(framework) {
    this.repository = {};
    this.framework = framework;
    this.count = 1;
    this.interval = null;
}

/*
    Cache init
    return {Cache}
*/
FrameworkCache.prototype.init = function(interval) {

    var self = this;

    self.interval = setInterval(function() {
        framework.cache.recycle();
    }, interval || 1000 * 60);

    return self;
};

FrameworkCache.prototype.stop = function() {
    var self = this;
    clearInterval(self.interval);
    return self;
};

FrameworkCache.prototype.clear = function() {
    var self = this;
    self.repository = {};
    return self;
};

/*
    Internal function
    return {Cache}
*/
FrameworkCache.prototype.recycle = function() {

    var self = this;
    var repository = self.repository;
    var keys = Object.keys(repository);
    var length = keys.length;

    self.count++;

    if (length === 0) {
        self.framework.handlers.onservice(self.count);
        return self;
    }

    var expire = new Date();

    for (var i = 0; i < length; i++) {
        var o = keys[i];
        var value = repository[o];
        if (value.expire < expire) {
            self.framework.emit('expire', o, value.value);
            delete repository[o];
        }
    }

    self.framework.handlers.onservice(self.count);
    return self;
};

/*
    Add item to cache
    @name {String}
    @value {Object}
    @expire {Date}
    return @value
*/
FrameworkCache.prototype.add = function(name, value, expire) {
    var self = this;

    if (typeof(expire) === UNDEFINED)
        expire = new Date().add('m', 5);

    self.repository[name] = {
        value: value,
        expire: expire
    };
    return value;
};

/*
    Read item from cache
    @name {String}
    return {Object}
*/
FrameworkCache.prototype.read = function(name) {
    var self = this;
    var value = self.repository[name] || null;

    if (value === null)
        return null;

    if (value.expire < new Date())
        return null;

    return value.value;
};

/*
    Update cache item expiration
    @name {String}
    @expire {Date}
    return {Cache}
*/
FrameworkCache.prototype.setExpire = function(name, expire) {
    var self = this;
    var obj = self.repository[name];

    if (typeof(obj) === UNDEFINED)
        return self;

    obj.expire = expire;
    return self;
};

/*
    Remove item from cache
    @name {String}
    return {Object} :: return value;
*/
FrameworkCache.prototype.remove = function(name) {
    var self = this;
    var value = self.repository[name] || null;

    delete self.repository[name];
    return value;
};

/*
    Remove all
    @search {String}
    return {Number}
*/
FrameworkCache.prototype.removeAll = function(search) {
    var self = this;
    var count = 0;
    var keys = Object.keys(self.repository);
    var length = keys.length;
    var isReg = utils.isRegExp(search);

    for (var i = 0; i < length; i++) {

        if (isReg) {
            if (!search.test(keys[i]))
                continue;
        } else {
            if (keys[i].indexOf(search) === -1)
                continue;
        }

        self.remove(keys[i]);
        count++;
    }

    return count;
};

/*
    Cache function value
    @name {String}
    @fnCache {Function} :: params, @value {Object}, @expire {Date}
    @fnCallback {Function} :: params, @value {Object}
    return {Cache}
*/
FrameworkCache.prototype.fn = function(name, fnCache, fnCallback) {

    var self = this;
    var value = self.read(name);

    if (value !== null) {
        if (fnCallback)
            fnCallback(value);
        return self;
    }

    fnCache(function(value, expire) {
        self.add(name, value, expire);
        if (fnCallback)
            fnCallback(value);
    });

    return self;
};

// *********************************************************************************
// =================================================================================
// Framework.Subscribe
// =================================================================================
// *********************************************************************************

var REPOSITORY_HEAD = '$head';
var REPOSITORY_ANGULAR = '$angular';
var REPOSITORY_ANGULAR_LOCALE = '$angular-locale';
var REPOSITORY_ANGULAR_COMMON = '$angular-common';
var REPOSITORY_ANGULAR_CONTROLLER = '$angular-controller';
var REPOSITORY_ANGULAR_OTHER = '$angular-other';
var REPOSITORY_META = '$meta';
var REPOSITORY_PLACE = '$place';
var REPOSITORY_META_TITLE = '$title';
var REPOSITORY_META_DESCRIPTION = '$description';
var REPOSITORY_META_KEYWORDS = '$keywords';
var REPOSITORY_META_IMAGE = '$image';
var ATTR_END = '"';

function Subscribe(framework, req, res, type) {
    this.framework = framework;

    this.handlers = {
        _execute: this._execute.bind(this),
        _cancel: this._cancel.bind(this),
        _end: this._end.bind(this)
    };

    // type = 0 - GET, DELETE
    // type = 1 - POST, PUT
    // type = 2 - POST MULTIPART
    // type = 3 - file routing

    // OPTIMALIZATION: saving memory and processor
    if (type !== 3 && framework.onAuthorization !== null)
        this.handlers._authorization = this._authorization.bind(this);

    if (type === 3)
        this.handlers._endfile = this._endfile.bind(this);
    else if (type === 1)
        this.handlers._parsepost = this._parsepost.bind(this);

    this.controller = null;
    this.req = req;
    this.res = res;
    this.route = null;
    this.timeout = null;
    this.isCanceled = false;
    this.isMixed = false;
    this.header = '';
    this.error = null;
}

Subscribe.prototype.success = function() {
    var self = this;

    if (self.timeout)
        clearTimeout(self.timeout);

    self.timeout = null;
    self.isCanceled = true;
    return self;
};

Subscribe.prototype.file = function() {
    var self = this;
    self.req.on('end', self.handlers._endfile);
    self.req.resume();
    return self;
};

/*
    @header {String} :: Content-Type
*/
Subscribe.prototype.multipart = function(header) {

    var self = this;
    self.route = self.framework.lookup(self.req, self.req.uri.pathname, self.req.flags, true);
    self.header = header;

    if (self.route === null) {
        self.framework._request_stats(false, false);
        self.framework.stats.request.blocked++;
        self.req.connection.destroy();
        return;
    }

    if (header.indexOf('mixed') === -1) {
        self.framework._verify_directory('temp');
        internal.parseMULTIPART(self.req, header, self.route.maximumSize, self.framework.config['directory-temp'], self.framework.handlers.onxss, self.handlers._end);
        return;
    }

    self.isMixed = true;
    self.execute();
};

Subscribe.prototype.urlencoded = function() {

    var self = this;
    self.route = self.framework.lookup(self.req, self.req.uri.pathname, self.req.flags, true);

    if (self.route === null) {
        self.req.clear(true);
        self.framework.stats.request.blocked++;
        self.framework._request_stats(false, false);
        self.req.connection.destroy();
        return;
    }

    self.req.buffer_has = true;
    self.req.buffer_exceeded = false;
    self.req.on('data', self.handlers._parsepost);
    self.end();
};

Subscribe.prototype.end = function() {
    var self = this;
    self.req.on('end', self.handlers._end);
    self.req.resume();
};

/*
    @status {Number} :: HTTP status
*/
Subscribe.prototype.execute = function(status) {

    var self = this;
    if (status > 399 && (self.route === null || self.route.name[0] === '#')) {
        switch (status) {
            case 400:
                self.framework.stats.response.error400++;
                break;
            case 401:
                self.framework.stats.response.error401++;
                break;
            case 403:
                self.framework.stats.response.error403++;
                break;
            case 404:
                self.framework.stats.response.error404++;
                break;
            case 408:
                self.framework.stats.response.error408++;
                break;
            case 431:
                self.framework.stats.response.error431++;
                break;
            case 500:
                self.framework.stats.response.error500++;
                break;
            case 501:
                self.framework.stats.response.error501++;
                break;
        }
    }

    if (self.route === null) {
        self.framework.responseContent(self.req, self.res, status || 404, utils.httpStatus(status || 404), CONTENTTYPE_TEXTPLAIN, self.framework.config['allow-gzip']);
        return self;
    }

    var name = self.route.name;

    self.controller = new Controller(name, self.req, self.res, self);
    self.controller.exception = self.exception;

    if (!self.isCanceled && !self.isMixed && self.route.timeout > 0)
        self.timeout = setTimeout(self.handlers._cancel, self.route.timeout);

    if (self.framework._length_partial_private === 0 && self.framework._length_partial_global === 0) {
        self.handlers._execute();
        return self;
    }

    if (self.framework._length_partial_global === 0 && self.route.partial === null) {
        self.handlers._execute();
        return self;
    }

    var funcs = [];
    var count = 0;

    if (self.framework._length_partial_global > 0) {
        for (var i = 0; i < self.framework._length_partial_global; i++) {
            var partial = self.framework.routes.partialGlobal[i];
            funcs.push(partial.bind(self.controller));
        }
    }

    if (self.route.partial !== null) {
        var length = self.route.partial.length;
        for (var i = 0; i < length; i++) {
            var partialFn = self.framework.routes.partial[self.route.partial[i]];
            if (!partialFn)
                continue;
            count++;
            funcs.push(partialFn.bind(self.controller));
        }
    }

    if (count === 0 && self.framework._length_partial_global === 0) {
        self.handlers._execute();
        return;
    }

    funcs.async(self.handlers._execute);
    return self;
};

/*
    @flags {String Array}
    @url {String}
*/
Subscribe.prototype.prepare = function(flags, url) {

    var self = this;

    if (self.framework.onAuthorization !== null) {
        self.framework.onAuthorization(self.req, self.res, flags, self.handlers._authorization);
        return;
    }

    if (self.route === null)
        self.route = self.framework.lookup(self.req, self.req.buffer_exceeded ? '#431' : url || self.req.uri.pathname, flags);

    if (self.route === null)
        self.route = self.framework.lookup(self.req, self.req.flags.indexOf('xss') === -1 ? '#404' : '#400', []);

    self.execute(self.req.buffer_exceeded ? 431 : 404);
};

Subscribe.prototype._execute = function() {

    var self = this;
    var name = self.route.name;
    self.controller.isCanceled = false;

    try {
        self.framework.emit('controller', self.controller, name);

        var isModule = name[0] === '#' && name[1] === 'm';
        var o = isModule ? self.framework.modules[name.substring(8)] : self.framework.controllers[name];

        if (o && o.request)
            o.request.call(self.controller, self.controller);

    } catch (err) {
        self.framework.error(err, name, self.req.uri);
    }

    try {

        if (self.controller.isCanceled)
            return;

        if (!self.isMixed) {
            self.route.onExecute.apply(self.controller, internal.routeParam(self.route.param.length > 0 ? internal.routeSplit(self.req.uri.pathname, true) : self.req.path, self.route));
            return;
        }

        self.framework._verify_directory('temp');

        internal.parseMULTIPART_MIXED(self.req, self.header, self.framework.config['directory-temp'], function(file) {
            self.route.onExecute.call(self.controller, file);
        }, self.handlers._end);

    } catch (err) {
        self.controller = null;
        self.framework.error(err, name, self.req.uri);
        self.route = self.framework.lookup(self.req, '#500', []);
        self.execute(500);
    }
};

/*
    @isLogged {Boolean}
*/
Subscribe.prototype._authorization = function(isLogged, user) {
    var self = this;

    if (user)
        self.req.user = user;

    self.req.flags.push(isLogged ? 'authorize' : 'unauthorize');
    self.route = self.framework.lookup(self.req, self.req.buffer_exceeded ? '#431' : self.req.uri.pathname, self.req.flags);

    if (self.route === null)
        self.route = self.framework.lookup(self.req, self.req.isAuthorized ? '#404' : '#401', []);

    self.execute(self.req.buffer_exceeded ? 431 : 404);
};

Subscribe.prototype._end = function() {

    var self = this;

    if (self.isMixed) {
        self.req.clear(true);
        var headers = {};
        headers[RESPONSE_HEADER_CONTENTTYPE] = 'text/plain; charset=utf-8';
        headers[RESPONSE_HEADER_CACHECONTROL] = 'private, max-age=0';
        self.res.writeHead(200, headers);
        self.res.end('END');
        self.framework._request_stats(false, false);
        self.framework.emit('request-end', self.req, self.res);
        return;
    }

    if (self.req.buffer_exceeded) {
        self.route = self.framework.lookup(self.req, '#431', []);

        if (self.route === null) {
            self.framework.response431(self.req, self.res);
            return;
        }

        self.execute(431);
        return;
    }

    if (self.req.buffer_data.length === 0) {

        // POST, MULTIPART
        if (self.route !== null && !self.route.isXSS && self.req.flags.indexOf('xss') !== -1) {
            self.route400();
            return;
        }

        self.prepare(self.req.flags, self.req.uri.pathname);
        return;
    }

    if (self.route.isJSON) {
        try {
            if (!self.req.buffer_data.isJSON()) {
                self.route400();
                return;
            }

            self.req.data.post = JSON.parse(self.req.buffer_data);
            self.req.buffer_data = null;
            self.prepare(self.req.flags, self.req.uri.pathname);

        } catch (err) {
            self.route400();
        }

        return;
    }

    // A route has not allowed XSS
    if (!self.route.isXSS && self.framework.onXSS !== null) {
        if (self.framework.onXSS(self.req.buffer_data)) {
            self.req.flags.push('xss');
            self.framework.stats.request.xss++;
            self.route400();
            return;
        }
    }

    if (self.route !== null && self.route.isRAW) {
        self.req.data.post = self.req.buffer_data;
    } else {
        if ((self.req.headers['content-type'] || '').indexOf('x-www-form-urlencoded') === -1) {
            self.route400();
            return;
        }
        self.req.data.post = qs.parse(self.req.buffer_data);
    }

    self.prepare(self.req.flags, self.req.uri.pathname);
};

Subscribe.prototype.route400 = function() {
    var self = this;
    self.route = self.framework.lookup(self.req, '#400', []);
    self.execute(400);
}

Subscribe.prototype._endfile = function() {

    var self = this;

    if (self.req.uri.query && self.req.uri.query.length > 0) {
        self.req.data = {};
        self.req.data.get = qs.parse(self.req.uri.query);
    }

    for (var i = 0; i < self.framework._length_files; i++) {
        var file = self.framework.routes.files[i];
        try {

            if (file.onValidation.call(self.framework, self.req, self.res, true)) {
                file.onExecute.call(self.framework, self.req, self.res, false);
                return;
            }

        } catch (err) {
            self.framework.error(err, file.controller + ' :: ' + file.name, self.req.uri);
            self.framework.responseContent(self.req, self.res, 500, '500 - internal server error', CONTENTTYPE_TEXTPLAIN, self.framework.config['allow-gzip']);
            return;
        }
    }

    self.framework.responseStatic(self.req, self.res);
};

Subscribe.prototype._parsepost = function(chunk) {

    var self = this;

    if (self.req.buffer_exceeded)
        return;

    if (!self.req.buffer_exceeded)
        self.req.buffer_data += chunk.toString();

    if (self.req.buffer_data.length < self.route.maximumSize)
        return;

    self.req.buffer_exceeded = true;
    self.req.buffer_data = '';
};

Subscribe.prototype._cancel = function() {
    var self = this;

    self.framework.stats.response.timeout++;
    clearTimeout(self.timeout);
    self.timeout = null;

    if (self.controller === null)
        return;

    self.controller.isTimeout = true;
    self.controller.isCanceled = true;
    self.route = self.framework.lookup(self.req, '#408', []);
    self.execute(408);
};

// *********************************************************************************
// =================================================================================
// Framework.Controller
// =================================================================================
// *********************************************************************************

/*
    Controller class
    @name {String}
    @req {ServerRequest}
    @res {ServerResponse}
    @substribe {Object}
    return {Controller};
*/
function Controller(name, req, res, subscribe) {

    this.subscribe = subscribe;
    this.name = name;
    this.framework = subscribe.framework;
    this.req = req;
    this.res = res;
    this.exception = null;

    this.boundary = null;

    // controller.type === 0 - classic
    // controller.type === 1 - server sent events
    // controller.type === 2 - multipart/x-mixed-replace
    this.type = 0;

    this.layoutName = subscribe.framework.config['default-layout'];

    this.status = 200;

    this.isLayout = false;
    this.isCanceled = false;
    this.isConnected = true;
    this.isTimeout = false;

    this.repository = {};

    // render output
    this.output = null;
    this.outputPartial = null;
    this.$model = null;
    this.prefix = req.prefix;

    if (typeof(this.prefix) === UNDEFINED || this.prefix.length === 0)
        this.prefix = '';
    else
        this.prefix = this.prefix;

    this._currentImage = '';
    this._currentDownload = '';
    this._currentVideo = '';
    this._currentJS = '';
    this._currentCSS = '';
    this._currentTemplate = '';
    this._currentView = name[0] !== '#' && name !== 'default' ? '/' + name + '/' : '';
    this._currentContent = '';
}

Controller.prototype = {

    get sseID() {
        return this.req.headers['last-event-id'] || null;
    },

    get flags() {
        return this.subscribe.route.flags;
    },

    get path() {
        return this.framework.path;
    },

    get fs() {
        return this.framework.fs;
    },

    get get() {
        return this.req.data.get;
    },

    get post() {
        return this.req.data.post;
    },

    get files() {
        return this.req.data.files;
    },

    get language() {
        return this.req.language;
    },

    get subdomain() {
        return this.req.subdomain;
    },

    get ip() {
        return this.req.ip;
    },

    get xhr() {
        return this.req.xhr;
    },

    get url() {
        return utils.path(this.req.uri.pathname);
    },

    get uri() {
        return this.req.uri;
    },

    get cache() {
        return this.framework.cache;
    },

    get config() {
        return this.framework.config;
    },

    get controllers() {
        return this.framework.controllers;
    },

    get isProxy() {
        return this.req.isProxy;
    },

    get isDebug() {
        return this.framework.config.debug;
    },

    get isTest() {
        return this.req.headers['x-assertion-testing'] === '1';
    },

    get isSecure() {
        return this.req.isSecure;
    },

    get session() {
        return this.req.session;
    },

    set session(value) {
        this.req.session = value;
    },

    get user() {
        return this.req.user;
    },

    set user(value) {
        this.req.user = value;
    },

    get global() {
        return this.framework.global;
    },

    set global(value) {
        this.framework.global = value;
    },

    get async() {

        var self = this;

        if (typeof(self._async) === UNDEFINED)
            self._async = new utils.Async(self);

        return self._async;
    }
};

// ======================================================
// PROTOTYPES
// ======================================================

/*
    Validation / alias for validate
    @model {Object}
    @properties {String Array}
    @prefix {String} :: optional - prefix in a resource
    @name {String} :: optional - a resource name
    return {ErrorBuilder}
*/
Controller.prototype.validation = function(model, properties, prefix, name) {
    return this.validate(model, properties, prefix, name);
};

Controller.prototype.clear = function() {
    var self = this;
    self.req.clear();
    return self;
};

/*
    Pipe URL response
    @url {String}
    @headers {Object} :: optional
    return {Controller}
*/
Controller.prototype.pipe = function(url, headers, callback) {

    var self = this;

    if (typeof(headers) === FUNCTION) {
        var tmp = callback;
        callback = headers;
        headers = tmp;
    }

    if (self.res.success || !self.isConnected)
        return self;

    self.framework.responsePipe(self.req, self.res, url, headers, null, function() {
        self.subscribe.success();
        if (callback)
            callback();
    });

    return self;
};

/*
    Cryptography (encrypt)
    @value {String}
    @key {String}
    @isUniqe {Boolean} :: optional, default true
    return {String}
*/
Controller.prototype.encrypt = function() {
    var framework = this.framework;
    return framework.encrypt.apply(framework, arguments);
};

/*
    Cryptography (decrypt)
    @value {String}
    @key {String}
    @jsonConvert {Boolean} :: optional (convert string to JSON)
    return {String or Object}
*/
Controller.prototype.decrypt = function() {
    var framework = this.framework;
    return framework.decrypt.apply(framework, arguments);
};

/*
    Hash value
    @type {String} :: sha1, sha256, sha512, md5
    @value {Object}
    @salt {String or Boolean} :: custom salt {String} or secret as salt {undefined or Boolean}
    return {String}
*/
Controller.prototype.hash = function() {
    var framework = this.framework;
    return framework.hash.apply(framework, arguments);
};

Controller.prototype.validate = function(model, properties, prefix, name) {

    var self = this;

    var resource = function(key) {
        return self.resource(name || 'default', (prefix || '') + key);
    };

    var error = new builders.ErrorBuilder(resource);
    return utils.validate.call(self, model, properties, self.framework.onValidation, error);
};

/*
    Set response header
    @name {String}
    @value {String}
    return {Controller}
*/
Controller.prototype.header = function(name, value) {
    var self = this;
    self.res.setHeader(name, value);
    return self;
};

/*
    Get host name
    @path {String} :: optional
    return {String}
*/
Controller.prototype.host = function(path) {
    var self = this;
    return self.req.hostname(path);
};

Controller.prototype.hostname = function(path) {
    var self = this;
    return self.req.hostname(path);
};

/*
    Cross-origin resource sharing
    @allow {String Array}
    @method {String Array} :: optional, default null
    @header {String Array} :: optional, default null
    @credentials {Boolean} :: optional, default false
    return {Boolean}
*/
Controller.prototype.cors = function(allow, method, header, credentials) {

    var self = this;
    var origin = self.req.headers['origin'];
    var isOPTIONS = self.req.method.toUpperCase() === 'OPTIONS';

    if (typeof(origin) === UNDEFINED)
        return true;

    if (typeof(allow) === UNDEFINED)
        allow = '*';

    if (typeof(method) === BOOLEAN) {
        credentials = method;
        method = null;
    }

    if (typeof(header) === BOOLEAN) {
        credentials = header;
        header = null;
    }

    if (!utils.isArray(allow))
        allow = [allow];

    var isAllowed = false;
    var isAll = false;
    var value;
    var headers = self.req.headers;

    if (header) {

        if (!utils.isArray(header))
            header = [header];

        for (var i = 0; i < header.length; i++) {
            if (headers[header[i].toLowerCase()]) {
                isAllowed = true;
                break;
            }
        }

        if (!isAllowed)
            return false;

        isAllowed = false;
    }

    if (method) {

        if (!utils.isArray(method))
            method = [method];

        var current = headers['access-control-request-method'] || self.req.method;

        for (var i = 0; i < method.length; i++) {

            value = method[i].toUpperCase();
            method[i] = value;

            if (current.indexOf(value) !== -1)
                isAllowed = true;
        }

        if (!isAllowed)
            return false;

        isAllowed = false;
    }

    for (var i = 0; i < allow.length; i++) {

        value = allow[i];

        if (value === '*' || origin.indexOf(value) !== -1) {
            isAll = value === '*';
            isAllowed = true;
            break;
        }

    }

    if (!isAllowed)
        return false;

    var tmp;
    var name;

    self.res.setHeader('Access-Control-Allow-Origin', isAll ? '*' : origin);

    if (credentials)
        self.res.setHeader('Access-Control-Allow-Credentials', 'true');

    name = 'Access-Control-Allow-Methods';

    if (method) {
        self.res.setHeader(name, method.join(', '));
    } else if (isOPTIONS) {
        tmp = headers['access-control-request-method'];
        if (tmp)
            self.res.setHeader(name, tmp);
    }

    name = 'Access-Control-Allow-Headers';

    if (header) {
        self.res.setHeader(name, header.join(', '));
    } else if (isOPTIONS) {
        tmp = headers['access-control-request-headers'];
        if (tmp)
            self.res.setHeader(name, tmp);
    }

    return true;
};

/*
    Error
    @err {Error}
    return {Framework}
*/
Controller.prototype.error = function(err) {
    var self = this;
    self.framework.error(typeof(err) === STRING ? new Error(err) : err, self.name, self.uri);
    self.subscribe.exception = err;
    self.exception = err;
    return self;
};

/*
    Problem
    @message {String}
    return {Framework}
*/
Controller.prototype.problem = function(message) {
    var self = this;
    self.framework.problem(message, self.name, self.uri, self.ip);
    return self;
};

/*
    Change
    @message {String}
    return {Framework}
*/
Controller.prototype.change = function(message) {
    var self = this;
    self.framework.change(message, self.name, self.uri, self.ip);
    return self;
};

/*
    Add function to async waiting list
    @name {String}
    @waitingFor {String} :: name of async function
    @fn {Function}
    return {Controller}
*/
Controller.prototype.wait = function(name, waitingFor, fn) {
    var self = this;
    self.async.wait(name, waitingFor, fn);
    return self;
};

/*
    Add function to async list
    @name {String}
    @fn {Function}
    return {Controller}
*/
Controller.prototype.await = function(name, fn) {
    var self = this;
    self.async.await(name, fn);
    return self;
};

/*
    Run async functions
    @callback {Function}
    return {Controller}
*/
Controller.prototype.complete = function(callback) {
    var self = this;
    return self.async.complete(callback);
};

Controller.prototype.run = function(callback) {
    var self = this;
    return self.async.complete(callback);
};

/**
 * Transfer to new route
 * @param {String} url Relative URL.
 * @param {String Array} flags Route flags (optional).
 * @return {Boolean}
 */
Controller.prototype.transfer = function(url, flags) {

    var self = this;
    var length = self.framework.routes.web.length;
    var path = internal.routeSplit(url.trim());

    var isSystem = url[0] === '#';
    var noFlag = flags === null || typeof(flags) === UNDEFINED || flags.length === 0;
    var selected = null;

    for (var i = 0; i < length; i++) {

        var route = self.framework.routes.web[i];

        if (route.isASTERIX) {
            if (!internal.routeCompare(path, route.url, isSystem, true))
                continue;
        } else {
            if (!internal.routeCompare(path, route.url, isSystem))
                continue;
        }

        if (noFlag) {
            selected = route;
            break;
        }

        if (route.flags !== null && route.flags.length > 0) {

            var result = internal.routeCompareFlags(route.flags, flags, true);
            if (result === -1)
                req.isAuthorized = false;

            if (result < 1)
                continue;

        } else {

            if (flags.indexOf('xss') !== -1)
                continue;
        }

        selected = route;
        break;
    }


    if (!selected)
        return false;

    self.cancel();
    self.req.path = [];
    self.subscribe.success();
    self.subscribe.route = selected;
    self.subscribe.execute(404);

    return true;

};

/*
    Cancel execute controller function
    Note: you can cancel controller function execute in on('controller') or controller.request();

    return {Controller}
*/
Controller.prototype.cancel = function() {
    var self = this;

    if (typeof(self._async) !== UNDEFINED)
        self._async.cancel();

    self.isCanceled = true;
    return self;
};

/*
    Log
    @arguments {Object array}
    return {Controller};
*/
Controller.prototype.log = function() {
    var self = this;
    self.framework.log.apply(self.framework, arguments);
    return self;
};

/*
    META Tags for views
    @arguments {String array}
    return {Controller};
*/
Controller.prototype.meta = function() {
    var self = this;
    self.repository[REPOSITORY_META_TITLE] = arguments[0] || '';
    self.repository[REPOSITORY_META_DESCRIPTION] = arguments[1] || '';
    self.repository[REPOSITORY_META_KEYWORDS] = arguments[2] || '';
    self.repository[REPOSITORY_META_IMAGE] = arguments[3] || '';
    return self;
};

Controller.prototype.$meta = function() {
    var self = this;

    if (arguments.length !== 0) {
        self.meta.apply(self, arguments);
        return '';
    }

    var repository = self.repository;
    return self.framework.onMeta.call(self, repository[REPOSITORY_META_TITLE], repository[REPOSITORY_META_DESCRIPTION], repository[REPOSITORY_META_KEYWORDS], repository[REPOSITORY_META_IMAGE]);
};

/*
    Set Meta Title
    @value {String}
    return {Controller};
*/
Controller.prototype.title = function(value) {
    var self = this;
    self.$title(value);
    return self;
};

/*
    Set Meta Description
    @value {String}
    return {Controller};
*/
Controller.prototype.description = function(value) {
    var self = this;
    self.$description(value);
    return self;
};

/*
    Set Meta Keywords
    @value {String}
    return {Controller};
*/
Controller.prototype.keywords = function(value) {
    var self = this;
    self.$keywords(value);
    return self;
};

Controller.prototype.$title = function(value) {
    var self = this;

    if (!value)
        return self.repository[REPOSITORY_META_TITLE] || '';

    self.repository[REPOSITORY_META_TITLE] = value;
    return '';
};

Controller.prototype.$description = function(value) {
    var self = this;

    if (!value)
        return self.repository[REPOSITORY_META_DESCRIPTION] || '';

    self.repository[REPOSITORY_META_DESCRIPTION] = value;
    return '';
};

Controller.prototype.$keywords = function(value) {
    var self = this;

    if (!value)
        return self.repository[REPOSITORY_META_KEYWORDS] || '';

    self.repository[REPOSITORY_META_KEYWORDS] = value;
    return '';
};

/*
    Sitemap generator
    @name {String}
    @url {String}
    @index {Number}
    return {Controller};
*/
Controller.prototype.sitemap = function(name, url, index) {
    var self = this;

    if (typeof(name) === UNDEFINED)
        return self.repository.sitemap || [];

    if (typeof(url) === UNDEFINED)
        url = self.req.url;

    if (typeof(self.repository.sitemap) === UNDEFINED)
        self.repository.sitemap = [];

    self.repository.sitemap.push({
        name: name,
        url: url,
        index: index || self.repository.sitemap.length
    });

    if (typeof(index) !== UNDEFINED && self.sitemap.length > 1) {
        self.repository.sitemap.sort(function(a, b) {
            if (a.index < b.index)
                return -1;
            if (a.index > b.index)
                return 1;
            return 0;
        });
    }

    return self;
};

Controller.prototype.$sitemap = function(name, url, index) {
    var self = this;
    self.sitemap.apply(self, arguments);
    return '';
}

/*
    Module caller
    @name {String}
    return {Module};
*/
Controller.prototype.module = function(name) {
    return this.framework.module(name);
};

/*
    Layout setter
    @name {String} :: layout filename
    return {Controller};
*/
Controller.prototype.layout = function(name) {
    var self = this;
    self.layoutName = name;
    return self;
};

/*
    Layout setter
    @name {String} :: layout filename
    return {Controller};
*/
Controller.prototype.$layout = function(name) {
    var self = this;
    self.layoutName = name;
    return '';
};

/*
    Get a model
    @name {String} :: name of controller
    return {Object};
*/
Controller.prototype.model = function(name) {
    var self = this;
    return self.framework.model(name);
};

/*
    Controller models reader
    @name {String} :: name of controller
    return {Object};
*/
Controller.prototype.models = function(name) {
    var self = this;
    return (self.controllers[name || self.name] || {}).models;
};

/**
 * Send e-mail
 * @param {String or Array} address E-mail address.
 * @param {String} subject E-mail subject.
 * @param {String} view View name.
 * @param {Object} model Optional.
 * @param {Function(err)} callback Optional.
 * @return {Controlller}
 */
Controller.prototype.mail = function(address, subject, view, model, callback) {

    if (typeof(model) === FUNCTION) {
        callback = model;
        model = null;
    }

    var self = this;
    var body = self.view(view, model, true);

    framework.onMail(address, subject, body, callback);

    return self;
};

/*
    Controller functions reader
    @name {String} :: name of controller
    return {Object};
*/
Controller.prototype.functions = function(name) {
    var self = this;
    return (self.controllers[name || self.name] || {}).functions;
};

/*
    Check if ETag or Last Modified has modified
    @compare {String or Date}
    @strict {Boolean} :: if strict then use equal date else use great than date (default: false)

    if @compare === {String} compare if-none-match
    if @compare === {Date} compare if-modified-since

    return {Boolean};
*/
Controller.prototype.notModified = function(compare, strict) {
    var self = this;
    return self.framework.notModified(self.req, self.res, compare, strict);
};

/*
    Set last modified header or Etag
    @value {String or Date}

    if @value === {String} set ETag
    if @value === {Date} set LastModified

    return {Controller};
*/
Controller.prototype.setModified = function(value) {
    var self = this;
    self.framework.setModified(self.req, self.res, value);
    return self;
};

/*
    Set Expires header
    @date {Date}

    return {Controller};
*/
Controller.prototype.setExpires = function(date) {
    var self = this;

    if (typeof(date) === UNDEFINED)
        return self;

    self.res.setHeader('Expires', date.toUTCString());
    return self;
};

/*
    Internal function for views
    @name {String} :: filename
    @model {Object}
    return {String}
*/
Controller.prototype.$view = function(name, model) {
    return this.$viewToggle(true, name, model);
};

/*
    Internal function for views
    @visible {Boolean}
    @name {String} :: filename
    @model {Object}
    return {String}
*/
Controller.prototype.$viewToggle = function(visible, name, model) {
    if (!visible)
        return '';
    var self = this;
    var layout = self.layoutName;
    self.layoutName = '';
    var value = self.view(name, model, null, true);
    self.layoutName = layout;
    return value;
};

/*
    Include: Angular.js CDN into the head
    @version {String}
    @name {String or String Array} :: optional, example: route or resource
    return {String}
*/
Controller.prototype.$ng = function(name) {
    var self = this;

    var length = arguments.length;
    if (length > 1) {
        for (var i = 0; i < length; i++)
            self.$ng(arguments[i]);
        return '';
    }

    if (name instanceof Array) {
        length = name.length;
        for (var i = 0; i < length; i++)
            self.$ng(name[i]);
        return '';
    }

    var isCommon = name[0] === '~';

    if (isCommon)
        name = name.substring(1);

    if (typeof(name) === UNDEFINED)
        name = 'angular';

    if (name === 'core' || name === '' || name === 'base' || name === 'main')
        name = 'angular';

    if (name !== 'angular' && name.indexOf('angular-') === -1)
        name = 'angular-' + name;

    var output = self.repository[REPOSITORY_ANGULAR] || '';
    var script = self.$script_create((isCommon ? '/common/' + name + '.min.js' : '//cdnjs.cloudflare.com/ajax/libs/angular.js/' + self.config['angular-version'] + '/' + name + '.min.js'));

    if (name === 'angular')
        output = script + output;
    else
        output += script;

    self.repository[REPOSITORY_ANGULAR] = output;
    return '';
};


Controller.prototype.$ngCommon = function(name) {

    var self = this;
    var length = arguments.length;

    if (length > 1) {
        for (var i = 0; i < length; i++)
            self.$ngCommon(arguments[i]);
        return '';
    }

    if (name instanceof Array) {
        length = name.length;
        for (var i = 0; i < length; i++)
            self.$ngCommon(name[i]);
        return '';
    }

    var output = self.repository[REPOSITORY_ANGULAR_COMMON] || '';

    if (name.lastIndexOf(EXTENSION_JS) === -1)
        name += EXTENSION_JS;

    var script = self.$script_create('/common/' + name);
    output += script;

    self.repository[REPOSITORY_ANGULAR_COMMON] = output;
    return '';
};

Controller.prototype.$ngLocale = function(name) {

    var self = this;
    var length = arguments.length;

    if (length > 2) {
        for (var i = 1; i < length; i++)
            self.$ngLocale(arguments[i]);
        return '';
    }

    if (name instanceof Array) {
        length = name.length;
        for (var i = 0; i < length; i++)
            self.$ngLocale(name[i]);
        return '';
    }

    var output = self.repository[REPOSITORY_ANGULAR_LOCALE] || '';
    var isLocal = name[0] === '~';
    var extension = '';

    if (isLocal)
        name = name.substring(1);

    if (name.indexOf('angular-locale_') !== -1)
        name = name.replace('angular-locale_', '');

    if (name.lastIndexOf(EXTENSION_JS) === -1)
        extension = EXTENSION_JS;

    output += self.$script_create(isLocal ? '/i18n/angular-locale_' + name + extension : '//cdnjs.cloudflare.com/ajax/libs/angular-i18n/' + self.config['angular-i18n-version'] + '/angular-locale_' + name + extension);
    self.repository[REPOSITORY_ANGULAR_LOCALE] = output;

    return '';
};

Controller.prototype.$script_create = function(url) {
    return '<script type="text/javascript" src="' + url + '"></script>';
};

/*
    Include: Controller into the head
    @name {String or String Array}
    return {String}
*/
Controller.prototype.$ngController = function(name) {

    var self = this;

    var length = arguments.length;
    if (length > 1) {
        for (var i = 0; i < length; i++)
            self.$ngController(arguments[i]);
        return '';
    }

    if (name instanceof Array) {
        length = name.length;
        for (var i = 0; i < length; i++)
            self.$ngController(name[i]);
        return '';
    }

    if (name.lastIndexOf(EXTENSION_JS) === -1)
        name += EXTENSION_JS;

    var output = self.repository[REPOSITORY_ANGULAR_CONTROLLER] || '';
    var isLocal = name[0] === '~';

    if (isLocal)
        name = name.substring(1);

    output += self.$script_create('/controllers/' + name);
    self.repository[REPOSITORY_ANGULAR_CONTROLLER] = output;

    return '';
};

/*
    Include: Content from file into the body
    @name {String}
    return {String}
*/
Controller.prototype.$ngTemplate = function(name, id) {

    var self = this;

    if (typeof(id) === UNDEFINED)
        id = name;

    if (name.lastIndexOf('.html') === -1)
        name += '.html';

    if (name[0] === '~')
        name = name.substring(1);
    else if (name[1] !== '/')
        name = '/templates/' + name;

    var key = 'ng-' + name;
    var tmp = self.framework.temporary.views[key];

    if (typeof(tmp) === UNDEFINED) {
        var filename = utils.combine(self.config['directory-angular'], name);

        if (fs.existsSync(filename))
            tmp = fs.readFileSync(filename).toString('utf8');
        else
            tmp = '';

        if (!self.isDebug)
            self.framework.temporary.views[key] = tmp;
    }

    return '<script type="text/ng-template" id="' + id + '">' + tmp + '</script>';
};

/*
    Include: Directive into the head
    @name {String}
    return {String}
*/
Controller.prototype.$ngDirective = function(name) {

    var self = this;

    var length = arguments.length;
    if (length > 1) {
        for (var i = 0; i < length; i++)
            self.$ngDirective(arguments[i]);
        return '';
    }

    if (name instanceof Array) {
        length = name.length;
        for (var i = 0; i < length; i++)
            self.$ngDirective(name[i]);
        return '';
    }

    if (name.lastIndexOf(EXTENSION_JS) === -1)
        name += EXTENSION_JS;

    var output = self.repository[REPOSITORY_ANGULAR_OTHER] || '';
    var isLocal = name[0] === '~';

    if (isLocal)
        name = name.substring(1);

    output += self.$script_create('/directives/' + name);
    self.repository[REPOSITORY_ANGULAR_OTHER] = output;
    return '';
};

/*
    Include: CSS into the head
    @name {String}
    return {String}
*/
Controller.prototype.$ngStyle = function(name) {

    var self = this;
    var length = arguments.length;

    if (length > 1) {
        for (var i = 0; i < length; i++)
            self.$ngStyle(arguments[i]);
        return '';
    }

    if (name instanceof Array) {
        length = name.length;
        for (var i = 0; i < length; i++)
            self.$ngStyle(name[i]);
        return '';
    }

    if (name.lastIndexOf('.css') === -1)
        name += '.css';

    self.head(name);
    return '';
};

/*
    Include: Service into the head
    @name {String}
    return {String}
*/
Controller.prototype.$ngService = function(name) {

    var self = this;

    var length = arguments.length;
    if (length > 1) {
        for (var i = 0; i < length; i++)
            self.$ngService(arguments[i]);
        return '';
    }

    if (name instanceof Array) {
        length = name.length;
        for (var i = 0; i < length; i++)
            self.$ngService(name[i]);
        return '';
    }

    if (name.lastIndexOf(EXTENSION_JS) === -1)
        name += EXTENSION_JS;

    var output = self.repository[REPOSITORY_ANGULAR_OTHER] || '';
    var isLocal = name[0] === '~';

    if (isLocal)
        name = name.substring(1);

    output += self.$script_create('/services/' + name);
    self.repository[REPOSITORY_ANGULAR_OTHER] = output;

    return '';
};

/*
    Include: Filter into the head
    @name {String}
    return {String}
*/
Controller.prototype.$ngFilter = function(name) {

    var self = this;

    var length = arguments.length;
    if (length > 1) {
        for (var i = 0; i < length; i++)
            self.$ngFilter(arguments[i]);
        return '';
    }

    if (name instanceof Array) {
        length = name.length;
        for (var i = 0; i < length; i++)
            self.$ngFilter(name[i]);
        return '';
    }

    if (name.lastIndexOf(EXTENSION_JS) === -1)
        name += EXTENSION_JS;

    var output = self.repository[REPOSITORY_ANGULAR_OTHER] || '';
    var isLocal = name[0] === '~';

    if (isLocal)
        name = name.substring(1);

    output += self.$script_create('/filters/' + name);
    self.repository[REPOSITORY_ANGULAR_OTHER] = output;

    return '';
};

/*
    Include: Resource into the head
    @name {String}
    return {String}
*/
Controller.prototype.$ngResource = function(name) {

    var self = this;

    var length = arguments.length;
    if (length > 1) {
        for (var i = 0; i < length; i++)
            self.$ngResource(arguments[i]);
        return '';
    }

    if (name instanceof Array) {
        length = name.length;
        for (var i = 0; i < length; i++)
            self.$ngResource(name[i]);
        return '';
    }

    if (name.lastIndexOf(EXTENSION_JS) === -1)
        name += EXTENSION_JS;

    var output = self.repository[REPOSITORY_ANGULAR_OTHER] || '';
    var isLocal = name[0] === '~';

    if (isLocal)
        name = name.substring(1);

    output += self.$script_create('/resources/' + name);
    self.repository[REPOSITORY_ANGULAR_OTHER] = output;

    return '';
};

Controller.prototype.$ngInclude = function(name) {
    var self = this;

    if (name.lastIndexOf(EXTENSION_JS) === -1)
        name += EXTENSION_JS;

    return self.$script_create(name);
};

/*
    Internal function for views
    @name {String} :: filename
    return {String}
*/
Controller.prototype.$content = function(name) {
    return this.$contentToggle(true, name);
};

/*
    Internal function for views
    @visible {Boolean}
    @name {String} :: filename
    return {String}
*/
Controller.prototype.$contentToggle = function(visible, name) {

    var self = this;

    if (!visible)
        return '';

    if (name[0] !== '~')
        name = self._currentContent + name;

    return internal.generateContent(self, name) || '';
};

Controller.prototype.$url = function(host) {
    var self = this;
    return host ? self.req.hostname(self.url) : self.url;
};

/*
    Internal function for views
    @name {String} :: filename
    @model {Object} :: must be an array
    @nameEmpty {String} :: optional filename from contents
    @repository {Object} :: optional
    return {Controller};
*/
Controller.prototype.$template = function(name, model, nameEmpty, repository) {
    var self = this;
    return self.$templateToggle(true, name, model, nameEmpty, repository);
};

/*
    Internal function for views
    @bool {Boolean}
    @name {String} :: filename
    @model {Object}
    @nameEmpty {String} :: optional filename from contents
    @repository {Object} :: optional
    return {Controller};
*/
Controller.prototype.$templateToggle = function(visible, name, model, nameEmpty, repository) {
    var self = this;

    if (!visible)
        return '';

    return self.template(name, model, nameEmpty, repository);
};

/*
    Internal function for views
    @name {String} :: filename
    @model {Object} :: must be an array
    @nameEmpty {String} :: optional filename from contents
    @repository {Object} :: optional
    return {Controller};
*/
Controller.prototype.$component = function(name) {
    var self = this;
    return self.component.apply(self, arguments);
};

Controller.prototype.$helper = function(name) {
    var self = this;
    return self.helper.apply(self, arguments);
};

/*
    Internal function for views
    @bool {Boolean}
    @name {String} :: filename
    @model {Object}
    @nameEmpty {String} :: optional filename from contents
    @repository {Object} :: optional
    return {Controller};
*/
Controller.prototype.$componentToggle = function(visible, name) {
    var self = this;

    if (!visible)
        return '';

    var params = [];
    var length = arguments.length;

    for (var i = 1; i < length; i++)
        params.push(arguments[i]);

    return self.component.apply(self, arguments);
};

/*
    Internal function for views
    @name {String}
    return {String}
*/
Controller.prototype.$checked = function(bool, charBeg, charEnd) {
    var self = this;
    return self.$isValue(bool, charBeg, charEnd, 'checked="checked"');
};

/*
    Internal function for views
    @bool {Boolean}
    @charBeg {String}
    @charEnd {String}
    return {String}
*/
Controller.prototype.$disabled = function(bool, charBeg, charEnd) {
    var self = this;
    return self.$isValue(bool, charBeg, charEnd, 'disabled="disabled"');
};

/*
    Internal function for views
    @bool {Boolean}
    @charBeg {String}
    @charEnd {String}
    return {String}
*/
Controller.prototype.$selected = function(bool, charBeg, charEnd) {
    var self = this;
    return self.$isValue(bool, charBeg, charEnd, 'selected="selected"');
};

/**
 * Fake function for assign value
 * @private
 * @param {Object} value Value to eval.
 * return {String} Returns empty string.
 */
Controller.prototype.$set = function(value) {
    return '';
};

/*
    Internal function for views
    @bool {Boolean}
    @charBeg {String}
    @charEnd {String}
    return {String}
*/
Controller.prototype.$readonly = function(bool, charBeg, charEnd) {
    var self = this;
    return self.$isValue(bool, charBeg, charEnd, 'readonly="readonly"');
};

/*
    Internal function for views
    @name {String}
    @value {String}
    return {String}
*/
Controller.prototype.$header = function(name, value) {
    this.header(name, value);
    return '';
};

/*
    Internal function for views
    @model {Object}
    @name {String}
    @attr {Object} :: optional
    return {String}
*/
Controller.prototype.$text = function(model, name, attr) {
    return this.$input(model, 'text', name, attr);
};

/*
    Internal function for views
    @model {Object}
    @name {String} :: optional
    @attr {Object} :: optional
    return {String}
*/
Controller.prototype.$password = function(model, name, attr) {
    return this.$input(model, 'password', name, attr);
};

/*
    Internal function for views
    @model {Object}
    @name {String}
    @attr {Object} :: optional
    return {String}
*/
Controller.prototype.$hidden = function(model, name, attr) {
    return this.$input(model, 'hidden', name, attr);
};

/*
    Internal function for views
    @model {Object}
    @name {String}
    @attr {Object} :: optional
    return {String}
*/
Controller.prototype.$radio = function(model, name, value, attr) {

    if (typeof(attr) === STRING)
        attr = {
            label: attr
        };

    attr.value = value;
    return this.$input(model, 'radio', name, attr);
};

/*
    Internal function for views
    @model {Object}
    @name {String}
    @attr {Object} :: optional
    return {String}
*/
Controller.prototype.$checkbox = function(model, name, attr) {

    if (typeof(attr) === STRING)
        attr = {
            label: attr
        };

    return this.$input(model, 'checkbox', name, attr);
};

/*
    Internal function for views
    @model {Object}
    @name {String}
    @attr {Object} :: optional
    return {String}
*/
Controller.prototype.$textarea = function(model, name, attr) {

    var builder = '<textarea';

    if (typeof(attr) !== OBJECT)
        attr = {};

    builder += ' name="' + name + '" id="' + (attr.id || name) + ATTR_END;

    var keys = Object.keys(attr);
    var length = keys.length;

    for (var i = 0; i < length; i++) {

        switch (keys[i]) {
            case 'name':
            case 'id':
                break;
            case 'required':
            case 'disabled':
            case 'readonly':
            case 'value':
                builder += ' ' + keys[i] + '="' + keys[i] + ATTR_END;
                break;
            default:
                builder += ' ' + keys[i] + '="' + attr[keys[i]].toString().encode() + ATTR_END;
                break;
        }
    }

    if (typeof(model) === UNDEFINED)
        return builder + '></textarea>';

    var value = (model[name] || attr.value) || '';
    return builder + '>' + value.toString().encode() + '</textarea>';
};

/*
    Internal function for views
    @model {Object}
    @type {String}
    @name {String}
    @attr {Object} :: optional
    return {String}
*/
Controller.prototype.$input = function(model, type, name, attr) {

    var builder = ['<input'];

    if (typeof(attr) !== OBJECT)
        attr = {};

    var val = attr.value || '';

    builder += ' type="' + type + ATTR_END;

    if (type === 'radio')
        builder += ' name="' + name + ATTR_END;
    else
        builder += ' name="' + name + '" id="' + (attr.id || name) + ATTR_END;

    if (attr.autocomplete) {
        if (attr.autocomplete === true || attr.autocomplete === 'on')
            builder += ' autocomplete="on"';
        else
            builder += ' autocomplete="off"';
    }

    var keys = Object.keys(attr);
    var length = keys.length;

    for (var i = 0; i < length; i++) {

        switch (keys[i]) {
            case 'name':
            case 'id':
            case 'type':
            case 'autocomplete':
            case 'checked':
            case 'value':
            case 'label':
                break;
            case 'required':
            case 'disabled':
            case 'readonly':
            case 'autofocus':
                builder += ' ' + keys[i] + '="' + keys[i] + ATTR_END;
                break;
            default:
                builder += ' ' + keys[i] + '="' + attr[keys[i]].toString().encode() + ATTR_END;
                break;
        }
    }

    var value = '';

    if (typeof(model) !== UNDEFINED) {
        value = model[name];

        if (type === 'checkbox') {
            if (value === '1' || value === 'true' || value === true)
                builder += ' checked="checked"';

            value = val || '1';
        }

        if (type === 'radio') {

            val = (val || '').toString();

            if (value.toString() === val)
                builder += ' checked="checked"';

            value = val || '';
        }
    }

    if (typeof(value) !== UNDEFINED)
        builder += ' value="' + (value || '').toString().encode() + ATTR_END;
    else
        builder += ' value="' + (attr.value || '').toString().encode() + ATTR_END;

    builder += ' />';

    if (attr.label)
        return '<label>' + builder + ' <span>' + attr.label + '</span></label>';

    return builder;
};

/*
    Internal function for views
    @arguments {String}
    return {String}
*/
Controller.prototype.$dns = function(value) {

    var builder = '';
    var self = this;
    var length = arguments.length;

    for (var i = 0; i < length; i++)
        builder += '<link rel="dns-prefetch" href="' + self._prepareHost(arguments[i] || '') + '" />';

    self.head(builder);
    return '';
};

/*
    Internal function for views
    @arguments {String}
    return {String}
*/
Controller.prototype.$prefetch = function() {

    var builder = '';
    var self = this;
    var length = arguments.length;

    for (var i = 0; i < length; i++)
        builder += '<link rel="prefetch" href="' + self._prepareHost(arguments[i] || '') + '" />';

    self.head(builder);
    return '';
};

/*
    Internal function for views
    @arguments {String}
    return {String}
*/
Controller.prototype.$prerender = function(value) {

    var builder = '';
    var self = this;
    var length = arguments.length;

    for (var i = 0; i < length; i++)
        builder += '<link rel="prerender" href="' + self._prepareHost(arguments[i] || '') + '" />';

    self.head(builder);
    return '';
};

/*
    Internal function for views
    @value {String}
    return {String}
*/
Controller.prototype.$next = function(value) {
    var self = this;
    self.head('<link rel="next" href="' + self._prepareHost(value || '') + '" />');
    return '';
};

/*
    Internal function for views
    @arguments {String}
    return {String}
*/
Controller.prototype.$prev = function(value) {
    var self = this;
    self.head('<link rel="prev" href="' + self._prepareHost(value || '') + '" />');
    return '';
};

/*
    Internal function for views
    @arguments {String}
    return {String}
*/
Controller.prototype.$canonical = function(value) {
    var self = this;
    self.head('<link rel="canonical" href="' + self._prepareHost(value || '') + '" />');
    return '';
};

Controller.prototype._prepareHost = function(value) {
    var tmp = value.substring(0, 5);

    if (tmp !== 'http:' && tmp !== 'https://') {
        if (tmp[0] !== '/' || tmp[1] !== '/')
            value = this.host(value);
    }

    return value;
};

/*
    Internal function for views
    @arguments {String}
    return {String}
*/
Controller.prototype.head = function() {

    var self = this;

    var length = arguments.length;
    var header = (self.repository[REPOSITORY_HEAD] || '');

    if (length === 0) {
        var angularBeg = (self.repository[REPOSITORY_ANGULAR] || '') + (self.repository[REPOSITORY_ANGULAR_COMMON] || '') + (self.repository[REPOSITORY_ANGULAR_LOCALE] || '');
        var angularEnd = (angularBeg.length > 0 ? self.$script_create('/app.js') : '') + (self.repository[REPOSITORY_ANGULAR_OTHER] || '') + (self.repository[REPOSITORY_ANGULAR_CONTROLLER] || '');
        return (self.config.author && self.config.author.length > 0 ? '<meta name="author" content="' + self.config.author + '" />' : '') + angularBeg + header + angularEnd;
    }

    var output = '';
    for (var i = 0; i < length; i++) {

        var val = arguments[i];

        if (header.length > 0 && header.indexOf(val) !== -1)
            continue;

        if (val.indexOf('<') !== -1) {
            output += val;
            continue;
        }

        var tmp = val.substring(0, 7);
        var isRoute = (tmp[0] !== '/' && tmp[1] !== '/') && tmp !== 'http://' && tmp !== 'https:/';

        if (val.lastIndexOf(EXTENSION_JS) !== -1)
            output += '<script type="text/javascript" src="' + (isRoute ? self.routeJS(val) : val) + '"></script>';
        else if (val.lastIndexOf('.css') !== -1)
            output += '<link type="text/css" rel="stylesheet" href="' + (isRoute ? self.routeCSS(val) : val) + '" />';
    }

    header += output;
    self.repository[REPOSITORY_HEAD] = header;
    return self;
};

Controller.prototype.$head = function() {
    var self = this;
    self.head.apply(self, arguments);
    return '';
};

/*
    Internal function for views
    @arguments {String}
    return {Controller}
*/
Controller.prototype.place = function(name) {

    var self = this;

    var key = REPOSITORY_PLACE + '_' + name;
    var length = arguments.length;

    if (length === 1)
        return self.repository[key] || '';

    var output = '';
    for (var i = 1; i < length; i++) {

        var val = arguments[i];

        if (val.indexOf('<') !== -1) {
            output += val;
            continue;
        }

        if (val.lastIndexOf(EXTENSION_JS) === -1) {
            output += val;
            continue;
        }

        var tmp = val.substring(0, 7);
        var isRoute = (tmp[0] !== '/' && tmp[1] !== '/') && tmp !== 'http://' && tmp !== 'https:/';
        output += '<script type="text/javascript" src="' + (isRoute ? self.routeJS(val) : val) + '"></script>';
    }

    self.repository[key] = (self.repository[key] || '') + output;
    return self;
};

Controller.prototype.$place = function() {
    var self = this;
    if (arguments.length === 1)
        return self.place.apply(self, arguments);
    self.place.apply(self, arguments);
    return '';
};

/*
    Internal function for views
    @bool {Boolean}
    @charBeg {String}
    @charEnd {String}
    @value {String}
    return {String}
*/
Controller.prototype.$isValue = function(bool, charBeg, charEnd, value) {
    if (!bool)
        return '';

    charBeg = charBeg || ' ';
    charEnd = charEnd || '';

    return charBeg + value + charEnd;
};

/*
    Internal function for views
    @date {String or Date or Number} :: if {String} date format must has YYYY-MM-DD HH:MM:SS, {Number} represent Ticks (.getTime())
    return {String} :: empty string
*/
Controller.prototype.$modified = function(value) {

    var self = this;
    var type = typeof(value);
    var date;

    if (type === NUMBER) {
        date = new Date(value);
    } else if (type === STRING) {

        var d = value.split(' ');

        date = d[0].split('-');
        var time = (d[1] || '').split(':');

        var year = utils.parseInt(date[0] || '');
        var month = utils.parseInt(date[1] || '') - 1;
        var day = utils.parseInt(date[2] || '') - 1;

        if (month < 0)
            month = 0;

        if (day < 0)
            day = 0;

        var hour = utils.parseInt(time[0] || '');
        var minute = utils.parseInt(time[1] || '');
        var second = utils.parseInt(time[2] || '');

        date = new Date(year, month, day, hour, minute, second, 0);
    } else if (utils.isDate(value))
        date = value;

    if (typeof(date) === UNDEFINED)
        return '';

    self.setModified(date);
    return '';
};

/*
    Internal function for views
    @value {String}
    return {String} :: empty string
*/
Controller.prototype.$etag = function(value) {
    this.setModified(value);
    return '';
};

/*
    Internal function for views
    @arr {Array} :: array of object or plain value array
    @selected {Object} :: value for selecting item
    @name {String} :: name of name property, default: name
    @value {String} :: name of value property, default: value
    return {String}
*/
Controller.prototype.$options = function(arr, selected, name, value) {

    var self = this;
    var type = typeof(arr);

    if (arr === null || typeof(arr) === UNDEFINED)
        return '';

    var isObject = false;
    var tmp = null;

    if (!(arr instanceof Array) && type === OBJECT) {
        isObject = true;
        tmp = arr;
        arr = Object.keys(arr);
    }

    if (!utils.isArray(arr))
        arr = [arr];

    selected = selected || '';

    var options = '';

    if (!isObject) {
        if (typeof(value) === UNDEFINED)
            value = value || name || 'value';

        if (typeof(name) === UNDEFINED)
            name = name || 'name';
    }

    var isSelected = false;
    var length = 0;

    length = arr.length;

    for (var i = 0; i < length; i++) {

        var o = arr[i];
        var type = typeof(o);
        var text = '';
        var val = '';
        var sel = false;

        if (isObject) {
            if (name === true) {
                val = tmp[o];
                text = o;
                if (value === null)
                    value = '';
            } else {
                val = o;
                text = tmp[o];
                if (text === null)
                    text = '';
            }

        } else if (type === OBJECT) {

            text = (o[name] || '');
            val = (o[value] || '');

            if (typeof(text) === FUNCTION)
                text = text(i);

            if (typeof(val) === FUNCTION)
                val = val(i, text);

        } else {
            text = o;
            val = o;
        }

        if (!isSelected) {
            sel = val == selected;
            isSelected = sel;
        }

        options += '<option value="' + val.toString().encode() + '"' + (sel ? ' selected="selected"' : '') + '>' + text.toString().encode() + '</option>';
    }

    return options;
};

/*
    Append <script> TAG
    @name {String} :: filename
    return {String}
*/
Controller.prototype.$script = function(name) {
    return this.routeJS(name, true);
};

Controller.prototype.$js = function(name) {
    return this.routeJS(name, true);
};

/*
    Appedn style <link> TAG
    @name {String} :: filename
    return {String}
*/
Controller.prototype.$css = function(name) {
    return this.routeCSS(name, true);
};

/*
    Append <img> TAG
    @name {String} :: filename
    @width {Number} :: optional
    @height {Number} :: optional
    @alt {String} :: optional
    @className {String} :: optional
    return {String}
*/
Controller.prototype.$image = function(name, width, height, alt, className) {

    var style = '';

    if (typeof(width) === OBJECT) {
        height = width.height;
        alt = width.alt;
        className = width.class;
        style = width.style;
        width = width.width;
    }

    var builder = '<img src="' + this.routeImage(name) + ATTR_END;

    if (width > 0)
        builder += ' width="' + width + ATTR_END;

    if (height > 0)
        builder += ' height="' + height + ATTR_END;

    if (alt)
        builder += ' alt="' + alt.encode() + ATTR_END;

    if (className)
        builder += ' class="' + className + ATTR_END;

    if (style)
        builder += ' style="' + style + ATTR_END;

    return builder + ' border="0" />';
};

/*
    Append <a> TAG
    @filename {String}
    @innerHTML {String}
    @downloadName {String}
    @className {String} :: optional
    return {String}
*/
Controller.prototype.$download = function(filename, innerHTML, downloadName, className) {
    var builder = '<a href="' + this.framework.routeDownload(filename) + ATTR_END;

    if (downloadName)
        builder += ' download="' + downloadName + ATTR_END;

    if (className)
        builder += ' class="' + className + ATTR_END;

    return builder + '>' + (innerHTML || filename) + '</a>';
};

Controller.prototype.$json = function(obj, name, beautify) {

    if (typeof(name) === BOOLEAN) {
        var tmp = name;
        name = beautify;
        beautify = name;
    }

    var value = beautify ? JSON.stringify(obj, null, 4) : JSON.stringify(obj);

    if (!name)
        return value;

    return '<script type="application/json" id="' + name + '">' + value + '</script>';
};

/*
    Append favicon TAG
    @name {String} :: filename
    return {String}
*/
Controller.prototype.$favicon = function(name) {
    var self = this;
    var contentType = 'image/x-icon';

    if (typeof(name) === UNDEFINED)
        name = 'favicon.ico';

    if (name.lastIndexOf('.png') !== -1)
        contentType = 'image/png';

    if (name.lastIndexOf('.gif') !== -1)
        contentType = 'image/gif';

    name = self.framework.routeStatic('/' + name);

    return '<link rel="shortcut icon" href="' + name + '" type="' + contentType + '" /><link rel="icon" href="' + name + '" type="' + contentType + '" />';
};

Controller.prototype._routeHelper = function(current, name, fn) {

    var self = this;

    if (current.length === 0)
        return fn.call(self.framework, name);

    if (current.substring(0, 2) === '//' || current.substring(0, 6) === 'http:/' || current.substring(0, 7) === 'https:/')
        return fn.call(self.framework, current + name);

    if (current[0] === '~')
        return fn.call(self.framework, utils.path(current.substring(1)) + name);

    return fn.call(self.framework, utils.path(current) + name);
};

/*
    Static file routing
    @name {String} :: filename
    @tag {Boolean} :: optional, append tag? default: false
    return {String}
*/
Controller.prototype.routeJS = function(name, tag) {
    var self = this;

    if (typeof(name) === UNDEFINED)
        name = 'default.js';

    var url = self._routeHelper(self._currentJS, name, self.framework.routeJS);
    return tag ? '<script type="text/javascript" src="' + url + '"></script>' : url;
};

/*
    Static file routing
    @name {String} :: filename
    @tag {Boolean} :: optional, append tag? default: false
    return {String}
*/
Controller.prototype.routeCSS = function(name, tag) {
    var self = this;

    if (typeof(name) === UNDEFINED)
        name = 'default.css';

    var url = self._routeHelper(self._currentCSS, name, self.framework.routeCSS);
    return tag ? '<link type="text/css" rel="stylesheet" href="' + url + '" />' : url;
};

/*
    Static file routing
    @name {String} :: filename
    return {String}
*/
Controller.prototype.routeImage = function(name) {
    var self = this;
    return self._routeHelper(self._currentImage, name, self.framework.routeImage);
};

/*
    Static file routing
    @name {String} :: filename
    return {String}
*/
Controller.prototype.routeVideo = function(name) {
    var self = this;
    return self._routeHelper(self._currentVideo, name, self.framework.routeVideo);
};

/*
    Static file routing
    @name {String} :: filename
    return {String}
*/
Controller.prototype.routeFont = function(name) {
    var self = this;
    return self.framework.routeFont(name);
};

/*
    Static file routing
    @name {String} :: filename
    return {String}
*/
Controller.prototype.routeDownload = function(name) {
    var self = this;
    return self._routeHelper(self._currentDownload, name, self.framework.routeDownload);
};

/*
    Static file routing
    @name {String} :: filename
    return {String}
*/
Controller.prototype.routeStatic = function(name) {
    var self = this;
    return self.framework.routeStatic(name);
};

/*
    Internal
    @path {String} :: add path to route path
    return {String}
*/
Controller.prototype.$currentJS = function(path) {
    this._currentJS = path && path.length > 0 ? path : '';
    return '';
};

/*
    Internal
    @path {String} :: add path to route path
    return {String}
*/
Controller.prototype.$currentView = function(path) {
    var self = this;

    if (typeof(path) === UNDEFINED) {
        self._currentView = self.name[0] !== '#' && self.name !== 'default' ? '/' + self.name + '/' : '';
        return self;
    }

    self._currentView = path && path.length > 0 ? utils.path(path) : '';
    return '';
};

/*
    Internal
    @path {String} :: add path to route path
    return {String}
*/
Controller.prototype.$currentTemplate = function(path) {
    this._currentTemplate = path && path.length > 0 ? utils.path(path) : '';
    return '';
};

/*
    Internal
    @path {String} :: add path to route path
    return {String}
*/
Controller.prototype.$currentContent = function(path) {
    this._currentContent = path && path.length > 0 ? utils.path(path) : '';
    return '';
};

/*
    Internal
    @path {String} :: add path to route path
    return {String}
*/
Controller.prototype.currentView = function(path) {
    var self = this;
    self.$currentView(path);
    self._defaultView = self._currentView;
    return self;
};

/*
    Internal
    @path {String} :: add path to route path
    return {String}
*/
Controller.prototype.currentTemplate = function(path) {
    var self = this;
    self.$currentTemplate(path);
    self._defaultTemplate = self._currentTemplate;
    return self;
};

/*
    Internal
    @path {String} :: add path to route path
    return {String}
*/
Controller.prototype.currentContent = function(path) {
    var self = this;
    self.$currentContent(path);
    self._defaultContent = self._currentContent;
    return self;
};

/*
    Internal
    @path {String} :: add path to route path
    return {String}
*/
Controller.prototype.$currentCSS = function(path) {
    this._currentCSS = path && path.length > 0 ? path : '';
    return '';
};

/*
    Internal
    @path {String} :: add path to route path
    return {String}
*/
Controller.prototype.$currentImage = function(path) {
    this._currentImage = path && path.length > 0 ? path : '';
    return '';
};

/*
    Internal
    @path {String} :: add path to route path
    return {String}
*/
Controller.prototype.$currentVideo = function(path) {
    this._currentVideo = path && path.length > 0 ? path : '';
    return '';
};

/*
    Internal
    @path {String} :: add path to route path
    return {String}
*/
Controller.prototype.$currentDownload = function(path) {
    this._currentDownload = path && path.length > 0 ? path : '';
    return '';
};

/*
    Set current image path
    @path {String}
    return {Controller}
*/
Controller.prototype.currentImage = function(path) {
    var self = this;
    self.$currentImage(path);
    self._defaultImage = self._currentImage;
    return self;
};

/*
    Set current download path
    @path {String}
    return {Controller}
*/
Controller.prototype.currentDownload = function(path) {
    var self = this;
    self.$currentDownload(path);
    self._defaultDownload = self._currentDownload;
    return self;
};

/*
    Set current CSS path
    @path {String}
    return {Controller}
*/
Controller.prototype.currentCSS = function(path) {
    var self = this;
    self.$currentCSS(path);
    self._defaultCSS = self._currentCSS;
    return self;
};

/*
    Set current JS path
    @path {String}
    return {Controller}
*/
Controller.prototype.currentJS = function(path) {
    var self = this;
    self.$currentJS(path);
    self._defaultJS = self._currentJS;
    return self;
};

/*
    Set current video path
    @path {String}
    return {Controller}
*/
Controller.prototype.currentVideo = function(path) {
    var self = this;
    self.$currentVideo(path);
    self._defaultVideo = self._currentVideo;
    return self;
};

/*
    Resource reader
    @name {String} :: filename
    @key {String}
    return {String}
*/
Controller.prototype.resource = function(name, key) {
    var self = this;
    return self.framework.resource(name, key);
};

/*
    Render template to string
    @name {String} :: filename
    @model {Object}
    @nameEmpty {String} :: filename for empty Contents
    @repository {Object}
    @cb {Function} :: callback(string)
    return {String}
*/
Controller.prototype.template = function(name, model, nameEmpty, repository) {

    var self = this;

    if (typeof(nameEmpty) === OBJECT) {
        repository = nameEmpty;
        nameEmpty = '';
    }

    if (typeof(model) === UNDEFINED || model === null || model.length === 0) {

        if (typeof(nameEmpty) !== UNDEFINED && nameEmpty.length > 0)
            return self.$content(nameEmpty);

        return '';
    }

    if (typeof(repository) === UNDEFINED)
        repository = self.repository;

    var plus = '';

    if (name[0] !== '~')
        plus = self._currentTemplate;

    try {
        return internal.generateTemplate(self, name, model, repository, plus);
    } catch (ex) {
        self.error(new Error('Template: ' + name + ' - ' + ex.toString()));
        return '';
    }
};

/*
    Render component to string
    @name {String}
    return {String}
*/
Controller.prototype.component = function(name) {
    var self = this;
    var component = framework.component(name);

    if (component === null)
        return '';

    var length = arguments.length;
    var params = [];

    for (var i = 1; i < length; i++)
        params.push(arguments[i]);

    var output = component.render.apply(self, params);
    return output;
};

/*
    Render component to string
    @name {String}
    return {String}
*/
Controller.prototype.helper = function(name) {
    var self = this;
    var helper = framework.helpers[name] || null;

    if (helper === null)
        return '';

    var length = arguments.length;
    var params = [];

    for (var i = 1; i < length; i++)
        params.push(arguments[i]);

    return helper.apply(self, params);
};

/*
    Response JSON
    @obj {Object}
    @headers {Object} :: optional
    return {Controller};
*/
Controller.prototype.json = function(obj, headers, beautify) {
    var self = this;

    if (self.res.success || !self.isConnected)
        return self;

    if (typeof(headers) === BOOLEAN) {
        var tmp = headers;
        beautify = headers;
        headers = tmp;
    }

    if (obj instanceof builders.ErrorBuilder)
        obj = obj.json(beautify);
    else {
        if (beautify)
            obj = JSON.stringify(obj || {}, null, 4);
        else
            obj = JSON.stringify(obj || {});
    }

    self.subscribe.success();
    self.framework.responseContent(self.req, self.res, self.status, obj, 'application/json', self.config['allow-gzip'], headers);
    self.framework.stats.response.json++;

    if (self.precache)
        self.precache(obj, 'application/json', headers);

    return self;
};

/*
    Set custom response
    return {Boolean}
*/
Controller.prototype.custom = function() {

    var self = this;
    if (self.res.success || !self.isConnected)
        return false;

    self.subscribe.success();
    self.res.success = true;
    self.framework.stats.response.custom++;
    self.framework._request_stats(false, false);
    self.framework.emit('request-end', self.req, self.res);

    return true;

};

/*
    Manul clear request data
    @enable {Boolean} :: enable manual clear - controller.clear()
    return {Controller}
*/
Controller.prototype.noClear = function(enable) {
    var self = this;
    self.req._manual = typeof(enable) === UNDEFINED ? true : enable;
    return self;
};

/*
    Response JSON ASYNC
    @obj {Object}
    @headers {Object} :: optional
    return {Controller};
*/
Controller.prototype.jsonAsync = function(obj, headers, beautify) {
    var self = this;

    var fn = function() {
        self.json(obj, headers, beautify);
    };

    self.async.complete(fn);
    return self;
};

/*
    !!! pell-mell
    Response custom content or Return content from Contents
    @contentBody {String}
    @contentType {String} :: optional
    @headers {Object} :: optional
    return {Controller or String}; :: return String when contentType is undefined
*/
Controller.prototype.content = function(contentBody, contentType, headers) {

    var self = this;
    var type = typeof(contentType);

    if (type === UNDEFINED) {
        self.content(self.$contentToggle(true, contentBody), CONTENTTYPE_TEXTHTML, headers);
        return;
    }

    if (type === BOOLEAN)
        return self.$contentToggle(true, contentBody);

    if (self.res.success || !self.isConnected)
        return self;

    self.subscribe.success();
    self.framework.responseContent(self.req, self.res, self.status, contentBody, contentType || CONTENTTYPE_TEXTPLAIN, self.config['allow-gzip'], headers);
    return self;
};

/*
    Response plain text
    @contentBody {String}
    @headers {Object} :: optional
    return {Controller};
*/
Controller.prototype.plain = function(contentBody, headers) {
    var self = this;

    if (self.res.success || !self.isConnected)
        return self;

    var type = typeof(contentBody);

    if (type === UNDEFINED)
        contentBody = '';
    else if (type === OBJECT)
        contentBody = contentBody === null ? '' : JSON.stringify(contentBody, null, 4);
    else
        contentBody = contentBody === null ? '' : contentBody.toString();

    self.subscribe.success();
    self.framework.responseContent(self.req, self.res, self.status, contentBody, CONTENTTYPE_TEXTPLAIN, self.config['allow-gzip'], headers);
    self.framework.stats.response.plain++;

    if (self.precache)
        self.precache(contentBody, CONTENTTYPE_TEXTPLAIN, headers);

    return self;
};

/*
    Response empty content
    @headers {Object} :: optional
    return {Controller};
*/
Controller.prototype.empty = function(headers) {
    var self = this;

    if (self.res.success || !self.isConnected)
        return self;

    var code = 204;

    if (typeof(headers) === NUMBER) {
        code = headers;
        headers = null;
    }

    self.subscribe.success();
    self.framework.responseContent(self.req, self.res, code, '', CONTENTTYPE_TEXTPLAIN, false, headers);
    self.framework.stats.response.empty++;

    return self;
};

Controller.prototype.destroy = function() {
    var self = this;

    if (self.res.success || !self.isConnected)
        return self;

    self.subscribe.success();
    self.req.connection.destroy();
    self.framework.stats.response.destroy++;

    return self;
};

/*
    Response a file
    @filename {String}
    @downloadName {String} :: optional
    @headers {Object} :: optional
    return {Controller};
*/
Controller.prototype.file = function(filename, downloadName, headers) {
    var self = this;

    if (self.res.success || !self.isConnected)
        return self;

    if (filename[0] === '~')
        filename = '.' + filename.substring(1);
    else
        filename = utils.combine(self.framework.config['directory-public'], filename);

    self.subscribe.success();
    self.framework.responseFile(self.req, self.res, filename, downloadName, headers);

    return self;
};

/*
    Response an image
    @filename {String or Stream}
    @fnProcess {Function} :: function(FrameworkImage) {}
    @headers {Object} :: optional, additional headers
    @useImageMagick {Boolean} :: optional, use ImageMagick (otherwise is used GraphicsMagick), default false
    return {Framework}
*/
Controller.prototype.image = function(filename, fnProcess, headers, useImageMagick) {
    var self = this;

    if (self.res.success || !self.isConnected)
        return self;

    if (typeof(filename) === STRING) {
        if (filename[0] === '~')
            filename = '.' + filename.substring(1);
        else
            filename = utils.combine(self.framework.config['directory-public'], filename);
    }

    self.subscribe.success();
    self.framework.responseImage(self.req, self.res, filename, fnProcess, headers, useImageMagick);

    return self;
};

/*
    Response Async file
    @filename {String}
    @downloadName {String} :: optional
    @headers {Object} :: optional
    return {Controller};
*/
Controller.prototype.fileAsync = function(filename, downloadName, headers) {
    var self = this;

    var fn = function() {
        self.file(filename, downloadName, headers);
    };

    self.async.complete(fn);
    return self;
};

/*
    Response stream
    @contentType {String}
    @stream {ReadStream}
    @downloadName {String} :: optional
    @headers {Object} :: optional key/value
    return {Controller}
*/
Controller.prototype.stream = function(contentType, stream, downloadName, headers) {
    var self = this;

    if (self.res.success || !self.isConnected)
        return self;

    self.subscribe.success();
    self.framework.responseStream(self.req, self.res, contentType, stream, downloadName, headers);
    return self;
};

/**
 * Throw 401 - Bad request.
 * @param  {String} problem Description of problem (optional)
 * @return {FrameworkController}
 */
Controller.prototype.throw400 = function(problem) {
    return this.view400(problem);
};

/*
    Response 400
    return {Controller};
*/
Controller.prototype.view400 = function(problem) {
    var self = this;

    if (problem && problem.length > 0)
        self.problem(problem);

    if (self.res.success || !self.isConnected)
        return self;

    self.req.path = [];
    self.subscribe.success();
    self.subscribe.route = self.framework.lookup(self.req, '#400', []);
    self.subscribe.exception = problem;
    self.subscribe.execute(400);
    return self;
};

/**
 * Throw 401 - Unauthorized.
 * @param  {String} problem Description of problem (optional)
 * @return {FrameworkController}
 */
Controller.prototype.throw401 = function(problem) {
    return this.view401(problem);
};

/*
    Response 401
    return {Controller};
*/
Controller.prototype.view401 = function(problem) {
    var self = this;

    if (problem && problem.length > 0)
        self.problem(problem);

    if (self.res.success || !self.isConnected)
        return self;

    self.req.path = [];
    self.subscribe.success();
    self.subscribe.route = self.framework.lookup(self.req, '#401', []);
    self.subscribe.exception = problem;
    self.subscribe.execute(401);
    return self;
};

/**
 * Throw 403 - Forbidden.
 * @param  {String} problem Description of problem (optional)
 * @return {FrameworkController}
 */
Controller.prototype.throw403 = function(problem) {
    return this.view403(problem);
};

/*
    Response 403
    return {Controller};
*/
Controller.prototype.view403 = function(problem) {
    var self = this;

    if (problem && problem.length > 0)
        self.problem(problem);

    if (self.res.success || !self.isConnected)
        return self;

    self.req.path = [];
    self.subscribe.success();
    self.subscribe.route = self.framework.lookup(self.req, '#403', []);
    self.subscribe.exception = problem;
    self.subscribe.execute(403);
    return self;
};

/**
 * Throw 404 - Not found.
 * @param  {String} problem Description of problem (optional)
 * @return {FrameworkController}
 */
Controller.prototype.throw404 = function(problem) {
    return this.view404(problem);
};
/*
    Response 404
    return {Controller};
*/
Controller.prototype.view404 = function(problem) {
    var self = this;

    if (problem && problem.length > 0)
        self.problem(problem);

    if (self.res.success || !self.isConnected)
        return self;

    self.req.path = [];
    self.subscribe.success();
    self.subscribe.route = self.framework.lookup(self.req, '#404', []);
    self.subscribe.exception = problem;
    self.subscribe.execute(404);
    return self;
};

/*
    Response 500
    @error {String}
    return {Controller};
*/
Controller.prototype.view500 = function(error) {
    var self = this;

    self.framework.error(typeof(error) === STRING ? new Error(error) : error, self.name, self.req.uri);

    if (self.res.success || !self.isConnected)
        return self;

    self.req.path = [];
    self.subscribe.exception = error;
    self.subscribe.success();
    self.subscribe.route = self.framework.lookup(self.req, '#500', []);
    self.subscribe.exception = error;
    self.subscribe.execute(500);
    return self;
};

/**
 * Throw 500 - Internal Server Error
 * @param  {Error} error
 * @return {FrameworkController}
 */
Controller.prototype.throw500 = function(error) {
    return this.view500(error);
};

/**
 * Throw 501 - Not implemented
 * @param  {String} problem Description of the problem (optional)
 * @return {FrameworkController}
 */
Controller.prototype.view501 = function(problem) {
    var self = this;

    if (problem && problem.length > 0)
        self.problem(problem);

    if (self.res.success || !self.isConnected)
        return self;

    self.req.path = [];
    self.subscribe.success();
    self.subscribe.route = self.framework.lookup(self.req, '#501', []);
    self.subscribe.exception = problem;
    self.subscribe.execute(501);
    return self;
};

/**
 * Throw 501 - Not implemented
 * @param  {String} problem Description of the problem (optional)
 * @return {FrameworkController}
 */
Controller.prototype.throw501 = function(problem) {
    return this.view501(problem);
};

/*
    Response redirect
    @url {String}
    @permanent {Boolean} :: optional default false
    return {Controller};
*/
Controller.prototype.redirect = function(url, permanent) {
    var self = this;

    if (self.res.success || !self.isConnected)
        return self;

    self.subscribe.success();
    self.req.clear(true);
    self.res.success = true;
    self.res.writeHead(permanent ? 301 : 302, {
        'Location': url
    });
    self.res.end();
    self.framework._request_stats(false, false);
    self.framework.emit('request-end', self.req, self.res);
    self.framework.stats.response.redirect++;

    return self;
};

/*
    Response Async View
    @name {String}
    @model {Object} :: optional
    @headers {Object} :: optional
    return {Controller};
*/
Controller.prototype.redirectAsync = function(url, permanent) {
    var self = this;

    var fn = function() {
        self.redirect(url, permanent);
    };

    self.async.complete(fn);
    return self;
};

/*
    Binary response
    @buffer {Buffer}
    return {Framework}
*/
Controller.prototype.binary = function(buffer) {
    var self = this;

    if (self.res.success || !self.isConnected)
        return self;

    self.subscribe.success();
    self.req.clear(true);
    self.res.success = true;
    self.res.write(buffer.toString('binary'), 'binary');
    self.res.end();
    self.framework._request_stats(false, false);
    self.framework.emit('request-end', self.req, self.res);
    self.framework.stats.response.binary++;

    return self;
};

/*
    Basic access authentication (baa)
    @name {String} :: optional, default Administration
    return {Object} :: if null then user is not authenticated else return { name: {String}, password: {String} };
*/
Controller.prototype.baa = function(name) {

    var self = this;
    var authorization = self.req.headers['authorization'] || '';

    if (authorization === '') {
        self.res.setHeader('WWW-Authenticate', 'Basic realm="' + (name || 'Administration') + '"');
        self.view401();
        return null;
    }

    return self.req.authorization();
};

/*
    Send data via [S]erver-[s]ent [e]vents
    @data {String or Object}
    @eventname {String} :: optional
    @id {String} :: optional
    @retry {Number} :: optional, reconnection in milliseconds
    return {Controller};
*/
Controller.prototype.sse = function(data, eventname, id, retry) {

    var self = this;
    var res = self.res;

    if (!self.isConnected)
        return self;

    if (self.type === 0 && res.success)
        throw new Error('Response was sent.');

    if (self.type > 0 && self.type !== 1)
        throw new Error('Response was used.');

    if (self.type === 0) {

        self.type = 1;

        if (typeof(retry) === UNDEFINED)
            retry = self.subscribe.route.timeout;

        self.subscribe.success();
        self.req.on('close', self.close.bind(self));
        res.success = true;
        var headers = {
            'Pragma': 'no-cache'
        };
        headers[RESPONSE_HEADER_CACHECONTROL] = 'no-cache, no-store, max-age=0, must-revalidate';
        headers[RESPONSE_HEADER_CONTENTTYPE] = 'text/event-stream';
        res.writeHead(self.status, headers);
    }

    if (typeof(data) === OBJECT)
        data = JSON.stringify(data);
    else
        data = data.replace(/\n/g, '\\n').replace(/\r/g, '\\r');

    var newline = '\n';
    var builder = '';

    if (eventname && eventname.length > 0)
        builder = 'event: ' + eventname + newline;

    builder += 'data: ' + data + newline;

    if (id && id.toString().length > 0)
        builder += 'id: ' + id + newline;

    if (retry && retry > 0)
        builder += 'retry: ' + retry + newline;

    builder += newline;

    res.write(builder);
    self.framework.stats.response.sse++;

    return self;
};

/*
    Send a file or stream via [m]ultipart/x-[m]ixed-[r]eplace
    @filename {String}
    @{stream} {Stream} :: optional, if undefined then framework reads by the filename file from disk
    @cb {Function} :: callback if stream is sent
    return {Controller}
*/
Controller.prototype.mmr = function(filename, stream, cb) {

    var self = this;
    var res = self.res;

    if (!self.isConnected)
        return self;

    if (self.type === 0 && res.success)
        throw new Error('Response was sent.');

    if (self.type > 0 && self.type !== 2)
        throw new Error('Response was used.');

    if (self.type === 0) {
        self.type = 2;
        self.boundary = '----totaljs' + utils.GUID(10);
        self.subscribe.success();
        res.success = true;
        self.req.on('close', self.close.bind(self));
        var headers = {
            'Pragma': 'no-cache'
        };
        headers[RESPONSE_HEADER_CONTENTTYPE] = 'multipart/x-mixed-replace; boundary=' + self.boundary;
        headers[RESPONSE_HEADER_CACHECONTROL] = 'no-cache, no-store, max-age=0, must-revalidate';
        res.writeHead(self.status, headers);
    }

    var type = typeof(stream);

    if (type === FUNCTION) {
        cb = stream;
        stream = null;
    }

    res.write('--' + self.boundary + '\r\n' + RESPONSE_HEADER_CONTENTTYPE + ': ' + utils.getContentType(path.extname(filename)) + '\r\n\r\n');

    if (typeof(stream) !== UNDEFINED && stream !== null) {

        stream.on('end', function() {
            self = null;
            if (cb)
                cb();
        });

        stream.pipe(res, {
            end: false
        });
        self.framework.stats.response.mmr++;
        return self;
    }

    stream = fs.createReadStream(filename);

    stream.on('end', function() {
        self = null;
        if (cb)
            cb();
    });

    stream.pipe(res, {
        end: false
    });
    self.framework.stats.response.mmr++;

    return self;
};

/*
    Close a response
    @end {Boolean} :: end response? - default true
    return {Controller}
*/
Controller.prototype.close = function(end) {
    var self = this;

    if (typeof(end) === UNDEFINED)
        end = true;

    if (!self.isConnected)
        return self;

    if (self.type === 0) {

        self.isConnected = false;

        if (!self.res.success) {

            self.res.success = true;

            if (end)
                self.res.end();

            self.framework._request_stats(false, false);
            self.framework.emit('request-end', self.req, self.res);
        }

        return self;
    }

    if (self.type === 2)
        self.res.write('\r\n\r\n--' + self.boundary + '--');

    self.isConnected = false;
    self.res.success = true;

    if (end)
        self.res.end();

    self.framework._request_stats(false, false);
    self.framework.emit('request-end', self.req, self.res);
    self.type = 0;

    return self;
};

/*
    Send proxy request
    @url {String}
    @obj {Object}
    @fnCallback {Function} :: optional
    @timeout {Number} :: optional
    return {Controller}
*/
Controller.prototype.proxy = function(url, obj, fnCallback, timeout) {

    var self = this;
    var headers = {
        'X-Proxy': 'total.js'
    };

    headers[RESPONSE_HEADER_CONTENTTYPE] = 'application/json';

    var tmp;

    if (typeof(fnCallback) === NUMBER) {
        tmp = timeout;
        timeout = fnCallback;
        fnCallback = tmp;
    }

    if (typeof(obj) === FUNCTION) {
        tmp = fnCallback;
        fnCallback = obj;
        obj = tmp;
    }

    utils.request(url, ['post', 'json'], obj, function(error, data, code, headers) {

        if (!fnCallback)
            return;

        if ((headers['content-type'] || '').indexOf('application/json') !== -1)
            data = JSON.parse(data);

        fnCallback.call(self, error, data, code, headers);

    }, null, headers, 'utf8', timeout || 10000);

    return self;
};

/*
    Return database
    @name {String}
    return {NoSQL};
*/
Controller.prototype.database = function() {
    var self = this.framework;
    return self.database.apply(self, arguments);
};

/*
    Response view
    @name {String}
    @model {Object} :: optional
    @headers {Object} :: optional
    @isPartial {Boolean} :: optional
    return {Controller or String}; string is returned when isPartial == true
*/
Controller.prototype.view = function(name, model, headers, isPartial) {
    var self = this;

    if (typeof(isPartial) === UNDEFINED && typeof(headers) === BOOLEAN) {
        isPartial = headers;
        headers = null;
    }

    if (self.res.success && !isPartial)
        return self;

    var skip = name[0] === '~';
    var filename = name;
    var isLayout = self.isLayout;

    self.isLayout = false;

    if (!self.isLayout && !skip)
        filename = self._currentView + name;

    if (skip)
        filename = name.substring(1);

    var generator = internal.generateView(self, name, filename);
    if (generator === null) {

        if (isPartial)
            return self.outputPartial;

        var err = 'View "' + filename + '" not found.';

        if (isLayout) {
            self.subscribe.success();
            self.framework.response500(self.req, self.res, err);
            return;
        }

        self.view500(err);
        return;
    }

    var value = '';
    self.$model = model;

    var sitemap = function() {
        return self.sitemap.apply(self, arguments);
    };

    if (isLayout) {
        self._currentCSS = self._defaultCSS || '';
        self._currentJS = self._defaultJS || '';
        self._currentDownload = self._defaultDownload || '';
        self._currentVideo = self._defaultVideo || '';
        self._currentImage = self._defaultImage || '';
        self._currentView = self._defaultView || '';
        self._currentTemplate = self._defaultTemplate || '';
        self._currentContent = self._defaultContent || '';
    }

    var helpers = self.framework.helpers;

    try {
        value = generator.call(self, self, self.repository, model, self.session, self.get, self.post, self.url, self.framework.global, helpers, self.user, self.config, self.framework.functions, 0, sitemap, isPartial ? self.outputPartial : self.output);
    } catch (ex) {

        var err = new Error('View: ' + name + ' - ' + ex.toString());

        if (!isPartial) {
            self.view500(err);
            return;
        }

        self.error(err);

        if (self.isPartial) {
            value = self.outputPartial;
            self.outputPartial = '';
        } else {
            value = self.output;
            self.output = '';
        }

        isLayout = false;
        return value;
    }

    if (!isLayout && self.precache && self.status === 200)
        self.precache(value, CONTENTTYPE_TEXTHTML, headers, true);

    if (isLayout || utils.isNullOrEmpty(self.layoutName)) {

        self.outputPartial = '';
        self.output = '';
        isLayout = false;

        if (isPartial)
            return value;

        self.subscribe.success();

        if (!self.isConnected)
            return;

        self.framework.responseContent(self.req, self.res, self.status, value, CONTENTTYPE_TEXTHTML, self.config['allow-gzip'], headers);
        self.framework.stats.response.view++;

        return self;
    }

    if (isPartial)
        self.outputPartial = value;
    else
        self.output = value;

    self.isLayout = true;
    value = self.view(self.layoutName, self.$model, headers, isPartial);

    if (isPartial) {
        self.outputPartial = '';
        self.isLayout = false;
        return value;
    }

    return self;
};

/*
    Memorize a view (without layout) into the cache
    @key {String} :: cache key
    @expire {Date} :: expiration
    @disabled {Boolean} :: disabled for debug mode
    @fnTo {Function} :: if cache not exist
    @fnFrom {Function} :: optional, if cache is exist
    return {Controller}
*/
Controller.prototype.memorize = function(key, expire, disabled, fnTo, fnFrom) {

    var self = this;
    var output = self.cache.read(key);

    if (output === null) {

        if (disabled === true) {
            fnTo();
            return self;
        }

        self.precache = function(value, contentType, headers, isView) {

            var options = {
                content: value,
                type: contentType
            };

            if (headers)
                options.headers = headers;

            if (isView) {
                var keys = Object.keys(self.repository);
                var length = keys.length;
                options.repository = [];
                for (var i = 0; i < length; i++) {
                    var name = keys[i];
                    if (name[0] === '$' || name === 'sitemap') {
                        var value = self.repository[name];
                        if (value)
                            options.repository.push({
                                key: name,
                                value: value
                            });
                    }
                }
            }

            self.cache.add(key, options, expire);
            self.precache = null;
        };

        if (typeof(disabled) === FUNCTION)
            fnTo = disabled;

        fnTo();
        return self;
    }

    if (typeof(disabled) === FUNCTION) {
        var tmp = fnTo;
        fnTo = disabled;
        fnFrom = tmp;
    }

    if (fnFrom)
        fnFrom();

    if (output.type !== CONTENTTYPE_TEXTHTML)
        self.framework.responseContent(self.req, self.res, self.status, output.content, output.type, self.config['allow-gzip'], output.headers);

    switch (output.type) {
        case CONTENTTYPE_TEXTPLAIN:
            self.framework.stats.response.plain++;
            return self;
        case 'application/json':
            self.framework.stats.response.json++;
            return self;
        case CONTENTTYPE_TEXTHTML:
            self.framework.stats.response.view++;
            break;
    }

    var length = output.repository.length;
    for (var i = 0; i < length; i++)
        self.repository[output.repository[i].key] = output.repository[i].value;

    if (utils.isNullOrEmpty(self.layoutName)) {

        self.subscribe.success();

        if (!self.isConnected)
            return self;

        self.framework.responseContent(self.req, self.res, self.status, output.content, output.type, self.config['allow-gzip'], output.headers);
        return self;
    }

    self.output = output.content;
    self.isLayout = true;
    self.view(self.layoutName, null);

    return self;
};

/*
    Response Async View
    @name {String}
    @model {Object} :: optional
    @headers {Object} :: optional
    return {Controller};
*/
Controller.prototype.viewAsync = function(name, model, headers) {
    var self = this;

    var fn = function() {
        self.view(name, model, headers);
    };

    self.async.complete(fn);
    return self;
};

// *********************************************************************************
// =================================================================================
// Framework.WebSocket
// =================================================================================
// *********************************************************************************

var NEWLINE = '\r\n';
var SOCKET_RESPONSE = 'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nX-Powered-By: {0}\r\nSec-WebSocket-Accept: {1}\r\n\r\n';
var SOCKET_RESPONSE_ERROR = 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nX-WebSocket-Reject-Reason: 403 Forbidden\r\n\r\n';
var SOCKET_HASH = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
var SOCKET_ALLOW_VERSION = [13];

/*
    WebSocket
    @framework {total.js}
    @path {String}
    @name {String} :: Controller name
    return {WebSocket}
*/
function WebSocket(framework, path, name, id) {
    this._keys = [];
    this.id = id;
    this.online = 0;
    this.connections = {};
    this.framework = framework;
    this.repository = {};
    this.name = name;
    this.url = utils.path(path);

    // on('open', function(client) {});
    // on('close', function(client) {});
    // on('message', function(client, message) {});
    // on('error', function(error, client) {});
    events.EventEmitter.call(this);
}

WebSocket.prototype = {

    get global() {
        return this.framework.global;
    },

    get config() {
        return this.framework.config;
    },

    get cache() {
        return this.framework.cache;
    },

    get isDebug() {
        return this.framework.config.debug;
    },

    get path() {
        return this.framework.path;
    },

    get fs() {
        return this.framework.fs;
    },

    get isSecure() {
        return this.req.isSecure;
    },

    get async() {

        var self = this;

        if (typeof(self._async) === UNDEFINED)
            self._async = new utils.Async(self);

        return self._async;
    }
}

WebSocket.prototype.__proto__ = Object.create(events.EventEmitter.prototype, {
    constructor: {
        value: WebSocket,
        enumberable: false
    }
});

/*
    Send message
    @message {String or Object}
    @id {String Array}
    @blacklist {String Array}
    return {WebSocket}
*/
WebSocket.prototype.send = function(message, id, blacklist) {

    var self = this;
    var keys = self._keys;
    var length = keys.length;

    if (length === 0)
        return self;


    var fn = typeof(blacklist) === FUNCTION ? blacklist : null;
    var is = blacklist instanceof Array;

    if (typeof(id) === UNDEFINED || id === null || id.length === 0) {

        for (var i = 0; i < length; i++) {

            var _id = keys[i];

            if (is && blacklist.indexOf(_id) !== -1)
                continue;

            var conn = self.connections[_id];

            if (fn !== null && !fn.call(self, _id, conn))
                continue;

            conn.send(message);
            self.framework.stats.response.websocket++;
        }

        self.emit('send', message, null, []);
        return self;
    }

    fn = typeof(id) === FUNCTION ? id : null;
    is = id instanceof Array;

    for (var i = 0; i < length; i++) {

        var _id = keys[i];

        if (is && id.indexOf(_id) === -1)
            continue;

        var conn = self.connections[_id];

        if (fn !== null && !fn.call(self, _id, conn) === -1)
            continue;

        conn.send(message);
        self.framework.stats.response.websocket++;
    }

    self.emit('send', message, id, blacklist);
    return self;
};

/*
    Close connection
    @id {String Array} :: optional, default null
    @message {String} :: optional
    @code {Number} :: optional, default 1000
    return {WebSocket}
*/
WebSocket.prototype.close = function(id, message, code) {

    var self = this;
    var keys = self._keys;

    if (typeof(id) === STRING) {
        code = message;
        message = id;
        id = null;
    }

    if (keys === null)
        return self;

    var length = keys.length;

    if (length === 0)
        return self;

    if (typeof(id) === UNDEFINED || id === null || id.length === 0) {
        for (var i = 0; i < length; i++) {
            var _id = keys[i];
            self.connections[_id].close(message, code);
            self._remove(_id);
        }
        self._refresh();
        return self;
    }

    var is = id instanceof Array;
    var fn = typeof(id) === FUNCTION ? id : null;

    for (var i = 0; i < length; i++) {

        var _id = keys[i];

        if (is && id.indexOf(_id) === -1)
            continue;

        var conn = self.connections[_id];

        if (fn !== null && !fn.call(self, _id, conn))
            continue;

        conn.close(message, code);
        self._remove(_id);
    }

    self._refresh();
    return self;
};

/*
    Error
    @err {Error}
    return {Framework}
*/
WebSocket.prototype.error = function(err) {
    var self = this;
    self.framework.error(typeof(err) === STRING ? new Error(err) : err, self.name, self.path);
    return self;
};

/*
    Problem
    @message {String}
    return {Framework}
*/
WebSocket.prototype.problem = function(message) {
    var self = this;
    self.framework.problem(message, self.name, self.uri);
    return self;
};

/*
    Change
    @message {String}
    return {Framework}
*/
WebSocket.prototype.change = function(message) {
    var self = this;
    self.framework.change(message, self.name, self.uri, self.ip);
    return self;
};


/*
    All connections (forEach)
    @fn {Function} :: function(client, index) {}
    return {WebSocketClient};
*/
WebSocket.prototype.all = function(fn) {

    var self = this;
    var length = self._keys.length;

    for (var i = 0; i < length; i++) {
        var id = self._keys[i];
        if (fn(self.connections[id], i))
            break;
    }

    return self;
};

/*
    Find a connection
    @id {String or Function} :: function(client, id) {}
    return {WebSocketClient}
*/
WebSocket.prototype.find = function(id) {
    var self = this;
    var length = self._keys.length;
    var isFn = typeof(id) === FUNCTION;

    for (var i = 0; i < length; i++) {
        var connection = self.connections[self._keys[i]];

        if (!isFn) {
            if (connection.id === id)
                return connection;
            continue;
        }

        if (id(connection, connection.id))
            return connection;
    }

    return null;
};

/*
    Destroy a websocket
*/
WebSocket.prototype.destroy = function() {
    var self = this;

    if (self.connections === null && self._keys === null)
        return self;

    self.close();
    self.connections = null;
    self._keys = null;
    delete self.framework.connections[self.id];
    self.emit('destroy');
    return self;
};

/*
    Send proxy request
    @url {String}
    @obj {Object}
    @fnCallback {Function} :: optional
    return {Controller}
*/
WebSocket.prototype.proxy = function(url, obj, fnCallback) {

    var self = this;
    var headers = {
        'X-Proxy': 'total.js'
    };
    headers[RESPONSE_HEADER_CONTENTTYPE] = 'application/json';

    if (typeof(obj) === FUNCTION) {
        var tmp = fnCallback;
        fnCallback = obj;
        obj = tmp;
    }

    utils.request(url, 'POST', obj, function(error, data, code, headers) {

        if (!fnCallback)
            return;

        if ((headers['content-type'] || '').indexOf('application/json') !== -1)
            data = JSON.parse(data);

        fnCallback.call(self, error, data, code, headers);

    }, headers);

    return self;
};

/*
    Internal function
    return {WebSocket}
*/
WebSocket.prototype._refresh = function() {
    var self = this;
    self._keys = Object.keys(self.connections);
    self.online = self._keys.length;
    return self;
};

/*
    Internal function
    @id {String}
    return {WebSocket}
*/
WebSocket.prototype._remove = function(id) {
    var self = this;
    delete self.connections[id];
    return self;
};

/*
    Internal function
    @client {WebSocketClient}
    return {WebSocket}
*/
WebSocket.prototype._add = function(client) {
    var self = this;
    self.connections[client._id] = client;
    return self;
};

/*
    Module caller
    @name {String}
    return {Module};
*/
WebSocket.prototype.module = function(name) {
    return this.framework.module(name);
};

/*
    Get a model
    @name {String} :: name of model
    return {Object};
*/
WebSocket.prototype.model = function(name) {
    return this.framework.model(name);
};

/*
    Get a model
    @name {String} :: name of model
    return {Object};
*/
WebSocket.prototype.component = function(name) {

    var self = this;
    var component = framework.component(name);

    if (component === null)
        return '';

    var length = arguments.length;
    var params = [];

    for (var i = 1; i < length; i++)
        params.push(arguments[i]);

    var output = component.render.apply(self, params);
    return output;
};

/*
    Render component to string
    @name {String}
    return {String}
*/
WebSocket.prototype.helper = function(name) {
    var self = this;
    var helper = framework.helpers[name] || null;

    if (helper === null)
        return '';

    var length = arguments.length;
    var params = [];

    for (var i = 1; i < length; i++)
        params.push(arguments[i]);

    return helper.apply(self, params);
};

/*
    Controller functions reader
    @name {String} :: name of controller
    return {Object};
*/
WebSocket.prototype.functions = function(name) {
    return (this.framework.controllers[name] || {}).functions;
};

/*
    Return database
    @name {String}
    return {Database};
*/
WebSocket.prototype.database = function(name) {
    return this.framework.database(name);
};

/*
    Resource reader
    @name {String} :: filename
    @key {String}
    return {String};
*/
WebSocket.prototype.resource = function(name, key) {
    return this.framework.resource(name, key);
};

/*
    Log
    @arguments {Object array}
    return {WebSocket};
*/
WebSocket.prototype.log = function() {
    var self = this;
    self.framework.log.apply(self.framework, arguments);
    return self;
};

/*
    Validation / alias for validate
    return {ErrorBuilder}
*/
WebSocket.prototype.validation = function(model, properties, prefix, name) {
    return this.validate(model, properties, prefix, name);
};

/*
    Validation object
    @model {Object} :: object to validate
    @properties {String array} : what properties?
    @prefix {String} :: prefix for resource = prefix + model name
    @name {String} :: name of resource
    return {ErrorBuilder}
*/
WebSocket.prototype.validate = function(model, properties, prefix, name) {

    var self = this;

    var resource = function(key) {
        return self.resource(name || 'default', (prefix || '') + key);
    };

    var error = new builders.ErrorBuilder(resource);
    return utils.validate.call(self, model, properties, self.framework.onValidation, error);
};

/*
    Add function to async wait list
    @name {String}
    @waitingFor {String} :: name of async function
    @fn {Function}
    return {WebSocket}
*/
WebSocket.prototype.wait = function(name, waitingFor, fn) {
    var self = this;
    self.async.wait(name, waitingFor, fn);
    return self;
};

/*
    Run async functions
    @callback {Function}
    return {WebSocket}
*/
WebSocket.prototype.complete = function(callback) {
    var self = this;
    return self.complete(callback);
};

/*
    Add function to async list
    @name {String}
    @fn {Function}
    return {WebSocket}
*/
WebSocket.prototype.await = function(name, fn) {
    var self = this;
    self.async.await(name, fn);
    return self;
};

/*
    WebSocketClient
    @req {Request}
    @socket {Socket}
    @head {Buffer}
*/
function WebSocketClient(req, socket, head) {

    this.handlers = {
        ondata: this._ondata.bind(this),
        onerror: this._onerror.bind(this),
        onclose: this._onclose.bind(this)
    };

    this.container = null;
    this._id = null;
    this.id = '';
    this.socket = socket;
    this.req = req;
    this.isClosed = false;
    this.errors = 0;
    this.buffer = new Buffer(0);
    this.length = 0;
    this.cookie = req.cookie.bind(req);

    // 1 = raw - not implemented
    // 2 = plain
    // 3 = JSON

    this.type = 2;
    this._isClosed = false;
}

WebSocketClient.prototype = {

    get protocol() {
        return (req.headers['sec-websocket-protocol'] || '').replace(/\s/g, '').split(',');
    },

    get ip() {
        return this.req.ip;
    },

    get get() {
        return this.req.data.get;
    },

    get uri() {
        return this.req.uri;
    },

    get config() {
        return this.container.config;
    },

    get global() {
        return this.container.global;
    },

    get session() {
        return this.req.session;
    },

    set session(value) {
        this.req.session = value;
    },

    get user() {
        return this.req.user;
    },

    set user(value) {
        this.req.user = value;
    }
};

WebSocketClient.prototype.__proto__ = Object.create(events.EventEmitter.prototype, {
    constructor: {
        value: WebSocketClient,
        enumberable: false
    }
});

/*
    Internal function
    @allow {String Array} :: allow origin
    @protocols {String Array} :: allow protocols
    @flags {String Array} :: flags
    return {Boolean}
*/
WebSocketClient.prototype.prepare = function(flags, protocols, allow, length, version) {

    var self = this;

    flags = flags || [];
    protocols = protocols || [];
    allow = allow || [];

    self.length = length;

    var origin = self.req.headers['origin'] || '';

    if (allow.length > 0) {

        if (allow.indexOf('*') === -1) {
            for (var i = 0; i < allow.length; i++) {
                if (origin.indexOf(allow[i]) === -1)
                    return false;
            }
        }

    } else {

        if (origin.indexOf(self.req.headers.host) === -1)
            return false;
    }

    if (protocols.length > 0) {
        for (var i = 0; i < protocols.length; i++) {
            if (self.protocol.indexOf(protocols[i]) === -1)
                return false;
        }
    }

    if (SOCKET_ALLOW_VERSION.indexOf(utils.parseInt(self.req.headers['sec-websocket-version'])) === -1)
        return false;

    self.socket.write(new Buffer(SOCKET_RESPONSE.format('total.js v' + version, self._request_accept_key(self.req)), 'binary'));

    self._id = (self.ip || '').replace(/\./g, '') + utils.GUID(20);
    self.id = self._id;

    return true;
};

/*
    Internal function
    @container {WebSocket}
    return {WebSocketClient}
*/
WebSocketClient.prototype.upgrade = function(container) {

    var self = this;
    self.container = container;

    //self.socket.setTimeout(0);
    //self.socket.setNoDelay(true);
    //self.socket.setKeepAlive(true, 0);

    self.socket.on('data', self.handlers.ondata);
    self.socket.on('error', self.handlers.onerror);
    self.socket.on('close', self.handlers.onclose);
    self.socket.on('end', self.handlers.onclose);

    self.container._add(self);
    self.container._refresh();

    self.container.framework.emit('websocket-begin', self.container, self);
    self.container.emit('open', self);

    return self;
};

/*
    MIT
    Written by Jozef Gula
    ---------------------
    Internal handler
    @data {Buffer}
*/
WebSocketClient.prototype._ondata = function(data) {

    var self = this;

    if (data.length + self.buffer.length > self.length) {
        self.errors++;
        self.container.emit('error', new Error('Maximum request length exceeded.'), self);
        return;
    }

    switch (data[0] & 0x0f) {
        case 0x01:

            // text message or JSON message
            if (self.type !== 1)
                self.parse(data);

            break;
        case 0x02:

            // binary message
            if (self.type === 1)
                self.parse(data);

            break;
        case 0x08:
            // close
            self.close();
            break;
        case 0x09:
            // ping
            self.socket.write(self._state('pong'));
            break;
        case 0x0a:
            // pong
            break;
    }
};

// MIT
// Written by Jozef Gula
WebSocketClient.prototype.parse = function(data) {

    var self = this;

    if (data != null)
        self.buffer = Buffer.concat([self.buffer, data]);

    var bLength = self.buffer[1];

    if (((bLength & 0x80) >> 7) !== 1)
        return self;

    var length = utils.getMessageLength(self.buffer, self.container.framework.isLE);
    var index = (self.buffer[1] & 0x7f);

    index = (index == 126) ? 4 : (index == 127 ? 10 : 2);

    if ((index + length + 4) > (self.buffer.length))
        return self;

    var mask = new Buffer(4);
    self.buffer.copy(mask, 0, index, index + 4);

    // TEXT
    if (self.type !== 1) {
        var output = '';
        for (var i = 0; i < length; i++)
            output += String.fromCharCode(self.buffer[index + 4 + i] ^ mask[i % 4]);

        // JSON
        if (self.type === 3) {
            try {
                self.container.emit('message', self, JSON.parse(self.container.config['default-websocket-encodedecode'] === true ? decodeURIComponent(output) : output));
            } catch (ex) {
                self.errors++;
                self.container.emit('error', new Error('JSON parser: ' + ex.toString()), self);
            }
        } else
            self.container.emit('message', self, self.container.config['default-websocket-encodedecode'] === true ? decodeURIComponent(output) : output);

    } else {
        var binary = new Buffer(length);
        for (var i = 0; i < length; i++)
            binary.write(self.buffer[index + 4 + i] ^ mask[i % 4]);
        self.container.emit('message', self, binary);
    }

    self.buffer = self.buffer.slice(index + length + 4, self.buffer.length);
    if (self.buffer.length >= 2)
        self.parse(null);

    return self;
};

/*
    Internal handler
*/
WebSocketClient.prototype._onerror = function(error) {
    var self = this;
    if (error.stack.indexOf('ECONNRESET') !== -1 || error.stack.indexOf('socket is closed') !== -1 || error.stack.indexOf('EPIPE') !== -1)
        return;
    self.container.emit('error', error, self);
};

/*
    Internal handler
*/
WebSocketClient.prototype._onclose = function() {
    var self = this;

    if (self._isClosed)
        return;

    self._isClosed = true;
    self.container._remove(self._id);
    self.container._refresh();
    self.container.emit('close', self);
    self.container.framework.emit('websocket-end', self.container, self);
};

/*
    Send message
    @message {String or Object}
    return {WebSocketClient}
*/
WebSocketClient.prototype.send = function(message) {

    var self = this;

    if (self.isClosed)
        return;

    if (self.type !== 1) {

        var data = self.type === 3 ? JSON.stringify(message) : (message || '').toString();
        if (self.container.config['default-websocket-encodedecode'] === true && data.length > 0)
            data = encodeURIComponent(data);

        self.socket.write(utils.getWebSocketFrame(0, data, 0x01));

    } else {

        if (message !== null)
            self.socket.write(utils.getWebSocketFrame(0, message, 0x02));

    }

    return self;
};

/*
    Close connection
    return {WebSocketClient}
*/
WebSocketClient.prototype.close = function(message, code) {
    var self = this;

    if (self.isClosed)
        return self;

    self.isClosed = true;
    self.socket.end(utils.getWebSocketFrame(code || 1000, message || '', 0x08));

    return self;
};

/*
    Send state
    return {Buffer}
*/
WebSocketClient.prototype._state = function(type) {
    var value = new Buffer(6);
    switch (type) {
        case 'close':
            value[0] = 0x08;
            value[0] |= 0x80;
            value[1] = 0x80;
            break;
        case 'ping':
            value[0] = 0x09;
            value[0] |= 0x80;
            value[1] = 0x80;
            break;
        case 'pong':
            value[0] = 0x0A;
            value[0] |= 0x80;
            value[1] = 0x80;
            break;
    }
    var iMask = Math.floor(Math.random() * 255);
    value[2] = iMask >> 8;
    value[3] = iMask;
    iMask = Math.floor(Math.random() * 255);
    value[4] = iMask >> 8;
    value[5] = iMask;
    return value;
};

WebSocketClient.prototype._request_accept_key = function(req) {
    var sha1 = crypto.createHash('sha1');
    sha1.update((req.headers['sec-websocket-key'] || '') + SOCKET_HASH);
    return sha1.digest('base64');
};

// *********************************************************************************
// =================================================================================
// Prototypes
// =================================================================================
// *********************************************************************************

/*
    Write cookie
    @name {String}
    @value {String}
    @expires {Date} :: optional
    @options {Object} :: options.path, options.domain, options.secure, options.httpOnly, options.expires
    return {ServerResponse}
*/
http.ServerResponse.prototype.cookie = function(name, value, expires, options) {

    var builder = [name + '=' + encodeURIComponent(value)];

    if (expires && !utils.isDate(expires) && typeof(expires) === 'object') {
        options = expires;
        expires = options.expires || options.expire || null;
    }

    if (!options)
        options = {};

    options.path = options.path || '/';

    if (expires)
        builder.push('Expires=' + expires.toUTCString());

    if (options.domain)
        builder.push('Domain=' + options.domain);

    if (options.path)
        builder.push('Path=' + options.path);

    if (options.secure)
        builder.push('Secure');

    if (options.httpOnly || options.httponly || options.HttpOnly)
        builder.push('HttpOnly');

    var self = this;

    var arr = self.getHeader('set-cookie') || [];

    arr.push(builder.join('; '));
    self.setHeader('Set-Cookie', arr);

    return self;
};

/**
 * Disable HTTP cache for current response
 * @return {Response}
 */
http.ServerResponse.prototype.noCache = function() {
    var self = this;
    self.removeHeader('Etag');
    self.removeHeader('Last-Modified');
    return self;
};

var _tmp = http.IncomingMessage.prototype;

http.IncomingMessage.prototype = {

    get ip() {
        var self = this;
        var proxy = self.headers['x-forwarded-for'];
        //  x-forwarded-for: client, proxy1, proxy2, ...
        if (typeof(proxy) !== UNDEFINED)
            return proxy.split(',', 1)[0] || self.connection.removiewddress;
        return self.connection.remoteAddress;
    },

    get subdomain() {

        var self = this;

        if (self._subdomain)
            return self._subdomain;

        var subdomain = self.uri.host.toLowerCase().replace(/^www\./i, '').split('.');
        if (subdomain.length > 2)
            self._subdomain = subdomain.slice(0, subdomain.length - 2); // example: [subdomain].domain.com
        else
            self._subdomain = null;

        return self._subdomain;
    },

    get host() {
        return this.headers['host'];
    },

    get isSecure() {
        return this.uri.protocol === 'https' || this.uri.protocol === 'wss';
    },

    get language() {
        return ((this.headers['accept-language'].split(';')[0] || '').split(',')[0] || '').toLowerCase();
    }
}

http.IncomingMessage.prototype.__proto__ = _tmp;

/**
 * Signature request (user-agent + ip + referer + current URL)
 * @return {Request}
 */
http.IncomingMessage.prototype.signature = function() {
    var self = this;
    return framework.encrypt((self.headers['user-agent'] || '') + '#' + self.ip + '#' + self.url, 'request-signature', false);
};

/**
 * Disable HTTP cache for current request
 * @return {Request}
 */
http.IncomingMessage.prototype.noCache = function() {
    var self = this;
    delete self.headers['if-none-match'];
    delete self.headers['if-modified-since'];
    return self;
};

/**
 * Read a cookie from current request
 * @param  {String} name Cookie name.
 * @return {String}      Cookie value (default: '')
 */
http.IncomingMessage.prototype.cookie = function(name) {

    var self = this;

    if (typeof(self.cookies) !== UNDEFINED)
        return decodeURIComponent(self.cookies[name] || '');

    self.cookies = {};

    var cookie = self.headers['cookie'] || '';
    if (cookie.length === 0)
        return '';

    var arr = cookie.split(';');
    var length = arr.length;

    for (var i = 0; i < length; i++) {
        var c = arr[i].trim().split('=');
        self.cookies[c.shift()] = c.join('=');
    }

    return decodeURIComponent(self.cookies[name] || '');
};

/*
    Read authorization header
    return {Object}
*/
http.IncomingMessage.prototype.authorization = function() {

    var self = this;
    var authorization = self.headers['authorization'] || '';

    if (authorization === '')
        return {
            name: '',
            password: ''
        };

    var arr = new Buffer(authorization.replace('Basic ', '').trim(), 'base64').toString('utf8').split(':');
    return {
        name: arr[0] || '',
        password: arr[1] || ''
    };
};

/*
    Clear all uploaded files
    @isAuto {Booelan} :: system, internal, optional default false
    return {ServerRequest}
*/
http.IncomingMessage.prototype.clear = function(isAuto) {

    var self = this;

    if (!self.data)
        return self;

    var files = self.data.files;

    if (isAuto && self._manual)
        return self;

    if (!files)
        return self;

    var length = files.length;

    if (length === 0)
        return self;

    var arr = [];
    for (var i = 0; i < length; i++)
        arr.push(files[i].path);

    framework.unlink(arr);
    self.data.files = null;

    return self;
};

/*
    Return hostname with protocol and port
    @path {String} :: optional
    return {String}
*/
http.IncomingMessage.prototype.hostname = function(path) {

    var self = this;
    var uri = self.uri;

    if (typeof(path) !== UNDEFINED) {
        if (path[0] !== '/')
            path = '/' + path;
    }

    return uri.protocol + '//' + uri.hostname + (uri.port !== null && typeof(uri.port) !== UNDEFINED && uri.port !== 80 ? ':' + uri.port : '') + (path || '');
};

global.framework = module.exports = new Framework();

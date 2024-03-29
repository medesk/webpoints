//Module dependencies
var express = require('express'), 
	utils = require('util'), 
	JSV = require("JSV").JSV;

var HttpStatusCode = {
	NotFound: 404,
	OK: 200,
	Created: 201,
	Accepted: 202,
	NoContent: 204,
	BadRequest: 400,
	Forbidden: 403,
    Conflict: 409,
    PreconditionFailed: 412,
	InternalError: 500,
	NotImplemented: 501,
	Unavailable: 503
};
exports.HttpStatusCode = HttpStatusCode;

/**
 * Constructor for an endpoint that provides static file hosting.
 * 
 * @class Represents an endpoint for static files hosting.
 * @param {String} path Path to the folder with files.
 * @param {Object} options Hosting options. For example, {maxAge: 3183}.
 */
function StaticFilesEndpoint(path, options){
	this.path = path;
	this.options = options;
};
exports.StaticFilesEndpoint = StaticFilesEndpoint;

/**
 * Constructor for collection of service operations.
 * 
 * @class Represents collection of service operations.
 */
function ServiceOperationCollection(){
}

/**
 * Loads endpoints from the Node module.
 * @param {String} file The path to the file.
 * @api public
 */
ServiceOperationCollection.prototype.load = function(file){ 
	file = require(file);
	for(var url in file) this[url] = file[url];
}

/**
 * Constructor for collection of configuration operations.
 * 
 * @class Represents collection of configuration handlers.
 */
function ApplicationConfigurationCollection(){
}

ApplicationConfigurationCollection.prototype = {
	get current(){
		var configurer = this[process.env['NODE_ENV']];
		if(configurer instanceof Function) return configurer;
		else if(configurer === null || configurer === undefined) return function(){ };
		//rewrites each endpoint
		else return function(){
			for(var url in configurer) this[url] = configurer[url]; 
		};
	}
};

/**
 * Creates a WebPoints application.
 * 
 * @class Represents WebPoints application.
 * @param {Object} An environment passed to all service operations. Optional.
 * @param {String} A validation environment.
 */
function Application(environment, schemaValidator){
	//Saves the environment
	Object.defineProperty(this, 'environment', {configurable: false, 
		writable: false, 
		value: environment || {}
	});
	//Storage for service operations
	Object.defineProperty(this, 'operations', {configurable: false, writable: false, value: new ServiceOperationCollection()});
	//configurations
	Object.defineProperty(this, 'configurations', {configurable: false, writable: false, value: new ApplicationConfigurationCollection()});
	//features
	this.features = new Array();
	//schema validator
	switch(schemaValidator){
		case "json-schema-draft-02":
		case "json-schema-draft-01":
		case "json-schema-draft-03": 
			schemaValidator = JSV.Environment.prototype.validate.bind(JSV.createEnvironment(schemaValidator));
		break;
		case "JSONSchema":
		case "jsonschema": 
			schemaValidator = JSV.Environment.prototype.validate.bind(JSV.createEnvironment()); 
		break;
		case null:
		case undefined: 
			schemaValidator = function(value, schema){ return {errors: []}; }; 
		break;
	}
	Object.defineProperty(this, 'schemaValidator', {enumerable: true, configurable: true, writable: false, value: schemaValidator});
}

exports.Application = Application;

/**
 * Creates a new callback for the user-defined handler.
 * 
 * @param {Object} operation The service operation.
 * @param {Object} response HTTP response.
 * @return {Function} A new callback function.
 * @api public
 */
Application.prototype.createResponseCallback = function(operation, response){
	//simple JSON serializer
	if(operation.serialize == true) return function(value, statuscode, headers){ 
		if(value instanceof Buffer) 
			return response.end(value);	
		else if(value instanceof process.EventEmitter && value.readable)
			return value.pipe(response);
		else if(statuscode < 300 || statuscode === undefined || statuscode === null)
			return response.json(value, headers || {}, statuscode);
		else return response.send(value || '', headers || {}, statuscode);
	};
	//custom serializer
	else if(operation.serialize instanceof Function) return function(value){ return operation.serialize.call(response, value); };
	//text serializer
	else return function(value, statuscode, headers){
		return response.send(value || '', headers || {}, statuscode);
	};
};

/**
 * Represents operation execution context.
 * 
 * @param request HTTP request.
 * @param {Object} environment Application environment.
 * @api public
 */
function OperationContext(request, environment){
	//copies all environment
	for(var i in environment) this[i] = environment[i];
	this.request = request;
}
exports.OperationContext = OperationContext;

/**
 * Determines whether the object is empty.
 * 
 * @param obj An object to test.
 * @api private
 */
function isEmpty(obj){
	if(obj === null || obj == undefined) return true;
	else if(typeof obj == 'string' || obj instanceof String || obj instanceof Array) return obj.length == 0;
	else if(obj instanceof Function) return false;
	else return Object.keys(obj).length == 0;
}

/**
 * Executes service operation handler.
 * 
 * @param {OperationContext} context An object that is used as 'this' for the handler.
 * @param {Object} request HTTP request (see NodeJS documentation).
 * @param {Object} response HTTP response (see NodeJS documentation).
 * @api private
 */
function execServiceOperation(request, response){
	//Handling parameters
	var params = new Array();
	for(var p in this.operation.params){
		var parameter = this.operation.params[p];
		var value = request[parameter.isHeader ? 'header' : 'param'](p, parameter['default']);
		if(value === undefined && parameter['default'] === undefined)
			return response.send(utils.format('Argument %s is missing', p), HttpStatusCode.BadRequest);
		//Deserializing parameters
		if(parameter.deserialize === true && (typeof value == 'string' || value instanceof String)) value = JSON.parse(value);
		else if(parameter.deserialize instanceof Function && (typeof value == 'string' || value instanceof String)) value = parameter.deserialize(value);
		//Schema validation
		if(parameter.schema){
			var report = this.schemaValidator(value, parameter.schema);
			if(report.errors.length > 0)
				return response.send(utils.format('Argument %s schema validation failed: %j', p, report.errors), HttpStatusCode.BadRequest);
			delete report;
		}
		params.push(value);
		delete value;
		delete parameter;
	}
	delete p;
	//callback
	params.push(this.responseCallback(this.operation, response));
	this.operation.handler.apply(new OperationContext(request, this.environment), params);
}

/**
 * Converts name of the HTTP method to the Express function name that allows to add a new handler for URI.
 * 
 * @param {String} method HTTP method name.
 * @api private
 */
function httpMethodToExpress(method){
	switch(method){
		case 'POST':
		case 'post': return 'post';
		case 'PUT':
		case 'put': return 'put';
		case 'DELETE':
		case 'delete': return 'del';
		case 'GET': 
		case 'get': return 'get';
		default: return 'all';
	}
}

/**
 * Adds a new operation to the server.
 * 
 * @param {String} url Relative path to the function.
 * @param descriptor Service operation implementation.
 * @param {Object} server A reference to ExpressJS framework.
 * @api public
 */
Application.prototype.createOperation = function(url, descriptor, server){
	//Running features
	this.features.forEach(function(feature){ 
		if(feature instanceof Function) feature(descriptor, server); 
		else feature.apply(descriptor, server);
	});
	//Analyzing descriptor
	if(typeof descriptor == 'string' || descriptor instanceof String)	//static file hosting
		server.use(url, express['static'](descriptor));
	else if(descriptor instanceof StaticFilesEndpoint)
		server.use(url, express['static'](descriptor.path, descriptor.options));
	else if(descriptor instanceof Function)	//expression-like handler
		server[httpMethodToExpress(descriptor.method)](url, descriptor.bind(this.environment));
	else if(descriptor.createOperation instanceof Function){
		var method = httpMethodToExpress(descriptor.method);
		descriptor = descriptor.createOperation();
		if(descriptor) server[method](url, (descriptor.middleware || []), descriptor.bind(this.environment));
	}
	else if(descriptor instanceof Object)
		server[httpMethodToExpress(descriptor.method)](url, (descriptor.middleware || (descriptor.method == 'get'? [] : [express.bodyParser()])), execServiceOperation.bind({
			'environment': this.environment, 
			'operation': descriptor, 
			'responseCallback': this.createResponseCallback, 
			'schemaValidator': this.schemaValidator}));
	else throw utils.format('The handler of %s endpoint is not supported.', url);
}

/**
 * Exports service operations to the Express Application.
 * 
 * @param express An instance of Express Application.
 * @api public
*/
Application.prototype.exportTo = function(express){
	//Initialize features
	this.features.forEach(function(feature){
		if(feature.init instanceof Function) feature.init(this);
	}.bind(this));
	//Export service operations
	for(var url in this.operations)
		this.createOperation(url, this.operations[url], express);
	delete url;
};

Application.prototype.createServer = function(tuner, options){
	var app = express();
	//Running configuration
	this.configurations.current.call(this.operations, app);
	//Setup middleware or call setup function
	if(tuner instanceof Function) tuner(app);
	this.exportTo(app);
	var http;
	if(options){	//https server required
		http = require('https');
		return http.createServer(options, app);	
	}
	else{
		http = require('http');
		return http.createServer(app);		
	}
};

/**
 * @description Executes application.
 * @param {Number} port The port number.
 * @param {Object} tuner An object that contains setup functions for underlying express server (setupServer function) and cluster (setupCluster function). Optional.
 * @param {Object} httpsOptions Secure server hosting options. Optional.
 * @api public
 */
Application.prototype.run = function(port, tuner, httpsOptions){
	var setupServer, setupCluster;
	if(tuner instanceof Function) expressTuner = tuner;
	else if(tuner instanceof Object) { expressTuner = tuner.setupServer; setupCluster = tuner.setupCluster; }
	var server = this.createServer(setupServer, httpsOptions);
	if(this.clustered){
		var cluster = require('cluster');
		cluster = cluster(server);
		if(setupCluster instanceof Function) setupCluster(cluster);
		server = cluster;
	}
	//Export port number from environment
	if(port instanceof Function || port === null || port === undefined) port = JSON.parse(process.env['PORT']);
	return server.listen(port);
};

////////////////////////////////////////Additional routines and features////////////////////////////////////////////////

/**
 * Converts function with signature function(args, callback) into the function(arg0, arg1, ..., callback)
 * @param {Object} fn A function to convert.
 */
exports.toPlainFunction = function(fn){
	return function(){
		var params = new Array();
		for(var i in arguments) params.push(arguments[i]);
		delete i;
		return fn.call(this, params, params.pop());
	};
}

/**
 * Assigns HTTP method to the function or declaration of the service operation.
 * @param {Object} method HTTP method name.
 * @param {Object} fn A function or declaration of the service operation.
 */
function wrapHttpHandler(method, fn){
	return (fn.method = method, fn);
}

exports.get = function(fn) { return wrapHttpHandler('get', fn); };
exports.post = function(fn) { return wrapHttpHandler('post', fn); };
exports.put = function(fn) { return wrapHttpHandler('put', fn); };
exports.del = function(fn) { return wrapHttpHandler('delete', fn); };

//Help providers
Object.defineProperty(exports, 'helpProviders', {get: function(){ return require('./hlpprovs.js'); }});

//Parameter templates
Object.defineProperty(exports, 'parameters', {get: function(){ return require('./param-templates.js'); }});
//Features
exports.features = {
	get taskModel(){ return require('./features/taskModel.js'); },
	get codeContracts(){ return require('./features/contracts.js'); },
	get syncHandler(){ return require('./features/syncHandler.js'); },
	get switcher(){ return require('./features/switcher.js'); }
};

exports.features.bodyParser = function(operation){
	if(operation.parseBody){
		if(operation.middleware === undefined) operation.middleware = new Array();
		operation.middleware.push(express.bodyParser());
		return true;
	}
	else return false;
};

exports.features.errorHandler = function(operation){
	if(operation.handleErrors){
		if(operation.middleware === undefined) operation.middleware = new Array();
		operation.middleware.push(express.errorHandler());
		return true;
	}
	else return false;
};

////////////////////////////////////////Application pool////////////////////////////////////////////////

/**
 * Constructs a new application pool.
 * @class Stores collection of application instances.
 */
function ApplicationPool(){
	this.context = new Object();	//context for interoperation between application instances
}

/**
 * Loads an application described in the file as NodeJS module.
 * @param {String} name The name of the application instance.
 * @param {String} file The path to the file with application.
 * @returns {Application} An instance of the loaded application.
 */
ApplicationPool.prototype.load = function(name, file){
	file = require(file);
	this[name] = file;
	return file;
};

/**
 * Executes all application instances.
 * @param {Object|String} config Path to the file with configuration for each instance; or already loaded configuration.
 */
ApplicationPool.prototype.run = function(config){
	if(!config) return false;	
	else if(typeof config == 'string' || config instanceof String) config = require(config);
	//load configuration for each application
	for(var name in config) if(this[name]){
		var app = this[name];
		Object.defineProperty(app, 'enabled', {
			configurable: false, 
			get: function(){ return this.environment.enabled; },
			set: function(value){ this.environment.enabled = value; }
		});
		app.environment.enabled = true;
		app.environment.pool = this;
		app.features.push(exports.features.switcher);
		if(app.main instanceof Function) app.main(config[name]);		
		app.run(config[name].port);
		console.info('Listening %s application at %s port', name, config[name].port);
	}
	return true;
};

/**
 * Returns an application status.
 * @param {String} name The name of the application.
 * @param {Boolean} status The status of application instance. Optional.
 * @returns {Boolean} true, if application's endpoints are available; otherwise, false.
 */
ApplicationPool.prototype.appStatus = function(name, status){
	switch(arguments.length){
		case 2: return this[name] && (this[name].enabled = status);
		case 1: return this[name] && this[name].enabled;
		default: return false;	
	};
};

exports.ApplicationPool = ApplicationPool;

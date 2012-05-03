//Module dependencies
var express = require('express'), utils = require('util'), JSV = require("JSV").JSV;

var HttpStatusCode = {
	NotFound: 404,
	OK: 200,
	NoContent: 204,
	BadRequest: 400,
	Forbidden: 403,
    Conflict: 409,
	InternalError: 500,
	NotImplemented: 501,
	Unavailable: 503
};
exports.HttpStatusCode = HttpStatusCode;

function StaticFilesEndpoint(path, options){
	this.path = path;
	this.options = options;
};
exports.StaticFilesEndpoint = StaticFilesEndpoint;

function ServiceOperationCollection(){
	//The method that loads operations from file
	Object.defineProperty(this, 'load', {
		enumerable: false, 
		configurable: false, 
		writable: false, 
		value: function(file){ 
			file = require(file);
			for(var url in file) this[url] = file[url];
		}
	});
}

function ApplicationConfigurationCollection(){
	Object.defineProperty(this, 'current', {enumerable: false, 
		configurable: false, 
		get: function(){ 
			var configurer = this[process.env['NODE_ENV']];
			if(configurer instanceof Function) return configurer;
			else if(configurer === null || configurer === undefined) return function(){ };
			//rewrites each endpoint
			else return function(){
				for(var url in configurer) this[url] = configurer[url]; 
			};
		}});
}

/**
 * @description Creates a WebPoints application.
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
	this.features = new Object();
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
 * @description Creates a new callback for the user-defined handler.
 * @param {Object} operation The service operation.
 * @param {Object} response HTTP response.
 * @returns {Function} A new callback function.
 */
Application.prototype.createResponseCallback = function(operation, response){
	//simple JSON serializer
	if(operation.serialize == true) return function(value){ this.json(value); }.bind(response);
	//custom serializer
	else if(operation.serialize instanceof Function) return function(value){ this.serialize.call(this.response, value); }.bind({'response': response, 'serialize': operation.serialize});
	//text serializer
	else return function(value, statuscode){ this.send(value, statuscode); }.bind(response);
};

/**
 * @description Represents operation execution context.
 * @param request HTTP request.
 * @param {Object} environment Application environment.
 */
function OperationContext(request, environment, features){
	//copies all environment
	for(var i in environment) this[i] = environment[i];
	this.request = request;
	this.features = features;
}
exports.OperationContext = OperationContext;

function isEmpty(obj){
	if(obj === null || obj == undefined) return true;
	else if(typeof obj == 'string' || obj instanceof String || obj instanceof Array) return obj.length == 0;
	else if(obj instanceof Function) return false;
	else return Object.keys(obj).length == 0;
}

function execServiceOperationCore(context, request, response){
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
	this.operation.handler.apply(context, params);
}

/**
 * @description Executes service operation.
 * @param request HTTP request.
 * @param response HTTP response.
 */
function execServiceOperation(request, response){
	function asyncTrue(context, response, callback){ callback(); }
	//prepares operation context
	var context = new OperationContext(request, this.environment, this.features);
	//Executes preparation function 
	(this.operation.prepare || asyncTrue).call(this.operation, context, response, function(){
		//imports all validation arguments into the context
		for(var i in arguments) context[i] = arguments[i];
		execServiceOperationCore.call(this, context, request, response);
		//if validation failed then Requires function should send response automatically
	}.bind(this));
}

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
 * @description Adds a new operation to the server.
 * @param {String} url Relative path to the function.
 * @param descriptor Service operation implementation.
 * @param {Object} server A reference to ExpressJS framework.
 */
Application.prototype.createOperation = function(url, descriptor, server){
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
		server[httpMethodToExpress(descriptor.method)](url, (descriptor.middleware || []), execServiceOperation.bind({
			'environment': this.environment, 
			'operation': descriptor, 
			'responseCallback': this.createResponseCallback, 
			'schemaValidator': this.schemaValidator}));
	else throw utils.format('The handler of %s endpoint is not supported.', url);
}

/**
 * @description Exports service operations to the Express Application.
 * @param {Object} express An instance of Express Application.
*/
Application.prototype.exportTo = function(express){
	//Export service operations
	for(var url in this.operations)
		this.createOperation(url, this.operations[url], express);
	delete url;
	//export features
	for(var feature in this.features)
		express.set(feature, this.features[feature]);
	delete feature;
};

/**
 * @description Executes application synchronously.
 * @param {Number} port The port number.
 * @param {tuner} A function that is used to configure native Express object.
 */
Application.prototype.run = function(port, tuner){
	//Export port number from environment
	if(port instanceof Array || port === null || port === undefined) port = process.env['PORT'];
	var app = express.createServer();
	//Running configuration
	this.configurations.current.call(this.operations, app);
	//Setup middleware or call setup function
	if(tuner instanceof Function) tuner(app);
	this.exportTo(app);
	return app.listen(port);
};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//This constructor converts synchronous handler to asynchronous
exports.SyncHandler = function(f){
	return function(){
		var args = [];
		for(var a in arguments) args.push(arguments[a]);
		var callback = args.pop();
		callback(f.apply(this, args));
	};
};

//Help providers
Object.defineProperty(exports, 'helpProviders', {get: function(){ return require('./hlpprovs.js'); }});

//Code Contracts
function requires(){
	//Detects the callback
	arguments[Object.keys(arguments).pop()](true);
}

function ensures(){
	var keys = Object.keys(arguments);
	var callback = arguments[keys.pop()], result = arguments[keys.pop()];
	delete keys;
	callback.apply(this, result);
}

//This flags disables all contracts
var disableContracts = false;
Object.defineProperty(exports, 'disableContracts', {
	get: function(){ return disableContracts; },
	set: function(value){ disableContracts = value; }
});

function toArray(obj){
	var result = new Array();
	for(var i in obj) result.push(obj[i]);
	return result;
}

exports.ContractHandler = function(contracts){
	if(disableContracts == true) return contracts.handler;
	if(contracts.requires === undefined) contracts.requires = requires;
	//This function implements the handler
	return function(){
		//Extracts arguments and callback
		var params = new Array();
		for(var i in arguments) params.push(arguments[i]);
		delete i;
		var response = params.pop();
		//this callback will be called after preconditions
		params.push(function(success, message){
			if(success){
				params.pop();	//remove callback
				params.push(function(){
					var result;
					params.pop();
					params.push(result = arguments);
					params.push(function(success, message){
							//4. Executes callback
						if(success) response.apply(this, toArray(result));
						else response.call(this, message || 'Postcondition failed.', HttpStatusCode.BadRequest);
					}.bind(this));
					//3. Executes postcondition
					contracts.ensures.apply(this, params);
				}.bind(this));
				//2. Executes handler
				contracts.handler.apply(this, params);
			}
			else response.call(this, message || 'Precondition failed', HttpStatusCode.BadRequest);
		}.bind(this));
		//1. Executes precondition
		contracts.requires.apply(this, params);
	};
};

//Parameter templates
Object.defineProperty(exports, 'parameters', {get: function(){ return require('./param-templates.js'); }});

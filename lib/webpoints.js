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

/**
 * @description Creates a WebPoints application.
 * @param {Object} An environment passed to all service operations. Optional.
 * @param {String} A validation environment.
 */
function Application(environment, schemaValidator){
	//Saves the environment
	Object.defineProperty(this, 'environment', {enumerable: true, 
		configurable: false, 
		writable: false, 
		value: environment || {}
	});
	//Storage for service operations
	Object.defineProperty(this, 'operations', {enumerable: true, configurable: false, writable: false, value: {}});
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

Application.prototype.createResponseCallback = function(operation, response){
	//simple JSON serializer
	if(operation.serialize == true) return function(value){ this.json(value); }.bind(response);
	//custom serializer
	else if(operation.serialize instanceof Function) return function(value){ this.serialize(value, response); }.bind({'response': response, 'serialize': operation.serialize});
	//text serializer
	else return function(value, statuscode){ this.send(value, statuscode); }.bind(response);
};

/**
 * @description Represents operation execution context.
 * @param request HTTP request.
 * @param {Object} environment Application environment.
 */
function OperationContext(request, environment){
	//copies all environment
	for(var i in environment) this[i] = environment[i];
	this.request = request;
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
		var value = parameter.isHeader ? request.headers[p] : request.param(p, parameter['default']);
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
	function asyncTrue(context, callback){ callback(); }
	//prepares operation context
	var context = new OperationContext(request, this.environment);
	//Executes requirements 
	(this.operation.requires || asyncTrue).call(this.operation, context, function(){
		//imports all validation arguments into the context
		for(var i in arguments) context[i] = arguments[i];
		execServiceOperationCore.call(this, context, request, response);
		//if validation failed then Requires function should send response automatically
	}.bind(this));
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
	else if(descriptor instanceof Function)	//expression-like handler
		server[descriptor.method || 'get'](url, descriptor.bind(this.environment));
	else if(descriptor.createOperation instanceof Function){
		var method = descriptor.method;
		descriptor = descriptor.createOperation();
		if(descriptor) server[method || 'get'](url, descriptor.bind(this.environment));
	}
	else if(descriptor instanceof Object)
		server[descriptor.method || 'get'](url, execServiceOperation.bind({
			'environment': this.environment, 
			'operation': descriptor, 
			'responseCallback': this.createResponseCallback, 
			'schemaValidator': this.schemaValidator}));
	else throw utils.format('The handler of %s endpoint is not supported.', url);
}

/**
 * @description Executes application synchronously.
 * @param {Number} port The port number.
 * @param {Array} middleware An array of Express middlewares.
 */
Application.prototype.run = function(port, middleware){
	//Export port number from environment
	if(port instanceof Array || port === null || port === undefined) port = process.env['PORT'];
	var app = express.createServer();
	//Setup middleware or call setup function
	if(middleware instanceof Function) middleware(app);
	else if(middleware instanceof Array) middleware.forEach(function(f){ app.use(f); });
	//Import service operations
	for(var url in this.operations)
		this.createOperation(url, this.operations[url], app);
	return app.listen(port);
};

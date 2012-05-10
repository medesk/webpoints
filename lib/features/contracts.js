var toPlainFunction = module.parent.exports.toPlainFunction;

/**
 * Stub for REQUIRES predicate.
 * 
 * @api private
 */
function __requires(){
	//Detects the callback
	arguments[Object.keys(arguments).pop()](true);
}

/**
 * Stub for ENSURES predicate.
 * 
 * @api private
 */
function __ensures(){
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

/**
 * Converts a plain object to the array.
 * 
 * @param {Object} obj An object to convert.
 * @return {Array}
 * @api private
 */
function toArray(obj){
	var result = new Array();
	for(var i in obj) result.push(obj[i]);
	return result;
}

/**
 * Creates a new service operation handler with precondition and postcondition.
 * 
 * @param {Object} contracts An object that contains a three fields: handler, requires, ensures.
 * @return {Function} A handler with precondition and postcondition.
 * @api private
 */
function exposeContracts(requires, handler, ensures){
	if(disableContracts == true) return handler;
	if(requires === undefined) requires = __requires;
	if(ensures === undefined) ensures = __ensures;
	//This function implements the handler
	return toPlainFunction(function(params, response){
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
						else response.call(this, message || 'Postcondition failed.', 400);
					}.bind(this));
					//3. Executes postcondition
					ensures.apply(this, params);
				}.bind(this));
				//2. Executes handler
				handler.apply(this, params);
			}
			else response.call(this, message || 'Precondition failed', 412);
		}.bind(this));
		//1. Executes precondition
		requires.apply(this, params);
	});
};

module.exports = function(descriptor){
	if(descriptor.ensures instanceof Function || descriptor.requires instanceof Function){
		descriptor.handler = exposeContracts(descriptor.requires, descriptor.handler, descriptor.ensures);
		delete descriptor.requires;
		delete descriptor.ensures;
		return true;
	}
	else return false;
};
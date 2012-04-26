var utils = require('util'), fs = require('fs');

function generate(operations){
	var str = 'RESTful service operations:';
	for(var url in operations){
		var oper = operations[url];
		str += utils.format('\n%s %s \t-\t %s', url, Object.keys(oper.params), oper.description || '');
		delete oper;
	}
	return str;
}

function DefaultHelpProvider(operations){
	this.method = 'get';
	this.params = {};
	this.serialize = false;
	this.description = 'Simple description of endpoints';
	this.handler = function(callback){
		callback(generate(operations));
	};
}

/**
 * @description Writes documentation to the specified file.
 */
DefaultHelpProvider.saveToFile = function(filename, operations){
	fs.writeFileSync(filename, generate(operations), 'utf8');
}

module.exports = DefaultHelpProvider;
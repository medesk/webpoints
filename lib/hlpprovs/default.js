var utils = require('util');

function DefaultHelpProvider(operations){
	this.method = 'get';
	this.params = {};
	this.serialize = false;
	this.description = 'Simple description of endpoints';
	this.handler = function(callback){
		var str = 'RESTful service operations:';
		for(var url in operations){
			var oper = operations[url];
			str += utils.format('\n\r%s - %s', url, oper.description);
		}
	}
}

module.exports = DefaultHelpProvider;
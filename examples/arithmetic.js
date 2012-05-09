var WebPoints = require('../');
var Application = WebPoints.Application, 
	syncHandler = WebPoints.features.syncHandler, 
	DefaultHelpProvider = WebPoints.helpProviders.DefaultHelpProvider,
	codeContracts = WebPoints.features.codeContracts,
	NumberParam = WebPoints.parameters.NumberParam;

var app = new Application();
//Enable code contracts
app.features = [codeContracts, syncHandler];

app.operations['/sum'] = {
	method: 'get',
	serialize: true,
	params: {x: new NumberParam(), y: new NumberParam()},
	handler: function(x, y){ return x + y; },
	synchronous: true	//handled by syncHandler feature
};

app.operations['/sub'] = {
	method: 'get',
	serialize: true,
	params: {x: new NumberParam(), y: new NumberParam()},
	handler: function(x, y){ return x - y; },
	synchronous: true
};

app.operations['/div'] = {
	method: 'get',
	serialize: true,
	params: {x: {deserialize: true}, y: {deserialize: true}},
	requires: function(x, y, callback){ callback(y != 0, 'Denominator cannot be zero.'); },
	handler: function(x, y, callback){ callback(x / y); },
	ensures: function(x, y, result, callback){ callback(!isNaN(result[0])); }
};

app.configurations['development'] = {
	'/help': new DefaultHelpProvider(app.operations)
};

console.info('This example demonstrates a simple RESTful service with three endpoints: /sum, /sub, /div.');
console.info('To enable /help endpoints, start the example with NODE_ENV=development variable.')

app.run(4000);

var WebPoints = require('../');
var Application = WebPoints.Application, 
	SyncHandler = WebPoints.SyncHandler, 
	DefaultHelpProvider = WebPoints.helpProviders.DefaultHelpProvider,
	ContractHandler = WebPoints.ContractHandler;

var app = new Application();

app.operations['/sum'] = {
	method: 'get',
	serialize: true,
	params: {x: {deserialize: true}, y: {deserialize: true}},
	handler: SyncHandler(function(x, y){ return x + y; })
};

app.operations['/sub'] = {
	method: 'get',
	serialize: true,
	params: {x: {deserialize: true}, y: {deserialize: true}},
	handler: SyncHandler(function(x, y){ return x - y; })
};

app.operations['/div'] = {
	method: 'get',
	serialize: true,
	params: {x: {deserialize: true}, y: {deserialize: true}},
	handler: ContractHandler({
		requires: function(x, y, callback){ callback(y != 0, 'Denominator cannot be zero.'); },
		handler: function(x, y, callback){ callback(x / y); },
		ensures: function(x, y, result, callback){ callback(!isNaN(result[0])); }
	})
}

app.operations['/help'] = new DefaultHelpProvider(app.operations);

console.info('This example demonstrates a simple RESTful service with three endpoints: /sum, /sub, /div, /help.')

app.run(4000);

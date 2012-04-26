var WebPoints = require('../');
var Application = WebPoints.Application, SyncHandler = WebPoints.SyncHandler, DefaultHelpProvider = WebPoints.helpProviders.DefaultHelpProvider;

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

app.operations['/help'] = new DefaultHelpProvider(app.operations);

console.info('This example demonstrates a simple RESTful service with three endpoints: /sum, /sub, /help.')

app.run(4000);

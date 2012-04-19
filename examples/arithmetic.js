var wpoints = require('../lib/webpoints.js');
var Application = wpoints.Application, SyncHandler = wpoints.SyncHandler;

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

app.run(4000);

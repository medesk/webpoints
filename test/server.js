var webpoints = require('../');
var Application = webpoints.Application, 
    TaskScheduler = webpoints.features.taskModel.TaskScheduler,
	syncHandler = webpoints.features.syncHandler,
	bodyParser = webpoints.features.bodyParser, 
	DefaultHelpProvider = webpoints.helpProviders.DefaultHelpProvider,
	codeContracts = webpoints.features.codeContracts,
	PrimitiveParam = webpoints.parameters.Primitive,
	IntegerParam = webpoints.parameters.IntegerParam,
	NumberParam = webpoints.parameters.NumberParam;

var app = new Application({}, "JSONSchema");
//Enable code contracts
app.features = [codeContracts, syncHandler, bodyParser, new TaskScheduler()];

//Simple operation
app.operations['/sum'] = {
	method: 'get',
	serialize: true,
	params: {x: new IntegerParam(), y: new IntegerParam()},
	handler: function(x, y){ return x + y; },
	synchronous: true	//handled by syncHandler feature
};

//Code contracts
app.operations['/div'] = {
	method: 'get',
	serialize: true,
	params: {x: new NumberParam(), y: new NumberParam()},
	requires: function(x, y, callback){ callback(y != 0, 'Denominator cannot be zero.'); },
	handler: function(x, y, callback){ callback(x / y); },
	ensures: function(x, y, result, callback){ callback(!isNaN(result[0])); }
};

app.operations['/postWithOptionals'] = {
	method: 'post',
	serialize: true,
	params: {x: new PrimitiveParam(Number, 2), y: new PrimitiveParam(Number, 3)},
	synchronous: true,
	handler: function(x, y){ return x + y; },
	//add body parser middleware
	parseBody: true	//this flag is used by bodyParser feature
};

app.operations['/longTimeSum'] = {
	method: 'post',
	params: {x: new IntegerParam(), y: new IntegerParam()},
	handler: function(x, y, callback){
		//emulates hard work
		setTimeout(function(){ callback(x + y); }, 3000);
	},
	parseBody: true,
	longRunning: true
};

app.configurations['development'] = {
	'/help': new DefaultHelpProvider(app.operations)
};

console.info('This is a test server application. Listening on 4000.');

app.run(4000);

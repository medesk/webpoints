var webpoints = require('../');

var app1 = new webpoints.Application(), app2 = new webpoints.Application(), pool = new webpoints.ApplicationPool();

//app1 settings
app1.operations['/app2-status'] = {
 	method: 'get',
	params: {enabled: {deserialize: true}},
	handler: function(enabled, callback){
		return callback(this.pool.appStatus('app2', enabled));	
	}
};

app1.main = function(settings){
	console.log('APP1 settings: %j', settings);
};

//app2 settings
app2.operations['/hello-world'] = {
	method: 'get',
	params: {},
	handler: function(callback){ return callback('Hello, world!'); }
};

app2.main = function(settings){
	console.log('APP2 settings: %j', settings);
};

//App pool settings
pool['app1'] = app1;
pool['app2'] = app2;

//Execute applications
pool.run({
	'app1': {port: 3232, setting: 'setting from app1'},
	'app2': {port: 3234, setting: 'setting from app2'}
});

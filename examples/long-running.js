//This example demonstrates long-running tasks
var webpoints = require('../');
var Application = webpoints.Application,
	TaskMonitorEndpoint = webpoints.features.taskModel.TaskMonitorEndpoint,
	TaskScheduler = webpoints.features.taskModel.TaskScheduler,
	ProgressNotification = webpoints.features.taskModel.AsyncProgressNotification;
	
var app = new Application(), scheduler = new TaskScheduler(null, {maxRemainingTime: 60 * 1000});

//Enable long-running operations management
app.features = [scheduler];

app.operations['/someJob'] = {
	method: 'get',
	longRunning: true,			//this flag is used by TaskScheduler feature
	params: {delay: {deserialize: true}},
	handler: function(delay, callback){
		//emulates hard work
		setTimeout(function(){
			//Returns result to the client.
			callback('Hard job is completed!!!');	
		}, delay);
	}
};

app.operations['/someJob2'] = {
	method: 'get',
	//compute remaining time approximately
	longRunning: {appraise: function(times, callback){ callback(times * 1000); }},
	params: {times: {deserialize: true}},
	handler: function(times, callback){
		for(var i = 1; i < times; i++)
			//emulates step work
			setTimeout(function(){
				//Decrements the remaining time
				callback(new ProgressNotification(1000));	
			}, i * 1000);
		//completes hard job
		setTimeout(function(){
			callback('Hard job is completed!!!');
		}, times * 1000);
	}
};

//This trick allows to query task status from the browser
TaskMonitorEndpoint.prototype.method = 'get';

console.log('This example demonstrates HTTP long-running tasks. Query http://localhost:4000/someJob?delay=10000 from browser to get task ID.');
console.log('Save the task ID returned by server and go to http://localhost:4000/tasks/[task-id] to obtain the result');

app.run(4000);

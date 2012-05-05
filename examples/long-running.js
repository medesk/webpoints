//This example demonstrates long-running tasks
var webpoints = require('../');
var Application = webpoints.Application,
	TaskMonitorEndpoint = webpoints.features.taskModel.TaskMonitorEndpoint,
	TaskScheduler = webpoints.features.taskModel.TaskScheduler;
	
var app = new Application(), scheduler = new TaskScheduler();

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

//This trick allows to query task status from the browser
TaskMonitorEndpoint.prototype.method = 'get';

console.log('This example demonstrates HTTP long-running tasks. Query http://localhost:4000/someJob?delay=10000 from browser to get task ID.');
console.log('Save the task ID returned by server and go to http://localhost:4000/tasks/[task-id] to obtain the result');

app.run(4000);

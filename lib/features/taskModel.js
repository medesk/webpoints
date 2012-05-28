var crypto = require('crypto'), utils = require('util'), toPlainFunction = module.parent.exports.toPlainFunction;

var TaskState = {
	Created: 0,
	Executed: 1,
	Completed: 2
};
exports.TaskState = TaskState;

/**
 * Constructs a new task.
 * 
 * @class Represents enqueued task.
 */
function Task(lifetime){
	this.createdAt = new Date();
	this.state = TaskState.Created;
	this.lifetime = lifetime || 1; //max number of requests from the Task Collector
}

/**
 * Executes long-running task asynchronously.
 * @param {OperationContext} context Operation context for handler.
 * @param {Array} args Handler invocation arguments.
 * @param {Function} handler User-define function to execute asynchronously.
 * @return {Boolean} true, task can be executed in the current state; otherwise, false.
 */
Task.prototype.execute = function(context, args, handler){
	if(this.state != TaskState.Created) return false;
	if(args !== undefined && handler !== undefined)
		process.nextTick(function(){ handler.apply(this, args); }.bind(context));
	this.startedAt = new Date();
	this.state = TaskState.Executed;
	return true;
};

/**
 * Marks task as completed.
 * 
 * @api public
 */
Task.prototype.complete = function(){
	this.state = TaskState.Completed;
	this.completedAt = new Date();
	this.result = new Array();
	for(var i in arguments) this.result.push(arguments[i]);
}

/**
 * Constructor for running tasks.
 * 
 * @class Represents a collection of running tasks.
 */
function ActiveTaskCollection(){
	Object.defineProperty(this, 'dequeue', {enumerable: false, 
		configurable: false,
		writable: false,
		value: function(taskId, callback){
			var task = this[taskId];
			if(task) switch(task.state){
				case TaskState.Created: return callback(utils.format('Task is created but not executed. Created at %s', task.createdAt), 201);
				case TaskState.Executed: return callback(utils.format('Task is processing. Created at %s. Started at %s', task.createdAt, task.startedAt), 204);
				case TaskState.Completed: 
					delete this[taskId];
					return callback.apply(null, task.result);
				default: return callback(utils.format('Task state %s is not supported', task.state), 501);
			}
			else callback('Task doesn\'t exist on the server.', 404);
		}
	});
	Object.defineProperty(this, 'collect', {
		enumerable: false,
		configurable: false,
		writable: false,
		value: function(generation){
			if(generation === undefined) generation = 0;
			var ids = new Array();
			//select tasks to collect
			for(var id in this.tasks){
				var task = this.tasks[id];
				if((task.lifetime -= generation) <= 0) ids.push(id);
				delete task; delete id;
			}
			//remove necessary tasks
			ids.forEach(function(id){ delete this[id]; }.bind(this));
			return ids;
		}
	});
}

/**
 * Collect all unused task results.
 * @param {ActiveTaskCollection} tasks Collection of tasks.
 * 
 * @api private
 */
function collectTasks(tasks){
	tasks.collect(1);
}

/**
 * Constructor for long-running HTTP task scheduler.
 * 
 * @class Scheduler for long-running tasks.
 * @param {String} monitorUrl Relative URL that can be used to obtain task result. Should contain :taskId string.
 * @param {Number} tcinterval Task Collector interval, in milliseconds.
 */
function TaskScheduler(monitorUrl, tcinterval){
	this.monitorUrl = monitorUrl || '/tasks/:taskId';
	this.tasks = new ActiveTaskCollection();
	this.taskLifetime = 1;
	if(tcinterval !== undefined) this.taskCollector = setInterval(collectTasks, tcinterval, this.tasks)
}
exports.TaskScheduler = TaskScheduler;

/**
 * Constructs a new monitor service operation.
 * 
 * @class Represents task monitor endpoint.
 * @param {ActiveTaskCollection} tasks A collection of running tasks.
 */
function TaskMonitorEndpoint(scheduler){
	var tasks = scheduler.tasks;
	this.handler = function(taskId, callback){ tasks.dequeue(taskId, callback); }
}
exports.TaskMonitorEndpoint = TaskMonitorEndpoint;

TaskMonitorEndpoint.prototype.method = 'delete';
TaskMonitorEndpoint.prototype.params = {taskId: {}};
TaskMonitorEndpoint.prototype.serialize = true;

/**
 * Adds task monitor endpoint to the collection of application operations.
 * 
 * @param {ServiceOperationCollection} operations Collection of operations.
 * @return {Object} Service operation.
 */
TaskScheduler.prototype.setMonitor = function(operations){
	return operations[this.monitorUrl] = new TaskMonitorEndpoint(this);	
}

/**
 * Generates a new task identifier.
 * 
 * @return {String} A new task identifier.
 * @api public
 */
TaskScheduler.prototype.newTaskId = function(){
	var rbytes = crypto.randomBytes(12);
	return rbytes.toString('hex');
};

function HttpAsyncFlow(scheduler, handler, callback){
	this.task = new Task(scheduler.taskLifetime);
	this.taskId = scheduler.newTaskId();
	this.handler = handler;
	this.callback = callback;
	this.monitorUrl = scheduler.monitorUrl;
	this.queue = scheduler.tasks;
}

HttpAsyncFlow.prototype.beginInvoke = function(){
	if(this.queue[this.taskId]) return this.callback('Duplicated task.', 503);
	//pushes task into the queue
	this.queue[this.taskId] = this.task;
	this.task.execute();
	//Return HTTP-202 and location of the task status
	return this.callback(this.monitorUrl.replace(':taskId', this.taskId), 202);
};

HttpAsyncFlow.prototype.endInvoke = function(){
	//beginInvoke is not executed then return synchronously
	if(this.task.state == TaskState.Created) return this.callback.apply(this, arguments);
	else this.task.complete.apply(this.task, arguments);
};

/**
 * Creates a new long-running task.
 * 
 * @param {Function} handler Service operation handler that implements long-running task.
 * @param {Boolean} manual true to define lazy handler (in which long-running behavior determines imperatively); otherwise, false.
 * @return {Function} A handler that returns HTTP-202 immediately.
 * @api public
 */
TaskScheduler.prototype.task = function(handler, manual){
	//taskId generator
	var scheduler = this;
	function autoAsyncHandler(args, callback){
		var flow = new HttpAsyncFlow(scheduler, handler, callback);
		flow.beginInvoke();
		args.push(callback = HttpAsyncFlow.prototype.endInvoke.bind(flow));
		handler.apply(this, args);
	}
	function manualAsyncHandler(args, callback){
		args.push(callback = new HttpAsyncFlow(scheduler, handler, callback));
		handler.apply(this, args);
	}
	return toPlainFunction(manual ? manualAsyncHandler : autoAsyncHandler); 
};

/**
 * Initializes WebPoint application.
 * 
 * @param {Application} app An instance of the WebPoints application.
 */
TaskScheduler.prototype.init = function(app){
	this.setMonitor(app.operations);
};

/**
 * Applies feature to the specified service operation.
 * 
 * @param {Object} descriptor Descriptor of the long-running service operation.
 */
TaskScheduler.prototype.apply = function(descriptor){
	switch(descriptor.longRunning){
		case true:
		case "auto":
			descriptor.handler = this.task(descriptor.handler);
			return true;
		case "manual":
			delete descriptor.serialize;
			descriptor.handler = this.task(descriptor.handler, true);
			return true;
		default: return false;
	}
};

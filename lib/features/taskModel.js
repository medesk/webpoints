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
	delete this.remainingTime;
	for(var i in arguments) this.result.push(arguments[i]);
}

Task.prototype.remainingTimeHeader = "Retry-After";

/**
 * Constructor for running tasks.
 * 
 * @class Represents a collection of running tasks.
 * @param {Number} capacity Capacity of the task pool collection.
 */
function ActiveTaskCollection(capacity){
	Object.defineProperty(this, 'dequeue', {enumerable: false, 
		configurable: false,
		writable: false,
		value: function(taskId, callback){
			var task = this[taskId];
			if(task) switch(task.state){
				case TaskState.Created: return callback(utils.format('Task is created but not executed. Created at %s', task.createdAt), 201);
				case TaskState.Executed: 
					var internalHeaders = {};
					if(task.remainingTime !== undefined && task.remainingTime !== null)
						internalHeaders[task.remainingTimeHeader] = (task.remainingTime / 1000).toString();	//in seconds
					return callback(utils.format('Task is processing. Created at %s. Started at %s', task.createdAt, task.startedAt), 204, internalHeaders);
				case TaskState.Completed: 
					if(delete this[taskId]) this.count -= 1;
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
			ids.forEach(function(id){ if(delete this[id]) this.count -= 1; }.bind(this));
			return ids;
		}
	});
	Object.defineProperty(this, 'capacity', {
		enumerable: false,
		configurable: false,
		writable: false,
		value: capacity || 1000
	});
	Object.defineProperty(this, 'count', {
		enumerable: false,
		configurable: false,
		writable: true,
		value: 0
	});
	Object.defineProperty(this, 'enqueue', {
		enumerable: false,
		configurable: false,
		writable: false,
		value: function(taskId, task, args){
			if(this.count >= this.capacity) return false;
			this[taskId] = task;
			this.count += 1;
			task.execute.apply(task, args);
			return true;
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
 * @param {Object} options Task scheduler options.
 */
function TaskScheduler(monitorUrl, options){
	this.monitorUrl = monitorUrl || '/tasks/:taskId';
	this.tasks = new ActiveTaskCollection(options && options.capacity);
	this.taskLifetime = (options && options.taskLifetime) || 2;
	if(options && options.tcinterval) this.taskCollector = setInterval(collectTasks, options.tcinterval, this.tasks);
	this.maxRemainingTime = options && options.maxRemainingTime;
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

/**
 * 
 */
function AsyncProgressNotification(elapsedTime){
	this.elapsedTime = elapsedTime || 0;
}

/**
 * Sets progress to the asynchronous task.
 * @param {Task} task an asynchronous task.
 */
AsyncProgressNotification.prototype.set = function(task){
	return task.remainingTime -= this.elapsedTime;
};

exports.AsyncProgressNotification = AsyncProgressNotification;

function HttpAsyncFlow(scheduler, callback){
	this.task = new Task(scheduler.taskLifetime);
	this.taskId = scheduler.newTaskId();
	this.callback = callback;
	this.monitorUrl = scheduler.monitorUrl;
	this.queue = scheduler.tasks;
	this.maxRemainingTime = scheduler.maxRemainingTime || 300000;	//5 min max time
}

HttpAsyncFlow.prototype.beginInvoke = function(remainingTime){
	if(this.queue[this.taskId]) return (this.callback('Duplicated task.', 503), false);
	else if(remainingTime > this.maxRemainingTime) return (this.callback(utils.format('The task has too much run-time(%s ms).', remainingTime), 400), false);
	else if(!this.queue.enqueue(this.taskId, this.task)) return (this.callback(utils.format('The capacity(%s) of the task pool exceeded.', this.queue.capacity), 400), false);
	//pushes task into the queue
	this.task.remainingTime = remainingTime;
	//Return HTTP-202 and location of the task status
	return (this.callback(this.monitorUrl.replace(':taskId', this.taskId), 202), true);
};

HttpAsyncFlow.prototype.endInvoke = function(){
	//beginInvoke is not executed then return synchronously
	if(this.task.state == TaskState.Created) return this.callback.apply(this, arguments);
	else if(arguments[0] instanceof AsyncProgressNotification) arguments[0].set(this.task);
	else return this.task.complete.apply(this.task, arguments);
};

HttpAsyncFlow.prototype.progress = function(elapsedTime){
	this.endInvoke(new AsyncProgressNotification(elapsedTime));
};

/**
 * Creates a new long-running task.
 * 
 * @param {Function} handler Service operation handler that implements long-running task.
 * @param {Boolean} manual true to define lazy handler (in which long-running behavior determines imperatively); otherwise, false.
 * @return {Function} A handler that returns HTTP-202 immediately.
 * @api public
 */
TaskScheduler.prototype.task = function(handler, options){
	if(!options) options = {};
	var scheduler = this, appraise = options.appraise;
	function autoAsyncHandler(args, callback){
		function computeRemainingTime(context, appraiser, args, callback){
			if(appraiser instanceof Function){
				args = args.slice(0);
				args.push(callback.bind(context));
				appraiser.apply(context, args);
			}
			else callback.call(context);
		}
		var flow = new HttpAsyncFlow(scheduler, callback);
		this.taskId = flow.taskId;
		//Compute operation remaining time
		computeRemainingTime(this, appraise, args, function(remainingTime){
			//pass remaining time to the task
			if(flow.beginInvoke(remainingTime)){
				args.push(callback = HttpAsyncFlow.prototype.endInvoke.bind(flow));
				handler.apply(this, args);
			}
		});
	}
	function manualAsyncHandler(args, callback){
		args.push(callback = new HttpAsyncFlow(scheduler, callback));
		this.taskId = callback.taskId;
		handler.apply(this, args);
	}
	return toPlainFunction(options.manual ? manualAsyncHandler : autoAsyncHandler); 
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
			delete descriptor.serialize;
			descriptor.handler = this.task(descriptor.handler);
			return true;
		case "manual":
			delete descriptor.serialize;
			descriptor.handler = this.task(descriptor.handler, {manual: true});
			return true;
		case null:
		case undefined: return false;
		default: 
			 delete descriptor.serialize;
			 descriptor.handler = this.task(descriptor.handler, descriptor.longRunning);
			 return true;
	}
};

var crypto = require('crypto'), utils = require('util'), toPlainFunction = module.parent.exports.toPlainFunction;

var AsyncState = {
	Created: 0,
	Executed: 1,
	Completed: 2
};
exports.AsyncState = AsyncState;

function InMemoryTask(properties){
	for(var i in properties) this[i] = properties[i];
}

InMemoryTask.prototype.setProperties = function(properties, callback){
	for(var i in properties) 
		switch(i){
			case "elapsedTime": this.remainingTime -= properties[i]; continue;
			default: this[i] = properties[i]; continue;
		}
	return callback(true);
};

InMemoryTask.prototype.getProperties = function(names, callback){
	var properties = names.reduce(function(properties, name){ 
		properties[name] = this[name];
		return properties;
	}.bind(this), 
	new Object());
	
	return callback(properties);
};

function InMemoryPersistence(){
	this.tasks = new Object();
}

InMemoryPersistence.prototype.open = function(taskId, callback){
	return callback(this.tasks[taskId]);
};

InMemoryPersistence.prototype.remove = function(taskId, callback){
	return callback(delete this.tasks[taskId]);
};

InMemoryPersistence.prototype.collect = function(generation, callback){
	if(generation === undefined) generation = 0;
	var ids = new Array();
	//select tasks to collect
	for(var id in this.tasks){
		var task = this.tasks[id];
		if((task.lifetime -= generation) <= 0) ids.push(id);
		delete task; delete id;
	}
	//remove necessary tasks
	ids = ids.filter(function(id){ return delete this[id]; }.bind(this.tasks));
	return callback(ids.length);
};

InMemoryPersistence.prototype.save = function(taskId, properties, callback){
	return callback(this.tasks[taskId] = new InMemoryTask(properties));
};

/**
 * Constructor for running tasks.
 * 
 * @class Represents a collection of running tasks.
 * @param {Number} capacity Capacity of the task pool collection.
 */
function ActiveTaskCollection(persistence, capacity){
	this.persistence = persistence || new InMemoryPersistence();
	this.capacity = capacity || 1000;
	this.count = 0;
}

ActiveTaskCollection.prototype.dequeue = function(taskId, callback){
	this.persistence.open(taskId, function(task){
		if(task) task.getProperties(['state', 'remainingTime', 'createdAt', 'startedAt', 'result'], function(task){
			switch(task.state){
				case AsyncState.Created: return callback(utils.format('Task is created but not executed. Created at %s', task.createdAt), 201);
				case AsyncState.Executed: 
					var internalHeaders = {};
					if(task.remainingTime !== undefined && task.remainingTime !== null && task.remainingTime !== NaN)
						internalHeaders[this.rth] = (task.remainingTime / 1000).toString();	//in seconds
					return callback(utils.format('Task is processing. Created at %s. Started at %s', task.createdAt, task.startedAt), 204, internalHeaders);
				case AsyncState.Completed:
					this.count -= 1;
					this.persistence.remove(taskId, function(){ });
					return callback.apply(null, task.result || []);
				default: return callback(utils.format('Task state %s is not supported', task.state), 501);
			}
		}.bind(this));
		else callback('Task doesn\'t exist on the server.', 404);
	}.bind(this));
};

ActiveTaskCollection.prototype.collect = function(generation){
	this.persistence.collect(generation, function(count){
		this.count -= count;
	}.bind(this));
};

ActiveTaskCollection.prototype.enqueue = function(taskId, properties, callback){
	if(this.count >= this.capacity) return callback();
	this.count += 1;
	return this.persistence.save(taskId, properties, callback);
};

ActiveTaskCollection.prototype.exists = function(taskId, callback){
	this.persistence.taskById(taskId, function(task){
		callback(task ? true : false);	
	});
};

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
	this.tasks = new ActiveTaskCollection(options && options.persistence, options && options.capacity);
	this.taskLifetime = (options && options.taskLifetime) || 2;
	if(options && options.tcinterval) this.taskCollector = setInterval(collectTasks, options.tcinterval, this.tasks);
	this.maxRemainingTime = options && options.maxRemainingTime;
	this.tasks.rth = (options && options.remainingTimeHeader) || "Retry-After";
}
exports.TaskScheduler = TaskScheduler;

/**
 * Constructs a new monitor service operation.
 * 
 * @class Represents task monitor endpoint.
 * @param {ActiveTaskCollection} tasks A collection of running tasks.
 */
function TaskMonitorEndpoint(scheduler){
	this.handler = ActiveTaskCollection.prototype.dequeue.bind(scheduler.tasks);
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
	return task.setProperties({'elapsedTime': this.elapsedTime}, function(){ });
};

exports.AsyncProgressNotification = AsyncProgressNotification;

function HttpAsyncFlow(scheduler, callback){
	this.monitorUrl = scheduler.monitorUrl.replace(':taskId', this.taskId = scheduler.newTaskId());
	this.callback = callback;
	this.queue = scheduler.tasks;
	this.maxRemainingTime = scheduler.maxRemainingTime || 300000;	//5 min max time
	this.lifetime = scheduler.taskLifetime;
}

HttpAsyncFlow.prototype.beginInvoke = function(remainingTime, callback){
	if(remainingTime instanceof Function){ callback = remainingTime; delete remainingTime; }
	//Check task processing time
	if(remainingTime > this.maxRemainingTime) return callback((this.callback(utils.format('The task has too much run-time(%s ms).', remainingTime), 400), false));
	//pushes a new task into the queue
	if(this.task) return callback(false);
	else this.queue.enqueue(this.taskId, {'remainingTime': remainingTime, createdAt: new Date(), state: AsyncState.Created, 'lifetime': this.lifetime}, function(task){
		if(task) task.setProperties({state: AsyncState.Executed, startedAt: new Date()}, function(success){
			if(success){
				this.task = task;
				this.callback(this.monitorUrl, 202);
				return callback(true);
			}
			else return callback(false);
		}.bind(this));
		else return callback((this.callback(utils.format('The capacity(%s) of the task pool exceeded.', this.queue.capacity), 400), false));
	}.bind(this));
};

HttpAsyncFlow.prototype.endInvoke = function(){
	if(this.task){
		if(arguments[0] instanceof AsyncProgressNotification) return (arguments[0].set(this.task), true);
		arguments = Object.keys(arguments).map(function(i){ return this[i]; }, arguments);
		this.task.setProperties({'state': AsyncState.Completed, 'result': arguments, completedAt: new Date()}, function(){ });
		delete this.task;
	}
	//beginInvoke is not executed then return synchronously
	else return this.callback.apply(this, arguments);
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
			flow.beginInvoke(remainingTime, function(success){
				if(!success) return;
				args.push(callback = HttpAsyncFlow.prototype.endInvoke.bind(flow));
				handler.apply(this, args);
			});
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

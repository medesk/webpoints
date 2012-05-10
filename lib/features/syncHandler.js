function toAsynchronous(f){
	return function(){
		var args = [];
		for(var a in arguments) args.push(arguments[a]);
		var callback = args.pop();
		callback(f.apply(this, args));
	};
};

module.exports = function(operation){
	if(operation.synchronous){
		operation.handler = toAsynchronous(operation.handler);
		return true;
	}
	else return false;
}

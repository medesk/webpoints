var toPlainFunction = module.parent.exports.toPlainFunction;

function toAsynchronous(fn){
	return toPlainFunction(function(args, callback){ callback(fn.apply(this, args)); });
};

module.exports = function(operation){
	if(operation.synchronous){
		operation.handler = toAsynchronous(operation.handler);
		return true;
	}
	else return false;
}

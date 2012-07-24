var toPlainFunction = module.parent.exports.toPlainFunction,
	HttpStatusCode = module.parent.exports.HttpStatusCode;

module.exports = function(operation){
	var handler = operation.handler;
	operation.handler = toPlainFunction(function(args, callback){		
		if(this.enabled){
			args.push(callback);
			return handler.apply(this, args);		
		}else return callback('Application instance is disabled', HttpStatusCode.NotFound);
	});
	return true;
}

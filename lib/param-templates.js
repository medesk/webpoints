var utils = require('util');

function typeName(t){
	switch(t){
		case 'string':
		case String: return 'string';
		case 'integer': return 'integer';
		case 'number':
		case Number: return 'number';
		case 'boolean':
		case Boolean: return 'boolean';
		case 'null':
		case null: return 'null';
		case 'any': return;
		case 'object':
		case Object: return 'object';
		case 'array':
		case Array: return 'array';
		default: return t;
	}
}

function Primitive(t, defval){
	this.deserialize = true;
	this['default'] = defval;
	this.schema = {type: typeName(t)};
}

exports.Primitive = Primitive;
exports.NumberParam = function(defval){
	Primitive.call(this, 'number', defval);
};
exports.StringParam = function(defval){
	Primitive.call(this, 'string', defval);
};
exports.IntegerParam = function(defval){
	Primitive.call(this, 'integer', defval);
};
exports.BoolParam = function(defval){
	Primitive.call(this, 'boolean', defval);
};
exports.NullParam = function(){
	Primitive.call(this, null);	
};
exports.ObjectParam = function(defval){
	Primitive.call(this, 'object', defval);
};
exports.AnyParam = function(defval){
	Primitive.call(this, 'any', defval);
};
exports.UnionParam = function(){
	this.deserialize = true;
	var result;
	if((result = arguments[0]) instanceof Array){
		this.scheme = {type: result.map(typeName)};
		this['default'] = arguments[1];
	}
	else {
		result = new Array();
		for(var i in arguments) result.push(typeName(arguments[i]));
		delete i;
		this.scheme = {type: result};
	}
};

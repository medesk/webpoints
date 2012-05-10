var rest = require('restler');

exports.getWithParams = function(test){
	rest.get('http://localhost:4000/sum?x=5&y=10').on('complete', function(result, response){
		test.equal(response.statusCode, 200);
		result = JSON.parse(result);
		test.equal(result, 15, 'Sum operation failed.');
		test.done();
	});
};

exports.invalidRequires = function(test){
	rest.get('http://localhost:4000/div?x=10&y=0').on('complete', function(result, response){
		test.equal(response.statusCode, 412, 'Failed precondition expected');
		test.equal(result, 'Denominator cannot be zero.', 'Custom message expected');
		test.done();
	});
};

exports.postWithOptionals = function(test){
	rest.post('http://localhost:4000/postWithOptionals', {data: {y: 10}}).on('complete', function(result, response){
		test.equal(response.statusCode, 200);
		result = JSON.parse(result);
		test.equal(result, 12);
		test.done();
	});
};

exports.requestHelpPage = function(test){
	rest.get('http://localhost:4000/help').on('complete', function(result, response){
		test.equal(response.statusCode, 200);
		test.done();
	});
}

exports.getWithInvalidDataTypeParams = function(test){
	rest.get('http://localhost:4000/sum?x=5&y=10.2').on('complete', function(result, response){
		test.equal(response.statusCode, 400);
		test.done();
	});
};





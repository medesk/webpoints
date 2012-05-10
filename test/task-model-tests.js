var rest = require('restler');

exports.longRunningOperation = function(test){
	rest.post('http://localhost:4000/longTimeSum', {data: {x: 10, y: 30}}).on('complete', function(monitor, response){
		test.equal(response.statusCode, 202);
		monitor = 'http://localhost:4000' + monitor;
		//Obtains result from the monitor
		rest.del(monitor).on('complete', function(result, response){
			test.equal(response.statusCode, 204);
			//wait for result
			setTimeout(function(){
				rest.del(monitor).on('complete', function(result, response){
					test.ok(result, 'Long-running response expected');
					test.equal(response.statusCode, 200);
					result = JSON.parse(result);
					test.equal(result, 40);
					//duplicate request on task
					rest.del(monitor).on('complete', function(result, response){
						test.equal(response.statusCode, 404);
						test.done();
					});
				});
			}, 4000);
		});
	});
};
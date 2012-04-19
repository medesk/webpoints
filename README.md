WebPoints is a web framework build on top of [ExpressJS](http://expressjs.com/) for [node](http://nodejs.org). It is oriented on RESTful service development with JSON serialization. NOTE: It is not a template engine consolidation library.

```js
var WebPoints = require('webpoints').Application, app = new WebPoints();

app.endpoints['/'] = {
  method: 'get',
  handler: function(callback) { callback('Hello, world!'); }
};

app.endpoints['/sum'] = {
  method: 'get',
  serialize: true,
  params: {x: {deserialize: true}, y: {deserialize: true, 'default': 0}},
  handler: function(x, y, callback) { callback(x + y); }
};

app.endpoints['files'] = process.env['HTMLPAGES'];

app.run(3000);
```

## Installation

    $ npm install webpoints

## Features

   * Enables to describe RESTful service in most human readable declarative manner;
   * Automatic JSON deserialization of parameters passed through HTTP body or URL;
   * JSON deserialization/serialization of parameters can be replaced with custom formatter. For example, you can add XML deserializer for REST operation;
   * Built-in JSON Schema validation of input arguments passed from network;
   * Supports ExpressJS middleware and engine;
   * Extensible declarative model;

## License 

(The MIT License)

Copyright (c) 2012 Sakno Roman

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


# riak-bot
## riak node configuration, discovery & auto clustering

// TODO: node reip, cluster join/plan/commit

// TODO: actually discover

### Example:

```

// instantiate
var
  rb = require('riak-bot')
  , node = new rb({ 
  
    bind : '0.0.0.0'
  	, host : '127.0.0.1'
  	, name : 'ohai'
  	, key : 'riak'
  	, directory: './'
});

// update some stuff maybe?
node.set('name', 'dafdsff')

// write the configs
node.configure();

// catch some errors
node.on('error', function(err) { 

	console.log([ '[', (new Date()).toLocaleString(), '] ', err ].join(''));

});
```

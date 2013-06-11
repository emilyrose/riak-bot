var
	fs = require('fs')
	, ejs = require('ejs')
	, exec = require('child_process').exec
	, request = require('request')
	, stream = require('stream')
	, path = require('path')
	, util = require('util')
;

function bot(opts) {
	
	var 
		opts = this.opts = opts || { }
		, params = { }
		, self = this
	;

	if(!opts.directory) { 

		throw("No riak directory provided."); 
	}

	if(!opts.name) {

		throw("No riak name provided.");
	}

	if(!opts.host) {

		throw("No host provided.");
	}

	if(!opts.key) {

		throw("No key provided");
	}
	stream.call(this);

	var 
		name = function() { 

			return [ opts.name, '@', opts.host ].join('');
		}
	;

	function gen() {

		self.params = {

			name : name()
			, cookie : opts.key
			, bind : opts.bind
			, host : opts.host

		};

		return self;
	}

	this.compile = function(str) {
		
		return ejs.render(str, this.params) || undefined;
	};

	this.write = function(str, tpl) {

		fs.writeFile(path.resolve(opts.directory, tpl), str, function(err) {

			if(err) { return this.error(err); }
		});
	};

	this.update = function() { return gen(); };
	gen();
}

util.inherits(bot, stream);


bot.prototype.cluster = function cluster(action, cb) {

	exec(util.format('riak-admin cluster %s', action), cb);
};

bot.prototype.plan = function(cb) {

	this.cluster('plan', cb);
};

bot.prototype.commit = function commit(cb) {

	this.cluster('commit', cb);
};

bot.prototype.up = function(cb) {
	
	var rb = this;
	exec('riak start', function(err, stdout, stderr) {

		if(err) { 
			if(!stdout || !~stdout.indexOf("already running")) {

				cb(err, false);
				return rb.error(err); 
			}
		}

		console.log("Riak up...");
		rb.emit('up', true);
		return cb(null, true);
	});

};

bot.prototype.down = function(cb) {
	
	var rb = this;
	exec('riak stop', function(err, stdout, stderr) {

		if(err) { 
			if(stdout && ~stdout.indexOf("not responding")) {

				// Riak is already down.
				console.log("Riak down...");
				rb.emit('down', true);
				return cb(null, true);
			} else {

				cb(err, false);
				return rb.error(err);
			}
		}

		// Riak was up, but is now down.
		if(stdout.indexOf("ok") !== -1) {

			console.log("Riak down...");
			rb.emit('down', true);
			return cb(null, true);
		} else {

			var errmsg = "Unable to bring riak down";
			cb(errmsg, false);
			return rb.error(errmsg);
		}

	});
};

bot.prototype.kill = function(cb) {
	
	exec("ps aux | grep [r]iak | awk '{print $2}' | xargs kill", killed);

	function killed(err, stdout, stderr) {

		if(!err) {

			return cb(null, true);
		}
		cb(err, false);
	}
};

bot.prototype.join = function join(node, cb) {

	var msg
		, rb = this
	;

	if(this.ring && ~this.ring.indexOf(node)) {
		msg = "This node is already part of a ring.";
		console.log(msg);
		rb.error(msg);
		return cb(msg);
	}

	this.cluster('join ' + node, function(err, stdout, stderr) {

		if(err) {

			if(stdout.indexOf("already a member")) {
				msg = "This node is already in cluster.";
				rb.error(msg);
				return cb(msg);
			}
			rb.error(err);
			return cb(err);
		}
		if((stdout) && stdout.indexOf("staged leave request")) {

			rb.plan(function(err, stdout, stderr) {

				if(err) { 

					rb.error(err);
					return cb(err);
				}

				console.log("Attempting to join cluster...");
				rb.commit(cb);
			});
		}
		else {

			console.log("cluster join problem: %s", stdout);
			rb.error(stdout);
			return cb(stdout);
		}
	});
};

bot.prototype.leave = function leave(cb) {

	var rb = this;

	this.cluster('leave', function(err, stdout, stderr) {
		if(err) {
			console.log("Err: " + err);
		}

		if((stdout) && stdout.indexOf("staged leave request")) {

			rb.plan(function(err, stdout, stderr) {

				if(err) { 

					rb.error(err);
					return cb(err);
				}

				console.log("Attempting to leave cluster...");
				rb.commit(cb);
			});
		}
		else {

			console.log("cluster leave problem: %s", stdout);
			rb.error(stdout);
			return cb(stdout);
		}
	});
};

bot.prototype.reip = function reip(cb) {

	var rb = this;

	console.log(rb.oldName, " -> ", rb.params.name);
	exec(

		util.format('riak-admin reip %s %s', rb.oldName, rb.params.name)
		, reipDone
	);

	function reipDone(err, stdout, stderr) {

		console.log(">> %s", stdout || null);
		if((!err) && stdout.indexOf("New ring file written") !== -1) {

			rb.emit('reip', true);
			console.log("reip success");
			return cb(null, rb.params.name);
		}
		if(err) {

			if(stdout.indexOf("Node must be down") !== -1) {

				return cb("Node online", null);
			}
			return cb(err, null)
		}
		cb("Reip failed", false);
		rb.emit('reip', false);
	}
};

bot.prototype.getOldName = function(cb) {

	var rb = this;
	exec(

		util.format(

			'cat %s | grep name'
			, path.resolve(rb.opts.directory, 'vm.args')
		)
		, function(err, stdout, stderr) {

			if(err) { 

				cb(err, undefined);
				return rb.error(err); 
			}

			if((stdout) && stdout.indexOf("@") !== -1) {

				return cb(

					null
					, rb.oldName = stdout.split(" ")[1].replace(/[\r\n]/g, "")
				);
				rb.emit('oldname', rb.oldName);
			}
			cb("Invalid vm.args", undefined);
		}
	);
};

bot.prototype.stats = function stats(cb) {
	
	var rb = this;
	request("http://127.0.0.1:8098/stats", function(err, res, body) {

		if(!err && res.statusCode == 200) {

			try {

				var json = getJSON(body)
			}
			catch(e) {

				cb(e, null);
				return error(e);
			}

			var ring = json.ring_members;
			if(ring) {

				rb.ring = ring;
				return cb(null, ring);
			}
		}
		cb(err, null);
	});
};
/**
 * Write config & args to the specified directory
 */
bot.prototype.configure = function configure(opts) {

	this.readTemplate('app.config', this.writeTemplate.bind(this));
	this.readTemplate('vm.args', this.writeTemplate.bind(this));

	return this;
};

bot.prototype.set = function set(property, value) {

	this.opts[property] = value || undefined;
	this.update();
};

bot.prototype.readTemplate = function readTemplate(tpl, cb) {

	var 
		tplPath = path.resolve(__dirname, 'templates', tpl + '.ejs')
		, exists = function(bool) {

			if(!bool) { 

				return this.error("No template available for %s", tpl); 
			}
			read();
		}
		, read = function() {

			fs.readFile(tplPath, function(err, dat) {

				if(err) { return this.error(err); }
				cb(dat.toString(), tpl);
			});
		}
	;

	fs.exists(tplPath, exists);
};

bot.prototype.writeTemplate = function writeTemplate(str, tpl) {

	this.write(this.compile(str), tpl);
};

bot.prototype.error = function error() {

	var 
		args = Array.prototype.slice.call(arguments)
		, err = util.format.apply(null, args)
	;
	// TODO: something useful.
	this.emit('error', err);	
};

function getJSON(json) {

	try {

		var j = JSON.parse(json, null, "\t");
	}
	catch(e) {

		return null;
	}
	return j;
};

module.exports = bot;

var
	fs = require('fs')
	, ejs = require('ejs')
	, exec = require('child_process').exec
	, stream = require('stream')
	, path = require('path')
	, util = require('util')
;

/**
 * TODO: options object and actual options parsing
 */
function bot(opts) {
	

	var opts = this.opts = opts || { };

	if(!opts.directory) { 

		return this.error("No riak directory provided."); 
	}

	stream.call(this);
	var 
		name = function() { 

			return [ opts.name, '@', opts.host ].join('') 
		}
	;

	function gen() {

		params = {

			name : name()
			, cookie : opts.key
			, bind : opts.bind
			, host : opts.host

		}

		return this;
	}

	this.compile = function(str) {
		
		return ejs.render(str, params) || undefined;
	};

	this.write = function(str, tpl) {

		fs.writeFile(path.resolve(opts.directory, tpl), str, function(err) {

			if(err) { return this.error(err); }
		});
	};

	this.update = function() { return gen(); }
	gen();
};

util.inherits(bot, stream);

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

module.exports = bot;

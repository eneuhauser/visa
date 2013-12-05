var _ = require('lodash'),
	path = require('path'),
	fs = require('fs'),
	mkdirp = require('mkdirp');

function File() { this.init.apply(this, arguments); }
_.extend(File.prototype, {
	init: function(filePath) {
		this.path = path.normalize(filePath);
		this.name = path.basename(this.path);
		this.folderExists = false;
	},
	write: function(text, callback) {
		var file = this.path;
		var dir = path.dirname(file);
		var writeFile = function() {
			fs.writeFile(file, text, function(err) {
				if(err) {
					console.error('Could not write file', err);
					return;
				}
				callback();
			});
		};
		if(dir) {
			mkdirp(dir, writeFile);
		} else {
			writeFile();
		}
	},
	onSave: function(callback) {
		var path = this.path, self = this;
		fs.watchFile(path, function(curr, prev) {
			if(curr.mtime.getTime() === prev.mtime.getTime()) {
				return;
			}
			fs.readFile(path, 'utf-8', function(err, text) {
				callback(text);
			});
		});
	},
	unbind: function() {
		fs.unwatchFile(this.path);
	}
});

module.exports = File;

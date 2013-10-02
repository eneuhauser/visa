/**
 * 1. On startup, read the directory looking for any \\d+.md files
 *    - Watch those files
 * 2. After retrieving one post, have a prompt ready to ask for another.
 * 3. Ensure auth issues are handled when submitting a post after a long time
 * 4. Include meta data to update title, tags, etc
 * 5. Create new posts (requires meta data support)
 * 6. Update bio page.
 */


var _ = require('lodash'),
	request = require('request').defaults({jar: true}),
	FormData = require('form-data'),
	cheerio = require('cheerio'),
	prompt = require('prompt'),
	fs = require('fs'),
	CAS = require('./lib/cas'),
	exec = require('child_process').exec;


var cas;

var Passport = {
	posts: {},
	root: 'http://passport.vml.com',
	attempts: 0,
	get: function(postId, callback) {
		var self = this;
		this._get(postId, function(response, body) {
			var $ = cheerio.load(body);
			self.posts[postId] = self.serialize($);
			if(callback) {
				callback($('textarea').val());			
			}
		});
	},
	put: function(postId, post) {
		var data = this.posts[postId];
		var self = this;
		var callback = function() {
			console.log('Updated Post ' + postId + '!');
			// Needs to be retrieved again to update the data
			self.get(postId);
		}
			
		if(!data) {
			this._get(postId, function(response, body) {
				var $ = cheerio.load(body);
				self._post(self.serialize($), post, callback);
			});
		} else {
			this._post(data, post, callback);
		}
	},
	serialize: function($) {
		var $form = $('form');
		var $textarea = $form.find('textarea');
		var fields = [], $field, name, type;
		
		$form.find('input').each(function(index, input) {
			$field = $(this);
			name = $field.attr('name');
			type = $field.attr('type');
			if(typeof name !== 'string' || name === 'undefined' || type === 'button' || (type === 'submit' && $field.val() !== 'Save')) { return true; }
			fields.push({
				name: name,
				value: $field.val(),
				isFile: type === 'file'
			});
		});
		return {
			action: $form.attr('action'),
			textarea: $textarea.attr('name'),
			fields: fields
		}
	},
	_get: function(postId, callback) {
		if(this.attempts > 2) {
			console.error('Exceeded login attempts');
			return;
		}
		this.attempts++;
		var self = this;
		request(this.root+'/node/'+postId+'/edit?destination=close-modal', function(error, response, body) {
			var statusCode = (response) ? response.statusCode : '000';
			if(error || statusCode != 200) { console.error('[' + statusCode + '] ' + (error || 'Could not retrieve post')); return; }
			if(cas.isLoginPrompt(response)) {
				cas.login(body, function() { self._get(postId, callback); });
			} else {
				self.attempts = 0;
				callback.call(this, response, body);
			}
		});
	},
	_post: function(data, text, callback) {
		var form = new FormData();
		var options, headers;

		// This isn't ideal, but have to build up the form once to get the length, then append it again to requests form
		this.apply(form, data, text);
		
		/* I don't believe this works because it doesn't have the cookies from request
		form.submit(this.root+data.action, function(err, resp) {
			if(err) {
				console.error(err || resp || 'Submit Error');
			}
			console.log(resp);
		});
		*/

		headers = _.extend({ 'Content-Length': form.getLengthSync() }, form.getCustomHeaders());
		options = {
			url: this.root+data.action,
			headers: headers
		};
		
		var r = request.post(options, function(error, response, body) {
			var statusCode = (response) ? response.statusCode : '000';
			if(error || (statusCode != 200 && statusCode != 302)) {
				console.error('['+statusCode+'] ' + (error || 'Could not post data'));
				console.log(response);
				return;
			}
			callback();
		});
		form = r.form();

		// Applying again to requests form
		this.apply(form, data, text);
	},
	apply: function(form, data, text) {
		_.each(data.fields, function(item, index) {
			if(item.isFile) {
				form.append(item.name, '', {
					filename:'',
					contentType:'application/octet-stream',
					knownLength:0
				})
			} else {
				form.append(item.name, item.value);
			}
		});
		form.append(data.textarea, text);
	}
};



prompt.message = '> ';
prompt.delimiter = '';
prompt.colors = false;
prompt.start();
prompt.get([
	{
		name: 'username',
		description: 'Username:',
	},
	{
		name: 'password',
		description: 'Password:',
		hidden: true,
		required: true
	},
	{
		name: 'postId',
		description: 'Post ID:'
	}
], function(err, result) {
	cas = new CAS('https://cas.vml.com', result.username, result.password);
	if(result.postId) {
		var folder = 'posts';
		var file = folder + '/' + result.postId+'.md';		
		//exec('rm ' + file);
		Passport.get(result.postId, function(response) {
			fs.exists(folder, function(exists) {
				if(!exists) {
					fs.mkdirSync(folder);
				}
				fs.writeFile(file, response, function(err) {
					if(err) {
						console.error('Could not write file', err);
						return;
					}
					exec('open ' + file);
					fs.watchFile(file, function(curr, prev) {
						// TODO Potentially check if there is a newer version and if the file really changed
						fs.readFile(file, 'utf-8', function(err, text) {
							Passport.put(result.postId, text);
						});
					});
				});
			});
		});
	}
});

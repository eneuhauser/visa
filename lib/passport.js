var _ = require('lodash'),
	request = require('request').defaults({jar: true}),
	FormData = require('form-data'),
	cheerio = require('cheerio');


/**
 * Serializes the form in the DOM to name/value pairs and identifies the form
 * action and textarea name.
 * @param {Cheerio} $ the DOM loaded into Cheerio.
 * @return {Object} with the action, textarea name, and input name/value pairs.
 */
function serialize($) {
	var $form = $('form');
	var $textarea = $form.find('textarea');
	var fields = [], $field, name, type;
	
	$form.find('input').each(function(index, input) {
		$field = $(this);
		name = $field.attr('name');
		type = $field.attr('type');
		if(typeof name !== 'string' || name === 'undefined'
				|| type === 'button'
				|| (type === 'checkbox' && $field.attr('checked') !== 'checked')
				|| (type === 'submit' && $field.val() !== 'Save')) {
			return true;
		}
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
}
/**
 * Applies the data to the form and set the text to the textarea field.
 * @param {FormData} form the form to append name/values.
 * @param {Object} data serialized form data.
 * @param {String} text text to post in the text area field.
 * @return {void}
 */
function apply(form, data, text) {
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

function Passport() { this.init.apply(this, arguments); }
_.extend(Passport.prototype, {
	root: 'http://passport.vml.com',
	init: function(cas) {
		this.cas = cas;
		this.attempts = 0;
		this.posts = {};
	},
	getPost: function(postId, callback) {
		var posts = this.posts;
		this._get(this.getPostUrl(postId), function(response, body) {
			var $ = cheerio.load(body);
			posts[postId] = serialize($);
			if(callback) {
				callback($('textarea').val());			
			}
		});
	},
	getPostUrl: function(postId) {
		return this.root+'/node/'+postId+'/edit?destination=close-modal';
	},
	putPost: function(postId, post) {
		var data = this.posts[postId];
		var self = this;
		var callback = function() {
			console.log('Updated Post ' + postId + '!');
			// Needs to be retrieved again to update the data
			self.getPost(postId);
		}
			
		if(!data) {
			this._get(this.getPostUrl(postId), function(response, body) {
				var $ = cheerio.load(body);
				self._put(serialize($), post, callback);
			});
		} else {
			this._put(data, post, callback);
		}
	},
	_get: function(url, callback) {
		if(this.attempts > 2) {
			console.error('Exceeded login attempts');
			return;
		}
		this.attempts++;
		var self = this;
		request(url, function(error, response, body) {
			var statusCode = (response) ? response.statusCode : '000';
			if(error || statusCode != 200) { console.error('[' + statusCode + '] ' + (error || 'Could not retrieve post')); return; }
			if(self.cas.isLoginPrompt(response)) {
				self.cas.login(body, function() { self._get(url, callback); });
			} else {
				self.attempts = 0;
				callback.call(this, response, body);
			}
		});
	},
	_put: function(data, text, callback) {
		var form = new FormData();
		var options, headers;

		// This isn't ideal, but have to build up the form once to get the length, then append it again to requests form
		apply(form, data, text);
		
		/*
		 * I don't believe this works because it doesn't have the cookies from
		 * request.
		 * - Could potentially use the cookies from request to set in the
		 *   FormData header.
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
		apply(form, data, text);
	}
});

module.exports = Passport;

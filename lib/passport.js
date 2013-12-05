var _ = require('lodash'),
	request = require('request').defaults({jar: true}),
	FormData = require('form-data'),
	cheerio = require('cheerio');

var Field = {
	TITLE: 'title',
	TAGS: 'field_tags[und]',
	GROUPS: 'og_group_ref[und][]',
	STATUS: 'status',
	FORMAT: 'body[und][0][format]'
};
var Format = {
	HTML: 'full_html',
	FILTERED: 'filtered_html',
	TEXT: 'plain_text',
	MARKDOWN: 'full_html_no_wysiwyg'
};

var Group = null;

function PostForm() { this.init.apply(this, arguments); }
_.extend(PostForm.prototype, {
	init: function(action, textarea, fields) {
		this.action = action;
		this.textarea = textarea;
		this.fields = fields || [];
	},
	val: function(name, value) {
		var field = _.find(this.fields, function(field) { return field.name === name; });
		if(arguments.length === 1) { return (field) ? field.value : null; }
		if(!field) {
			this.fields.push({ name:name, value:value, isFile:false });
			return;
		}
		field.value = value;
	},
	remove: function(name) {
		this.fields = _.filter(this.fields, function(field) { return field.name !== name; });		
	},
	clone: function() {
		var fields = _.union([], this.fields);
		return new PostForm(this.action, this.textarea, fields);
	}
});
/**
 * Serializes the form in the DOM to name/value pairs and identifies the form
 * action and textarea name.
 * @param {Cheerio} $ the DOM loaded into Cheerio.
 * @return {Object} with the action, textarea name, and input name/value pairs.
 */
function serialize($) {
	var $form = $('form');
	var $textarea = $form.find('textarea');
	var fields = [], $field, name, type, value;
	
	$form.find('input,select').each(function(index, input) {
		$field = $(this);
		name = $field.attr('name');
		type = $field.attr('type') || '';
		if(typeof name !== 'string' || name === 'undefined'
				|| type === 'button'
				|| (type === 'checkbox' && $field.attr('checked') !== 'checked')
				|| (type === 'submit' && $field.val() !== 'Save')) {
			return true;
		}
		value = $field.val();
		fields.push({
			name: name,
			value: value,
			isFile: type === 'file'
		});

		if(Group !== null || name !== Field.GROUPS) { return true; }
		
		Group = [];
		$field.find('option').each(function() {
			var $option = $(this);
			Group[$option.val()] = $option.html();
		});
	});

	return new PostForm($form.attr('action'), $textarea.attr('name'), fields);
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
			});
		} else if(_.isArray(item.value)) {
			_.each(item.value, function(value, index) {
				form.append(item.name, value);
			});
		} else {
			form.append(item.name, item.value);
		}
	});
	form.append(data.textarea, text);
}

function Passport() { this.init.apply(this, arguments); }
_.extend(Passport.prototype, {
	root: 'http://passport.vml.com',
	init: function(cas, hideMetaData) {
		this.cas = cas;
		this.attempts = 0;
		this.posts = {};
		this.showLogin = false;
		this.hideMetaData = hideMetaData;
	},
	createPost: function() {
		var self = this;
		this.getPost('new', function() {
			if(this.showLogin) {
				console.log('logged in');
			}
			self.posts.new.val(Field.FORMAT, Format.MARKDOWN);
		});
		return this.deserializeMetadata(new PostForm());
	},
	getPost: function(postId, callback) {
		var self = this;
		this._get(this.getPostUrl(postId), function(response, body) {
			var $ = cheerio.load(body);
			var data, text;
			data = serialize($);
			self.posts[postId] = data;
			if(callback) {
				text = $('textarea').val();
				if(!self.hideMetaData) {
					text = self.deserializeMetadata(data, text);
				}
				callback(text);			
			}
		});
	},
	getPostUrl: function(postId) {
		if(postId === 'new') {
			return this.root + '/node/add/post?destination=close-modal';
		}
		return this.root+'/node/'+postId+'/edit?destination=close-modal';
	},
	addPost: function(post, callback) {
		var self = this;
		if(!this.posts.new) {
			console.log('Still logging in. Please try again after login');
			this.showLogin = true;
		}
		// FIXME Wait until logged in
		this.putPost('new', post, function(response, body) {
			var statusCode = (response) ? response.statusCode : '000';			
			if(body || statusCode != 302) {
				console.log('['+statusCode+'] Unable to create post', body);
				return;
			}
			self._get(response.headers.location, function(response, body) {
				var postId = /\"route\":\"post\\\/(\d+)\"/.exec(body)[1];
				// FIXME Get postId
				console.log('Created post ' + postId + '! ' + self.root + '/ui/post/' + postId);
				if(callback) {
					callback(postId);
				}
			});
		});
	},
	putPost: function(postId, post, callback) {
		var data = this.posts[postId];
		var self = this;

		if(!data) {
			this.getPost(postId, function() {
				// WARNING: There could be a weird condition that would cause an infinite loop
				self.putPost(postId, post, callback);
			});
			return;
		}
		if(postId === 'new') { data = data.clone(); }
		post = self.serializeMetadata(data, post);
		if(!data.val(Field.TITLE)) {
			console.error('Please enter a title');
			return;
		}
		this._put(data, post, function(response, body) {
			if(postId !== 'new') {
				console.log('Updated Post ' + postId + '!');
				// Needs to be retrieved again to update the data
				self.getPost(postId);
			}
			if(callback) {
				callback(response, body);
			}
		});
	},
	/**
	 * Takes the metadata in the post and applies it to the data. The data
	 * object will be updated and the cleaned post will be returned.
	 * @param {Map} data form data about the post.
	 * @param {String} post text of the post with metadata section.
	 * @return {String} the post without the metadata and data updated to the instance.
	 */
	serializeMetadata: function(data, post) {
		var metadata = {};
		var regex = /^\s*(Title|Affiliation|Keywords|Format):(?: +(.*?)[\r\n]+)?([.\s\S]*)/;
		var nextLine = /^ +(.+?)(?:[\r\n]+([.\s\S]*))/;
		var parse, type, value;
		while(regex.test(post)) {
			parse = regex.exec(post);
			type = parse[1].toLowerCase();
			value = parse[2];
			post = parse[3];
			while(nextLine.test(post)) {
				parse = nextLine.exec(post);
				value += ', ' + parse[1];
				post = parse[2];
			}
			metadata[type] = value;
		}
		if(metadata.title) {
			data.val(Field.TITLE, metadata.title);
		}
		if(metadata.affiliation) {
			// FIXME May need to lookup group ID from name
			data.val(Field.GROUPS, metadata.affiliation.replace(/[^\d]*(\d+)\s*\)?\s*(,?)/g, '$1$2').split(','));
		}
		if(metadata.keywords) {
			data.val(Field.TAGS, metadata.keywords);
		}
		if(metadata.format) {
			if(metadata.format.toLowerCase() === 'draft') {
				data.remove(Field.STATUS);
			} else {
				data.val(Field.STATUS, 1);
			}
		}
		return post;
	},

	/**
	 * Takes the data and creates a metadata section in the post.
	 * @param {Map} data form data about the post.
	 * @param {String} post text of the post.
	 * @return {String} the post with the metadata taken from the data.
	 */
	deserializeMetadata: function(data, post) {
		var NEW_LINE = '\r\n', metadata = [], groupIds, groups = [];
		
		groupIds = data.val(Field.GROUPS);
		_.each(groupIds, function(id, index) {
			groups.push((Group && Group[id]) ? Group[id] + ' (' + id + ')' : id);
		});
		metadata = [
			'Title: ', data.val(Field.TITLE), NEW_LINE,
			'Affiliation: ', groups.join(NEW_LINE + '             '), NEW_LINE,
			'Keywords: ', data.val(Field.TAGS), NEW_LINE,
			'Format: ', (data.val(Field.STATUS) ? 'complete' : 'draft'), NEW_LINE
		];
		return metadata.join('') + NEW_LINE + (post || '');
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
		var options, headers, self = this;

		// This isn't ideal, but have to build up the form once to get the length, then append it again to requests form
		apply(form, data, text);
		
		/*
		 * This does not work because it doesn't have the cookies from request.
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
				return;
			}
			if(body.indexOf('CAS Authentication wanted!') > -1) {
				console.log('CAS Authenticaiton wanted');
				self._get(options.url, function() {
					self._put(data, text, callback);
				});
			} else {
				callback(response, body);
			}
		});
		form = r.form();

		// Applying again to requests form
		apply(form, data, text);
	}
});

module.exports = Passport;

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

var Group = null;

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
	init: function(cas) {
		this.cas = cas;
		this.attempts = 0;
		this.posts = {};
		this.currentPost = {};
	},
	getPost: function(postId, callback) {
		var self = this;
		this._get(this.getPostUrl(postId), function(response, body) {
			var $ = cheerio.load(body);
			var data, text;
			data = serialize($);
			self.posts[postId] = data;
			if(callback) {
				text = self.deserializeMetadata(data, $('textarea').val());
				self.currentPost[postId] = text;
				callback(text);			
			}
		});
	},
	getPostUrl: function(postId) {
		return this.root+'/node/'+postId+'/edit?destination=close-modal';
	},
	putPost: function(postId, post) {
		var data = this.posts[postId];
		var self = this;
		if(this.currentPost[postId] === post) { return; }

		if(!data) {
			this.getPost(postId, function() {
				// WARNING: There could be a weird condition that would cause an infinite loop
				self.putPost(postId, post);
			});
		} else {
			post = self.serializeMetadata(data, post);
			this._put(data, post, function() {
				console.log('Updated Post ' + postId + '!');
				// Needs to be retrieved again to update the data
				self.getPost(postId);
			});
		}
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
			data[Field.TITLE] = metadata.title;
		}
		if(metadata.affiliation) {
			// FIXME May need to lookup group ID from name
			data[Field.GROUPS] = metadata.affiliation.replace(/[^\d]*(\d+)\s*\)?\s*(,?)/g, '$1$2').split(',');
		}
		if(metadata.keywords) {
			data[Field.TAGS] = metadata.keywords;
		}
		if(metadata.format) {
			if(metadata.format.toLowerCase() === 'draft') {
				delete data[Field.STATUS];
			} else {
				data[Field.STATUS] = 1;
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
		function getField(name) {
			return _.find(data.fields, function(field) { return field.name === name; });
		}
		function value(name) {
			var field = getField(name);
			return (field) ? field.value : '';
		}
		
		groupIds = value(Field.GROUPS);
		_.each(groupIds, function(id, index) {
			groups.push((Group && Group[id]) ? Group[id] + ' (' + id + ')' : id);
		});
		metadata = [
			'Title: ', value(Field.TITLE), NEW_LINE,
			'Affiliation: ', groups.join(NEW_LINE + '             '), NEW_LINE,
			'Keywords: ', value(Field.TAGS), NEW_LINE,
			'Format: ', (value(Field.STATUS) ? 'complete' : 'draft'), NEW_LINE
		];
		return metadata.join('') + NEW_LINE + post;
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
			callback();
		});
		form = r.form();

		// Applying again to requests form
		apply(form, data, text);
	}
});

module.exports = Passport;

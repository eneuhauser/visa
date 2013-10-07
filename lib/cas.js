var request = require('request').defaults({jar: true}),
	qs = require('querystring'),
	cheerio = require('cheerio'),
	_ = require('lodash');

function CAS() { this.init.apply(this, arguments); };
CAS.options = {
	login: '/cas/login'
};
_.extend(CAS.prototype, {
	init: function(domain, username, password, options) {
		var opt;
		this.domain = domain;
		if(typeof arguments[3] === 'object') {
			opt = arguments[3];
		}
		if(typeof arguments[1] === 'string') {
			this.username = arguments[1];
		} else if(typeof arguments[1] === 'object') {
			opt = arguments[1];
		}
		if(typeof arguments[2] === 'string') {
			this.password = arguments[2];
		} else if(typeof arguments[2] === 'object') {
			opt = arguments[2];
		}

		this.options = _.extend(CAS.options, opt);
	},
	isLoginPrompt: function(response) {
		var path = (response.req) ? response.req.path : null;
		if(!path) { return false; }
		return path.indexOf(this.options.login) === 0;
	},
	login: function(body, callback) {
		var $ = cheerio.load(body);
		var $inputs = $('input');
		var data = {};
		$inputs.each(function(index, item) {
			var $item = $(this);
			data[$item.attr('name')] = $item.attr('value');
		});
		data.username = this.username;
		data.password = this.password;
		this._login(data, callback);
	},
	_login: function(data, callback) {
		var postData = qs.stringify(data);
		var options = {
			url: this.domain + this.options.login,
			headers: {
				'Content-Length': postData.length
			}
		};
		request.post(options, function(error, resp, body) {
			var statusCode = (resp) ? resp.statusCode : '000';
			if(error || statusCode != 303) {
				console.error('[' + statusCode + '] ' + (error || 'Login Error'));
				return;
			}
			// Call the redirect location to get the session set
			request.get(resp.headers.location, callback);
		}).form(data);
	}
});

module.exports = CAS;

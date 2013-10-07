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
	CAS = require('./lib/cas'),
	Passport = require('./lib/passport'),
	prompt = require('prompt'),
	fs = require('fs'),
	exec = require('child_process').exec;

function Visa() { this.init.apply(this, arguments); }
_.extend(Visa.prototype, {
	init: function(cas) {
		this.passport = new Passport(cas);
	},
	post: function(postId) {
		var folder = 'posts';
		var file = folder + '/' + postId + '.md';		
		var passport = this.passport;
		var visa = this;
		fs.exists(folder, function(exists) {
			if(!exists) {
				fs.mkdirSync(folder);
			}
			passport.getPost(postId, function(response) {
				fs.writeFile(file, response, function(err) {
					if(err) {
						console.error('Could not write file', err);
						return;
					}
					exec('open ' + file);
					visa.watchPost(postId, file);
				});
			});
		});
	},
	watchPost: function(postId, file) {
		var passport = this.passport;
		fs.watchFile(file, function(curr, prev) {
			// TODO Potentially check if there is a newer version and if the file really changed
			fs.readFile(file, 'utf-8', function(err, text) {
				passport.putPost(postId, text);
			});
		});
	}
});

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
	var cas = new CAS('https://cas.vml.com', result.username, result.password);
	var visa = new Visa(cas);
	if(result.postId) {
		visa.post(result.postId);
	}
});

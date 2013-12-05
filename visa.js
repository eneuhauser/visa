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
	File = require('./lib/file'),
	exec = require('child_process').exec;

function Visa() { this.init.apply(this, arguments); }
Visa.POST_FOLDER = 'posts';
_.extend(Visa.prototype, {
	init: function(cas) {
		this.passport = new Passport(cas);
	},
	createPost: function() {
		var file = new File(Visa.POST_FOLDER + '/_' + new Date().getTime() + '.md');
		var passport = this.passport;
		var text = passport.createPost();
		file.loading = false;
		file.postId = null;
		file.write(text, function() {
			exec('open ' + file.path);
			file.onSave(function(text) {
				// TBD Potentially have promise save once loaded
				if(file.loading) { return; }
				if(file.postId) {
					passport.putPost(file.postId, text);
				} else {
					file.loading = true;
					passport.addPost(text, function(postId) {
						file.postId = postId;
						file.loading = false;
					});
				}
			});
		});
	},
	editPost: function(postId) {
		var file = new File(Visa.POST_FOLDER + '/' + postId + '.md');
		var passport = this.passport;
		passport.getPost(postId, function(response) {
			file.write(response, function() {
				exec('open ' + file.path);
				file.onSave(function(text) {
					// TODO Potentially check if there is a newer version and if the file really changed
					passport.putPost(postId, text);
				});
			});
		});
	}
});

prompt.colors = false;
prompt.get([
	{
		name: 'username',
		description: 'Username:',
		required: true
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
		visa.editPost(result.postId);
	} else {
		visa.createPost();
	}
});

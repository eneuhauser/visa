# Visa

A local node application to work with [VML's](http://www.vml.com) internal forum, Passport. Visa enables you to use your local Markdown editor to edit Passport posts.

## Installation

1. Ensure Node.js is installed on your machine
2. Download the application.
3. Run `npm install`

## Usage

1. From the installation directory, run `node visa.js`
2. Follow the prompts on the screen.
3. Whenever you save your document, the post will be updated.

## Future Enhancements

+ Include meta data to update title, tags, etc using MultiMarkdown syntax
+ Create new posts
+ On startup, read the *posts* directory looking for any `\d+.md` files to watch
+ After retrieving one post, have a prompt ready to ask for another.
+ Update bio pages

## Markdown Editors

+ [Mou](http://mouapp.com/)
+ [ByWord](http://bywordapp.com/)
+ [78 more](http://mashable.com/2013/06/24/markdown-tools/)

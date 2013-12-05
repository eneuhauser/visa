# Visa

A local node application to work with [VML's](http://www.vml.com) internal forum, Passport. Visa enables you to use your local Markdown editor to edit Passport posts.

## Installation

1. Ensure Node.js is installed on your machine
2. Download the application.
3. Run `npm install`

## Usage

1. From the installation directory, run `node visa`
2. Follow the prompts on the screen. To create a new post, leave the Post ID empty.
3. Whenever you save your document, the post will be updated.
4. To quite Visa, press `ctrl`+`c`

## Features

+ Now able to create new posts by leaving the post ID blank.
+ **Metadata Support:** the following metadata attributes are supported. Metadata must be the first line of the file and listed until the first empty line.
  - **Title:** Post Title
  - **Affiliation:** Post Group(s). Includes full group name. Comma or line separated. Requires Group ID to set the group.
  - **Keywords:** Post tags. Comma or line separated.
  - **Format:** If set to *draft*, saved as not published; otherwise, published.

## Known Issues

+ Posts are sometimes saved to Passport without saving the file. This is an issue with Nodes [fs.watchFile](http://nodejs.org/api/fs.html#fs_fs_watchfile_filename_options_listener).
+ Markdown format not being set on new files

## Future Enhancements

+ On startup, read the *posts* directory looking for any `\d+.md` files to watch
+ After retrieving one post, have the prompt ready to ask for another.
+ Update bio pages. Pass **bio** as the post ID to load the bio page. Files marked **bio.md** will be saved to user's bio page.

## Markdown Editors

+ [Mou](http://mouapp.com/)
+ [ByWord](http://bywordapp.com/)
+ [78 more](http://mashable.com/2013/06/24/markdown-tools/)

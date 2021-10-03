---
title: Methods of Starting a Quick HTTP Server from the Command Line (alternatives to liveserver)
date: "2021-10-03T12:12:03.284Z"
description: For simple web development
---

If you are developing in VSCode it's quite typical that you'd be using the live-server extension to spin-up a quick development server. A few reasons sometimes you may not want to use liveserver.

- It injects code into the file running that may create bugs where there is none

- your not using VSCode

- For some reason the extension isn't showing up in the menu making it less convienient

In that case, the command line to the rescure, as there are several one line commands you can run to spin up a quick webserver for basic static file serving from a particular folder. Just navigate to that particular folder in terminal and run this command and now you can see those files served in the browser.

Likely you have one of the following installed or pre-installed on your computer, just run the following commands to see what you have.

- `python -v` do you have pythong installed and what version

- `php -v` do you have pythong installed and what version

- `node -v` do you have pythong installed and what version

- `ruby -v` do you have pythong installed and what version

## Python

```
# If Python version returned above is 3.X
# On Windows, try "python -m http.server" or "py -3 -m http.server"
python3 -m http.server

# If Python version returned above is 2.X
python -m SimpleHTTPServer
```

## Ruby

- If you have ruby installed, first install webrick `gem install webrick`
- then this command will start a server on port 8000 `ruby -run -e httpd . -p 8000`

## Node

- `npx lite-server` will start server on localhost:3000
- `npx http-server` will start server localhost:8080
- `npx serve` will start server on localhost:5000

## PHP

- `php -S localhost:5000` will start a server on localhost:5000

## More

- [This github gist covers even more options for Perl, Erlang and more!](https://gist.github.com/willurd/5720255)


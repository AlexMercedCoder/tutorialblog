---
title: Ultimate Basic Coder Reference (Bash, Git, VSCode, Nodejs, more)
date: "2020-09-05T22:12:03.284Z"
description: "The Basics We Should all know"
---

## About

The goal of this guide is to have a lot of the stuff that coders may want to look up all the time with some of the most universally used tools.

## Community

One of the best ways to grow and learn as a developer is to be part of the grander developer community, there are endless slack and discord channels to join. devNursery.com is a website where I have many playlists of videos I've made on every topic you can imagine, we have two communities you can join to meet other developers and to seek or provide mentorship.

devNursery slack channel = https://join.slack.com/t/amwebdev/shared_invite/enQtNzc4NDA3MDU3MDE0LTZjNjIyZmQ3MzA5Y2Q3MWUwZjk3NTIyYjliOThlMWFjNTFkYWM1OGUxN2Y3NGExNGVhOGIzZTg0YTJjZTk5NDA

devNursery discord channel = https://discord.gg/hkdrPwX

devNursery spectrum chat = https://spectrum.chat/devnursery?tab=posts

## Bash

The Bash terminal comes out of the box in unix based systems like Macs and Linux. On windows to use bash you can either download git-bash or use Windows Subsystem for Linux (WSL) to have a Linux environment within your windows install. Having access to the bash shell is a must for any developers workflow.

### Basic Commands

`mkdir folderName` create a folder

`touch fileName` create a file

`rm -r folderName` remove folder

`rm fileName` remove file

`mv filename newFolder/filename` move a file

`cp filename filenamecopy` make a copy of the file

`cat filename` print file contents to terminal

`ssh-keygen` generate an SSH key (usually done in the ~/.ssh folder)

`>` take output of command on left and write to file on the right

`>>` take output of command on left and append to file on the right

`alias delfold="rm -r"` give a command an alias, only lasts for that terminal session, to make it permanent add command to ~/.bashrc, ~/.bash_profile or ~/.profile

### ~/.bashrc, ~/.bash_profile or ~/.profile

Depending on the particular setup for your bash one or more of these files are read whenever a terminal session begins. This is where updates to your path, aliases, functions and other things you want to always happen should be placed.

### nano, vi, vim

nano, vi and vim are text editors that accessible within the Bash terminal, they may come already installed or you may need to install them. To edit files with these the commands are pretty straightforward

`nano filename`
`vi filename`
`vim filename`

When connecting to a web server where there is no GUI these are usually your main option for editing files.

## VSCode

Visual Studio Code is the free text editor from Microsoft that is packed with great features and shortcuts to make development more pleasant. Here are some of the most popular command.

- `ctrl+/` comment or uncomment code
- hold `alt` and set multiple insertion points
- `ctrl+s` save

### Extensions

VSCode also has a huge library of extensions that make life better such as...

- live server: spin a static web server from any folder
- peacock: have different VSCode windows in different colors
- Rainbow Brackets: Color your curly and square brackets
- auto-rename: Auto rename closing tags when editing opening html tags
- auto-close: Auto generate the closing tag for html tags
- Prettier: Auto format your code
- Live-share: work on the same code at the same time
- Gitlens: supercharge the git features in VSCode
- SQLtools: Explore and manage databases from VSCode
- Remote - SSH: Work with files from a remote server as if they were on your pc
- Better Comments: More colorfule comments in your code
- Polacode: tool for better screenshots

## Git

Versioning software for keeping track of versions of your project. Most used for code but can keep track of versions of any files.

### Rules to Keep in Mind

- Don't make a git repository inside of another repository
- One code project, one repository
- the root of the repository should be the root of your project, which is where the main project files are located (package.json, Gemfile, manage.py, composer.json)

### Commands

`git init` initialize a new git repository

`git add .` add all files in the current folder and its subfolders to staging

`git commit -m "a message"` commit files currently in staging

`git status` red files are changed files not in staging, green are in staging

`git remote` list projects remote repositories (github, gitlab, bitbucket, heroku)

`git remote add remoteName remoteURL` add the url as a remote under the specified name

`git remote rm remoteName` remove the particular remote

`git push remoteName branchName` push code of a particular branch to the remote

`git pull remoteName branch` pull code of a particular branch from the remote

`git checkout -b branchName` create a new branch, starts as copy of current branch

`git branch` list all branches and mark current branch

`git checkout branchName` switch to specified branch

`git merge branchName` merge specified branch into current branch

## NodeJS

NodeJS allows you to run javascript files outside of the browser to create web servers, web scrapers, scripts, and anything else you can think of. Below are many of the nodeJS command you should know.

### commands

`node filename` run the specified javascript file

`npm init -y` start a new node project by create a package.json file

`npm install packageName` install the specified package to your project

`npm install -g packageName` install the specified package globally so all project can use it (use rarely)

`npm install --save-dev packageName` install the specified package as a development dependency (won't install in a production environment)

`npm install` install all dependencies listed in package.json

`npm run scriptName` run particular script specified in package.json

`npm start` will run start script, if there isn't one will default to "node server.js"

### The process object

Running a node script represents a single process on your computer, to give you access to information about your process a `process` object is available to all script run with node. You can see all its contents with `console.log(process)`

A couple of useful parts to know...

#### Environment Variables (process.env)

You can pass variable into the process.env object like so.

`MYVAR=5 node server.js`

you can access this variable in this script like this...

`console.log(process.env.MYVAR)`

*libraries like dotenv allow you to specify environment variables in a special .env file which will then add these variables to process.env when the script starts*

#### Argument Variables (process.argv)

You can pass arguments into your scripts like

`node server.js "my argument"`

All the arguments get passed into an array at process.argv. The first two element of array are file references so the first argument is at `process.argv[2]`.

### Packages worth installing globally

`npm install -g lite-server`
Allows you to generate a static web server in the current folder with the command `lite-server`

`npm install -g nodemon`
You can run a file but nodemon will watch for changes in any javascript or json files and auto re-run the file on changes (great for servers)
`nodemon server.js`

## Other

- Stackoverflow.com is great resources for any and all problems

- HackerRank.com and CodeWars.com are great places to practice code

- Generalassemb.ly is a great place to enroll in a coding bootcamp if switching careers, they also often schedule free workshops and social events.

- Repl.it is a great place to test out new languages before install on your machine

- Codepen.com another great site to test html/css/js ideas

- RunKit.com is a place to prototype NodeJS project

- For places to deploy your project checkout this blog post with a comprehensive list => https://tuts.alexmercedcoder.com/deploy/

- Find videos on the basics of git, vscode, bash and more at intro.alexmercedcoder.com

- Trello, Notion.so, Asana, Airtable, and Google Docs are great tools for project management and team coordination

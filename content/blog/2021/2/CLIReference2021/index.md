---
title: Ultimate Command Line Reference 2021 - Bash, Git, Node, Python, Ruby, PHP
date: "2021-02-05T12:12:03.284Z"
description: All the commands you'll need all the time
---

---
# Bash Terminal
---

## Basic Terminal

- list all files `ls -la`
- change directories `cd folderName`
- display current dir `pwd`
- remove file `rm filename`
- remove directory `rm -rf directory`
- print contents of file `cat filename`
- directory `mkdir directoryName`
- make file `touch filename`
- go up a directory `cd ..`
- go back to home directory `cd ~`

## Special
- Kill a Port `sudo kill -9 $(sudo lsof -t -i:3000)`

---
# Git
---

## Git Commands
- new git repo `git init`
- clone remote repo `git clone repourl`
- add to staging `git add filename`
- git commit `git commit -m "message"`
- push to remote repo `git push remoteName BranchName`
- pull from remote repo `git pull remoteName BranchName`
- list branches `git branch`
- switch branches `git checkout branchName`
- create branch `git checkout -b branchName`
- delete branch `git checkout -d branchName`
- see commit log `git log`
- see staged files `git status`
- fetch updated list of remote branches `git fetch`
- add remote `git remote add remoteName remoteURL`
- remove remote `git remote rm remoteName`
- list remotes `git remote -v`
- create new commit reverting to old commit `git revert commitHash`
- move back to old commit removing prior commits ` git reset commitHash`

---
# NodeJS
---
## NPM Commands
- new package.json file `npm init -y`
- install new library `npm install libName`
- install all libraries in package.json `npm install`
- run script from package.json `npm run scriptName`
- uninstall library `npm uninstall libName`
- install library globally `npm install -g libName`

---
# Terminal Text Editors
---
## Nano (Terminal Text Editor)
- Open file in nano `nano filename`
- Exit and save changes `ctrl + x`

## VIM (Terminal Text Editor)
- Open file in VIM `vim fileName`
- go to insert mode `i`
- exit insert mode `esc`
- save and exit `:wq`

---
# Ruby
---
## Ruby Gem
- Install a Gem `gem install gemName`
- List all installed Gems `gem list`
- Uninstall a Gem `get ininstall gemName`
- Update Gems `gem update`
- Clean Old Gem Versions `gem cleanup`

## Bundler
- Install Bundler `gem install bundler`
- Install all Gems in a Gemfile `bundle install`
- Update all listed Gems `bundle update --all`

## Ruby on Rails
- new rails project `rails new projectName`
- new rails API `rails new --api projectName`
- new rails project with postgres `rails new -d postgresql`
- new rails without git `rails new --skip-git`
- new rails without yarn `rails new --skip-yarn`
- run dev server `rails server`
- Ruby Console with Models Loaded `rails console`
- DB Console for Project DB `rails dbconsole`
- See all project routes `rails routes`
- generate model/controller/resource/scaffold `rails generate generatorName nameOfThing`
- create db `rails db:create`
- run migrations `rails db:migrate`
- reset database `rails db:reset`
- rollback last migration `rails db:rollback`
- seed the database `rails db:seed`
- drop the database `rails db:drop`

---
Python
---
## PIP
- install a package `pip install packageName`
- list all installed packages `pip list`
- uninstall a package `pip uninstall packageName`
- generate requirements.txt `pip freeze > requirements.txt`

## Django
- new django project `django-admin startproject projectName`
- new app in project `django-admin startapp projectName`
- run dev server `python manage.py runserver`
- create migrations `python manage.py makemigrations`
- run migrations `python manage.py migrate`
- create a superuser `python manage.py createsuperuser`

---
PHP
---

## PHP CLI
- Run a php file in terminal `php filename`
- start a web server in current folder `php -S localhost:####`

## Composer
- Install libraries from composer.json `php composer.phar install`

## Laravel
- Create New Project `composer create-project laravel/laravel`
- run dev server `php artisan serve`
- run db console `php artisan db`
- new migration `php artisan make:migration migration_name`
- run mgirations `php artisan migrate`
- rollback last migration `php artisan migrate:rollback`
- reset all migrations `php artisan migrate:reset`
- reset and rerun migrations `php artisan migrate:refresh`
- drop all tables and migrate `php artisan migrate:fresh`
- create seed `php artisan make:seeder seederName`
- running seeds `php artisan db:seed`
- make a controller `php artisan make:controller controllerName`
- make a model `php artisan make:model modelName`